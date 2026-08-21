import { describe, expect, it } from "vitest";

import { renderModelMap } from "../src/generator/index.js";
import type { Prisma8ContractJson } from "../src/generator/types.js";

const contract: Prisma8ContractJson = {
  roots: {
    session: { model: "Session", namespace: "public" },
    user: { model: "User", namespace: "public" },
  },
  domain: {
    namespaces: {
      public: {
        models: {
          Session: {
            relations: {
              user: { to: { model: "User", namespace: "public" } },
            },
          },
          User: {
            relations: {
              sessions: { to: { model: "Session", namespace: "public" } },
            },
          },
        },
      },
    },
  },
};

describe("model map generator", () => {
  it("maps contract roots and relation names", () => {
    const output = renderModelMap(contract, "../prisma/db.js");
    expect(output).toContain('client.orm["public"]["Session"]');
    expect(output).toContain('relations: {"user":"user"}');
    expect(output).toContain('relations: {"session":"sessions"}');
    expect(output).toContain('export const prisma8Models = createPrisma8Models(db)');
  });
});
