import type { DBAdapterDebugLogOption, Where } from "better-auth/adapters";

export type UnknownRecord = Record<string, unknown>;

export interface Prisma8FieldAccessor {
  eq(value: unknown): unknown;
  neq(value: unknown): unknown;
  lt(value: unknown): unknown;
  lte(value: unknown): unknown;
  gt(value: unknown): unknown;
  gte(value: unknown): unknown;
  in(values: readonly unknown[]): unknown;
  notIn(values: readonly unknown[]): unknown;
  like(pattern: string): unknown;
  ilike(pattern: string): unknown;
  isNull(): unknown;
  isNotNull(): unknown;
  asc(): unknown;
  desc(): unknown;
}

export type Prisma8ModelAccessor = Record<string, Prisma8FieldAccessor>;

export interface Prisma8AggregateBuilder {
  count(): unknown;
}

export interface Prisma8Collection {
  // Deliberately loose: generated Prisma 8 collections have model-specific
  // overloads that cannot share one strict structural TypeScript interface.
  where(...args: any[]): any;
  select(...args: any[]): any;
  include(...args: any[]): any;
  orderBy(...args: any[]): any;
  take(...args: any[]): any;
  skip(...args: any[]): any;
  all(...args: any[]): any;
  first(...args: any[]): any;
  aggregate(...args: any[]): any;
  create(...args: any[]): any;
  update(...args: any[]): any;
  updateAll(...args: any[]): any;
  updateCount(...args: any[]): any;
  delete(...args: any[]): any;
  deleteAll(...args: any[]): any;
  deleteCount(...args: any[]): any;
}

export interface IncrementOneInput {
  collection: Prisma8Collection;
  where: Where[];
  increment: Record<string, number>;
  set?: Record<string, unknown> | undefined;
}

export interface Prisma8ModelBinding {
  collection: Prisma8Collection;
  /** Better Auth joined model name -> Prisma 8 relation name. */
  relations?: Record<string, string>;
  /**
   * Native, atomic guarded increment implementation for this model.
   * Prisma 8 RC does not yet expose arithmetic updates through its ORM.
   */
  incrementOne?: (input: IncrementOneInput) => Promise<UnknownRecord | null>;
}

export type Prisma8ModelMap = Record<
  string,
  Prisma8ModelBinding | Prisma8Collection
>;

export type Prisma8TransactionRunner = <Result>(
  callback: (models: Prisma8ModelMap) => Promise<Result>,
) => Promise<Result>;

export interface Prisma8AdapterConfig {
  debugLogs?: DBAdapterDebugLogOption;
  usePlural?: boolean;
  supportsNumericIds?: boolean;
  supportsUUIDs?: boolean;
  supportsArrays?: boolean;
  /** Optional Prisma 8 transaction wrapper that supplies transaction-bound models. */
  transaction?: Prisma8TransactionRunner;
}
