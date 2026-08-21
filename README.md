# Better Auth adapter for Prisma 8

‼️‼️‼️ Potentially unsafe code. This was AI Generated with Codex Sol 5.6 High and not yet audited for its functions.


An experimental PostgreSQL adapter that lets Better Auth use Prisma 8's contract-based ORM directly—without generating or emulating the Prisma 7 `PrismaClient` API.

> Prisma 8 is currently a release candidate. This package targets `@prisma-next/postgres` 0.16.x and Better Auth 1.7.x. Pin versions and read the limitations before deploying it.

## Install from GitHub

The package is ready to install directly from this repository:

```bash
npm install github:ejqs/better-auth-prisma8 better-auth@^1.7.1 @prisma-next/postgres@^0.16.0
```

## Generate the model map

First emit Prisma 8's contract after changing your schema:

```bash
npx prisma-next contract emit
```

Then generate the Better Auth model map:

```bash
npx better-auth-prisma8 generate \
  --contract src/prisma/contract.json \
  --output src/generated/better-auth-prisma8.ts \
  --db-import ../prisma/db.js
```

The generator reads contract roots and relations. It produces a small file containing mappings such as `user -> db.orm.public.User` and `session -> db.orm.public.Session`. Commit the generated file and regenerate it whenever the contract changes.

## Use it with Better Auth

```ts
import { betterAuth } from "better-auth";
import { prisma8Adapter } from "@ejqs/better-auth-prisma8";
import { prisma8Models } from "./generated/better-auth-prisma8.js";

export const auth = betterAuth({
  database: prisma8Adapter(prisma8Models),
});
```

No `PrismaClient` class and no `better-auth/adapters/prisma` import are involved.

## Transactions

The generated file also exports `createPrisma8Models`, so a Prisma 8 transaction context can get its own model map:

```ts
import { prisma8Adapter } from "@ejqs/better-auth-prisma8";
import { db } from "./prisma/db.js";
import {
  createPrisma8Models,
  prisma8Models,
} from "./generated/better-auth-prisma8.js";

const database = prisma8Adapter(prisma8Models, {
  transaction: (callback) =>
    db.transaction((transaction) =>
      callback(createPrisma8Models(transaction)),
    ),
});
```

## Manual model maps

Generation is optional. A manual map is useful for a small schema or custom relations:

```ts
import { definePrisma8Models, prisma8Adapter } from "@ejqs/better-auth-prisma8";
import { db } from "./prisma/db.js";

const models = definePrisma8Models({
  user: {
    collection: db.orm.public.User,
    relations: { session: "sessions", account: "accounts" },
  },
  session: {
    collection: db.orm.public.Session,
    relations: { user: "user" },
  },
  account: db.orm.public.Account,
  verification: db.orm.public.Verification,
});

export const database = prisma8Adapter(models);
```

## Supported operations

- Create, find one, find many, select, sort, offset, and limit
- Update one/many and delete one/many
- Count through Prisma 8 aggregate queries
- Better Auth joins through generated relation mappings
- Atomic consume-one through Prisma 8's `delete()` return value
- Better Auth transaction integration through an optional transaction wrapper

### Guarded numeric increments

Better Auth 1.7 requires an atomic `incrementOne` primitive. Prisma 8 0.16's public ORM can update literal values but does not expose arithmetic field updates. The adapter therefore refuses to fake this with a read-then-write race.

If a Better Auth plugin uses guarded counters, provide a native atomic hook for that model:

```ts
const models = definePrisma8Models({
  rateLimit: {
    collection: db.orm.public.RateLimit,
    async incrementOne({ where, increment, set }) {
      // Execute one UPDATE ... SET count = count + $delta ... RETURNING *
      // through a database-specific, parameterized Prisma 8 SQL plan.
      return runAtomicIncrement({ where, increment, set });
    },
  },
});
```

The hook must apply the `where` guard, signed increments, and optional `set` values in one database statement and return the updated row or `null`.

## Package exports

```ts
import { prisma8Adapter } from "@ejqs/better-auth-prisma8";
import { prisma8Adapter as runtimeOnly } from "@ejqs/better-auth-prisma8/runtime";
import { generateModelMap } from "@ejqs/better-auth-prisma8/generator";
```

## Development

```bash
npm install
npm run check
npm test
npm run build
npm pack --dry-run
```

## License

MIT
