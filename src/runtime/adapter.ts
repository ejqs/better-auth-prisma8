import { createAdapterFactory } from "better-auth/adapters";
import type {
  CleanedWhere,
  CustomAdapter,
  DBAdapter,
} from "better-auth/adapters";
import type { BetterAuthOptions, JoinConfig, Where } from "better-auth";

import {
  Prisma8AdapterCapabilityError,
  Prisma8AdapterError,
} from "./errors.js";
import { applyWhere } from "./where.js";
import type {
  Prisma8AdapterConfig,
  Prisma8Collection,
  Prisma8ModelBinding,
  Prisma8ModelMap,
  UnknownRecord,
} from "./types.js";

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isBinding(value: Prisma8ModelBinding | Prisma8Collection): value is Prisma8ModelBinding {
  return isObject(value) && Object.hasOwn(value, "collection");
}

function ownValue<T>(values: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(values, key) ? values[key] : undefined;
}

function caseInsensitiveOwnValue<T>(
  values: Record<string, T>,
  key: string,
  kind: string,
): T | undefined {
  const exact = ownValue(values, key);
  if (exact !== undefined) return exact;

  const matches = Object.keys(values).filter(
    (candidate) => candidate.toLowerCase() === key.toLowerCase(),
  );
  if (matches.length > 1) {
    throw new Prisma8AdapterError(
      `Ambiguous ${kind} ${key}; matching keys differ only by letter case.`,
    );
  }
  return matches[0] ? ownValue(values, matches[0]) : undefined;
}

function resolveBinding(models: Prisma8ModelMap, model: string): Prisma8ModelBinding {
  const value = caseInsensitiveOwnValue(models, model, "model");
  if (!value) {
    throw new Prisma8AdapterError(
      `Model ${model} is not mapped. Regenerate the model map or add it manually.`,
    );
  }
  return isBinding(value) ? value : { collection: value };
}

function resolveRelation(binding: Prisma8ModelBinding, joinedModel: string): string | undefined {
  return binding.relations
    ? caseInsensitiveOwnValue(binding.relations, joinedModel, "relation")
    : undefined;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Prisma8AdapterError(`${name} must be a non-negative safe integer.`);
  }
}

function affectedRowCount(value: unknown, operation: string): number {
  if (!Array.isArray(value)) {
    throw new Prisma8AdapterError(`${operation} did not return an array of affected rows.`);
  }
  return value.length;
}

function applySelect(collection: Prisma8Collection, select?: string[]): Prisma8Collection {
  return select?.length ? collection.select(...select) : collection;
}

function applyJoin(
  binding: Prisma8ModelBinding,
  collection: Prisma8Collection,
  join?: JoinConfig,
): { collection: Prisma8Collection; renames: Map<string, string> } {
  const renames = new Map<string, string>();
  let query = collection;
  for (const [joinedModel, config] of Object.entries(join ?? {})) {
    const relation = resolveRelation(binding, joinedModel);
    if (!relation) {
      throw new Prisma8AdapterCapabilityError(
        `Join ${joinedModel} is not mapped for this model. Regenerate the model map or configure relations manually.`,
      );
    }
    const limit = config.limit ?? 100;
    assertNonNegativeInteger(limit, `Join limit for ${joinedModel}`);
    query = query.include(relation, (related: Prisma8Collection) => related.take(limit));
    renames.set(relation, joinedModel);
  }
  return { collection: query, renames };
}

function renameJoins(row: UnknownRecord, renames: Map<string, string>): UnknownRecord {
  if (renames.size === 0) return row;
  const renamed = { ...row };
  for (const [relation, joinedModel] of renames) {
    if (relation !== joinedModel && Object.hasOwn(renamed, relation)) {
      Object.defineProperty(renamed, joinedModel, {
        configurable: true,
        enumerable: true,
        value: renamed[relation],
        writable: true,
      });
      delete renamed[relation];
    }
  }
  return renamed;
}

