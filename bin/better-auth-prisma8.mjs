#!/usr/bin/env node

import { resolve } from "node:path";

import { generateModelMap } from "../dist/generator/index.js";

const help = `better-auth-prisma8 generate [options]\n\nOptions:\n  --contract <path>   Prisma 8 emitted contract.json\n  --output <path>     Generated TypeScript file\n  --db-import <path>  Import specifier for your Prisma 8 db module\n  --runtime-import    Adapter runtime import (advanced)\n  -h, --help          Show this help\n`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  process.stdout.write(help);
  process.exit(0);
}

if (args.shift() !== "generate") {
  process.stderr.write("Expected the generate command.\n\n" + help);
  process.exit(1);
}

const options = {};
while (args.length > 0) {
  const flag = args.shift();
  const value = args.shift();
  if (!value || !flag?.startsWith("--")) {
    process.stderr.write(`Missing value for ${flag ?? "argument"}.\n`);
    process.exit(1);
  }
  options[flag.slice(2)] = value;
}

const contract = options.contract;
const output = options.output;
const dbImport = options["db-import"];
if (!contract || !output || !dbImport) {
  process.stderr.write("--contract, --output, and --db-import are required.\n\n" + help);
  process.exit(1);
}

await generateModelMap({
  contractPath: resolve(contract),
  outputPath: resolve(output),
  dbImport,
  ...(options["runtime-import"] ? { runtimeImport: options["runtime-import"] } : {}),
});

process.stdout.write(`Generated ${resolve(output)}\n`);
