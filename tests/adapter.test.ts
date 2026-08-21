import type { BetterAuthOptions } from "better-auth";
import { describe, expect, it, vi } from "vitest";

import {
  Prisma8AdapterCapabilityError,
  Prisma8AdapterError,
  prisma8Adapter,
} from "../src/runtime/index.js";
import { FakeCollection } from "./fake-prisma8.js";

const options = {
  user: {
    additionalFields: {
      active: { type: "boolean", required: true },
      remaining: { type: "number", required: true },
    },
  },
} as BetterAuthOptions;

describe("prisma8Adapter", () => {
  it("runs CRUD, sorting, pagination, and count through a model map", async () => {
    const rows = [
      { id: "1", email: "a@example.com", active: true },
      { id: "2", email: "b@example.com", active: true },
      { id: "3", email: "c@example.com", active: false },
    ];
    const adapter = prisma8Adapter({ user: new FakeCollection(rows) })(options);

    await adapter.create({
      model: "user",
      data: { id: "4", email: "d@example.com", active: true },
      forceAllowId: true,
    });
    const active = await adapter.findMany<{ id: string }>({
      model: "user",
      where: [{ field: "active", value: true }],
      sortBy: { field: "email", direction: "desc" },
      offset: 1,
      limit: 2,
      select: ["id"],
    });
    expect(active).toEqual([{ id: "2" }, { id: "1" }]);
    expect(await adapter.count({ model: "user", where: [{ field: "active", value: true }] })).toBe(3);

    expect(await adapter.updateMany({
      model: "user",
      where: [{ field: "active", value: false }],
      update: { active: true },
    })).toBe(1);
    expect(await adapter.deleteMany({
      model: "user",
      where: [{ field: "email", operator: "contains", value: "d@" }],
    })).toBe(1);
  });

  it("honors an explicit zero limit", async () => {
    const adapter = prisma8Adapter({
      user: new FakeCollection([{ id: "1" }, { id: "2" }]),
    })(options);

    expect(await adapter.findMany({ model: "user", limit: 0 })).toEqual([]);
  });

  it("resolves generated model names without trusting inherited properties", async () => {
    const adapter = prisma8Adapter({
      User: new FakeCollection([{ id: "1", email: "a@example.com" }]),
    })(options);
    expect(await adapter.findOne<{ id: string }>({
      model: "user",
      where: [{ field: "id", value: "1" }],
    })).toMatchObject({ id: "1" });

    const inherited = Object.create({
      user: new FakeCollection([{ id: "inherited" }]),
    }) as Record<string, FakeCollection>;
    const inheritedAdapter = prisma8Adapter(inherited)(options);
    await expect(inheritedAdapter.findOne({
      model: "user",
      where: [{ field: "id", value: "inherited" }],
    })).rejects.toBeInstanceOf(Prisma8AdapterError);
  });

  it("uses case-insensitive relation mappings without mutating Prisma rows", async () => {
    const rows = [{
      id: "1",
      sessions: [{ id: "session-1", userId: "1" }],
    }];
    const adapter = prisma8Adapter({
      User: {
        collection: new FakeCollection(rows),
        relations: { Session: "sessions" },
      },
      Session: new FakeCollection([]),
    })({
      ...options,
      advanced: { database: { joins: true } },
    });

    const user = await adapter.findOne<{ session: Array<{ id: string }> }>({
      model: "user",
      where: [{ field: "id", value: "1" }],
      join: { session: true },
    });
    expect(user?.session).toEqual([{ id: "session-1", userId: "1" }]);
    expect(rows[0]).not.toHaveProperty("session");
    expect(rows[0]).toHaveProperty("sessions");
  });

  it("rejects unsafe pagination values", async () => {
    const adapter = prisma8Adapter({ user: new FakeCollection([{ id: "1" }]) })(options);
    await expect(adapter.findMany({ model: "user", limit: -1 })).rejects.toBeInstanceOf(
      Prisma8AdapterError,
    );
  });

  it("atomically consumes only one matching row", async () => {
    const rows = [
      { id: "1", identifier: "token" },
      { id: "2", identifier: "token" },
    ];
    const adapter = prisma8Adapter({ verification: new FakeCollection(rows) })(options);
    const consumed = await adapter.consumeOne<{ id: string }>({
      model: "verification",
      where: [{ field: "identifier", value: "token" }],
    });
    expect(consumed?.id).toBe("1");
    expect(rows.map((row) => row.id)).toEqual(["2"]);
  });

  it("uses an explicit atomic increment hook", async () => {
    const hook = vi.fn(async ({ increment }) => ({ id: "1", remaining: 3 + increment.remaining! }));
    const adapter = prisma8Adapter({
      user: { collection: new FakeCollection([{ id: "1", remaining: 3 }]), incrementOne: hook },
    })(options);
    const updated = await adapter.incrementOne<{ remaining: number }>({
      model: "user",
      where: [{ field: "id", value: "1" }],
      increment: { remaining: -1 },
    });
    expect(updated?.remaining).toBe(2);
    expect(hook).toHaveBeenCalledOnce();
  });

  it("fails clearly when guarded increments are not configured", async () => {
    const adapter = prisma8Adapter({ user: new FakeCollection([{ id: "1", remaining: 3 }]) })(options);
    await expect(adapter.incrementOne({
      model: "user",
      where: [{ field: "id", value: "1" }],
      increment: { remaining: -1 },
    })).rejects.toBeInstanceOf(Prisma8AdapterCapabilityError);
  });
});
