import { Where, DBAdapterDebugLogOption, DBAdapter } from 'better-auth/adapters';
import { BetterAuthOptions, Where as Where$1 } from 'better-auth';

type UnknownRecord = Record<string, unknown>;
interface Prisma8FieldAccessor {
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
type Prisma8ModelAccessor = Record<string, Prisma8FieldAccessor>;
interface Prisma8Collection {
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
interface IncrementOneInput {
    collection: Prisma8Collection;
    where: Where[];
    increment: Record<string, number>;
    set?: Record<string, unknown> | undefined;
}
interface Prisma8ModelBinding {
    collection: Prisma8Collection;
    /** Better Auth joined model name -> Prisma 8 relation name. */
    relations?: Record<string, string>;
    /**
     * Native, atomic guarded increment implementation for this model.
     * Prisma 8 RC does not yet expose arithmetic updates through its ORM.
     */
    incrementOne?: (input: IncrementOneInput) => Promise<UnknownRecord | null>;
}
type Prisma8ModelMap = Record<string, Prisma8ModelBinding | Prisma8Collection>;
type Prisma8TransactionRunner = <Result>(callback: (models: Prisma8ModelMap) => Promise<Result>) => Promise<Result>;
interface Prisma8AdapterConfig {
    debugLogs?: DBAdapterDebugLogOption;
    usePlural?: boolean;
    supportsNumericIds?: boolean;
    supportsUUIDs?: boolean;
    supportsArrays?: boolean;
    /** Optional Prisma 8 transaction wrapper that supplies transaction-bound models. */
    transaction?: Prisma8TransactionRunner;
}

declare function prisma8Adapter(models: Prisma8ModelMap, config?: Prisma8AdapterConfig): (betterAuthOptions: BetterAuthOptions) => DBAdapter;
declare function definePrisma8Models<const Models extends Prisma8ModelMap>(models: Models): Models;

declare class Prisma8AdapterError extends Error {
    name: string;
}
declare class Prisma8AdapterCapabilityError extends Prisma8AdapterError {
    name: string;
}

declare function conditionToPrisma8(fields: Prisma8ModelAccessor, condition: Where$1): unknown;
declare function applyWhere(collection: Prisma8Collection, where: Where$1[] | undefined): Prisma8Collection;

export { type IncrementOneInput, Prisma8AdapterCapabilityError, type Prisma8AdapterConfig, Prisma8AdapterError, type Prisma8Collection, type Prisma8FieldAccessor, type Prisma8ModelAccessor, type Prisma8ModelBinding, type Prisma8ModelMap, type Prisma8TransactionRunner, applyWhere, conditionToPrisma8, definePrisma8Models, prisma8Adapter };
