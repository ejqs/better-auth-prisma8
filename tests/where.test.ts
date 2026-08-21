import { describe, expect, it } from "vitest";

import { applyWhere } from "../src/runtime/where.js";
import { Prisma8AdapterError } from "../src/runtime/errors.js";
import { FakeCollection } from "./fake-prisma8.js";

describe("Prisma 8 where conversion", () => {
  const rows = [
    { id: "1", email: "Alice@example.com", age: 20, role: "admin" },
    { id: "2", email: "bob@example.com", age: 17, role: "user" },
    { id: "3", email: "carol@example.net", age: 30, role: "user" },
  ];

  it("combines AND conditions with an OR group", async () => {
    const result = await applyWhere(new FakeCollection([...rows]), [
      { field: "age", operator: "gte", value: 18, connector: "AND" },
      { field: "role", operator: "eq", value: "admin", connector: "OR" },
      { field: "email", operator: "ends_with", value: ".net", connector: "OR" },
    ]).all();
    expect((result as Array<{ id: string }>).map((row) => row.id)).toEqual(["1", "3"]);
  });

  it("supports case-insensitive string matching", async () => {
    const result = await applyWhere(new FakeCollection([...rows]), [
      { field: "email", operator: "starts_with", value: "alice", mode: "insensitive" },
    ]).all();
    expect((result as Array<{ id: string }>).map((row) => row.id)).toEqual(["1"]);
  });

  it("handles empty membership lists", async () => {
    expect(await applyWhere(new FakeCollection([...rows]), [
      { field: "id", operator: "in", value: [] },
    ]).all()).toEqual([]);
    expect(await applyWhere(new FakeCollection([...rows]), [
      { field: "id", operator: "not_in", value: [] },
    ]).all()).toHaveLength(3);
  });

  it("rejects a non-array membership value", () => {
    expect(() => applyWhere(new FakeCollection([...rows]), [
      { field: "id", operator: "in", value: "1" },
    ])).toThrow(Prisma8AdapterError);
  });
});