function createAdapter(
  models: Prisma8ModelMap,
  config: Prisma8AdapterConfig,
  options: BetterAuthOptions,
  inTransaction = false,
): DBAdapter {
  const factory = createAdapterFactory({
    config: {
      adapterId: "prisma-8",
      adapterName: "Prisma 8 Adapter",
      debugLogs: config.debugLogs ?? false,
      usePlural: config.usePlural ?? false,
      supportsDates: true,
      supportsBooleans: true,
      supportsJSON: true,
      supportsArrays: config.supportsArrays ?? true,
      supportsNumericIds: config.supportsNumericIds ?? true,
      supportsUUIDs: config.supportsUUIDs ?? true,
      transaction:
        !inTransaction && config.transaction
          ? async (callback) =>
              config.transaction!(async (transactionModels) => {
                const transactionAdapter = createAdapter(
                  transactionModels,
                  config,
                  options,
                  true,
                );
                return callback(transactionAdapter);
              })
          : false,
    },
    adapter: (): CustomAdapter => ({
      async create<T extends Record<string, unknown>>({
        model,
        data,
        select,
      }: {
        model: string;
        data: T;
        select?: string[] | undefined;
      }) {
        const binding = resolveBinding(models, model);
        return (await applySelect(binding.collection, select).create(data)) as T;
      },

      async findOne<T>({
        model,
        where,
        select,
        join,
      }: {
        model: string;
        where: CleanedWhere[];
        select?: string[] | undefined;
        join?: JoinConfig | undefined;
      }) {
        const binding = resolveBinding(models, model);
        let query = applyWhere(binding.collection, where);
        query = applySelect(query, select);
        const joined = applyJoin(binding, query, join);
        const row = await joined.collection.first();
        return row ? (renameJoins(row, joined.renames) as T) : null;
      },

      async findMany<T>({
        model,
        where,
        limit,
        select,
        offset,
        sortBy,
        join,
      }: {
        model: string;
        where?: CleanedWhere[] | undefined;
        limit: number;
        select?: string[] | undefined;
        offset?: number | undefined;
        sortBy?: { field: string; direction: "asc" | "desc" } | undefined;
        join?: JoinConfig | undefined;
      }) {
        const binding = resolveBinding(models, model);
        let query = applyWhere(binding.collection, where);
        query = applySelect(query, select);
        if (sortBy?.field) {
          query = query.orderBy((fields: Record<string, { asc(): unknown; desc(): unknown }>) => {
            const field = fields[sortBy.field];
            if (!field) throw new Prisma8AdapterError(`Unknown sort field ${sortBy.field}.`);
            return sortBy.direction === "desc" ? field.desc() : field.asc();
          });
        }
        assertNonNegativeInteger(offset ?? 0, "Offset");
        assertNonNegativeInteger(limit, "Limit");
        if (offset !== undefined) query = query.skip(offset);
        query = query.take(limit);
        const joined = applyJoin(binding, query, join);
        const rows = await joined.collection.all();
        return (rows as UnknownRecord[]).map(
          (row) => renameJoins(row, joined.renames) as T,
        );
      },

      async count({ model, where }) {
        const binding = resolveBinding(models, model);
        const result = await applyWhere(binding.collection, where).aggregate((aggregate: { count(): unknown }) => ({
          total: aggregate.count(),
        }));
        return Number(result.total ?? 0);
      },

      async update<T>({
        model,
        where,
        update,
      }: {
        model: string;
        where: CleanedWhere[];
        update: T;
      }) {
        if (!where.length) return null;
        const binding = resolveBinding(models, model);
        return (await applyWhere(binding.collection, where).update(
          update as UnknownRecord,
        )) as T | null;
      },

      async updateMany({ model, where, update }) {
        if (!where.length) return 0;
        const binding = resolveBinding(models, model);
        const rows = await applyWhere(binding.collection, where).updateAll(update);
        return affectedRowCount(rows, "updateMany");
      },

      async delete({ model, where }) {
        if (!where.length) return;
        const binding = resolveBinding(models, model);
        await applyWhere(binding.collection, where).delete();
      },

      async deleteMany({ model, where }) {
        if (!where.length) return 0;
        const binding = resolveBinding(models, model);
        const rows = await applyWhere(binding.collection, where).deleteAll();
        return affectedRowCount(rows, "deleteMany");
      },

      async consumeOne<T>({ model, where }: { model: string; where: Where[] }) {
        if (!where.length) return null;
        const binding = resolveBinding(models, model);
        return (await applyWhere(binding.collection, where).delete()) as T | null;
      },

      async incrementOne<T>({
        model,
        where,
        increment,
        set,
      }: {
        model: string;
        where: CleanedWhere[];
        increment: Record<string, number>;
        set?: Record<string, unknown> | undefined;
      }) {
        if (!where.length) return null;
        const binding = resolveBinding(models, model);
        if (!binding.incrementOne) {
          throw new Prisma8AdapterCapabilityError(
            `Model ${model} needs an atomic incrementOne hook. Prisma 8's ORM does not expose arithmetic updates yet.`,
          );
        }
        const collection = applyWhere(binding.collection, where);
        return (await binding.incrementOne({ collection, where, increment, set })) as T | null;
      },

      options: config,
    }),
  });
  return factory(options);
}

export function prisma8Adapter(
  models: Prisma8ModelMap,
  config: Prisma8AdapterConfig = {},
) {
  return (betterAuthOptions: BetterAuthOptions) =>
    createAdapter(models, config, betterAuthOptions);
}

export function definePrisma8Models<const Models extends Prisma8ModelMap>(models: Models): Models {
  return models;
}
