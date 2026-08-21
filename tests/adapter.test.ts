import type { BetterAuthOptions } from "better-auth";
import { describe, expect, it, vi } from "vitest";

import {
  Prisma8AdapterCapabilityError,
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
