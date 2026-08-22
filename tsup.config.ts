import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "runtime/index": "src/runtime/index.ts",
    "generator/index": "src/generator/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["better-auth", "@prisma/orm-postgres"],
});
