import { createAdapterFactory } from "better-auth/adapters";
import type {
  CleanedWhere,
  CustomAdapter,
  DBAdapter,
  DBAdapterInstance,
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

function isBinding(value: Prisma8ModelBinding | Prisma8Collection): value is Prisma8ModelBinding {
  return "collection" in value;
}

function resolveBinding(models: Prisma8ModelMap, model: string): Prisma8ModelBinding {
  const value = models[model] ?? models[model.toLowerCase()];
  if (!value) {
    throw new Prisma8AdapterError(
      `Model ${model} is not mapped. Regenerate the model map or add it manually.`,
    );
  }
  return isBinding(value) ? value : { collection: value };
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
    const relation = binding.relations?.[joinedModel];
    if (!relation) {
      throw new Prisma8AdapterCapabilityError(
        `Join ${joinedModel} is not mapped for this model. Regenerate the model map or configure relations manually.`,
      );
    }
    query = query.include(
      relation,
      config.limit
        ? (related: Prisma8Collection) => related.take(config.limit!)
        : undefined,
    );
    renames.set(relation, joinedModel);
  }
  return { collection: query, renames };
}

function renameJoins(row: UnknownRecord, renames: Map<string, string>): UnknownRecord {
  for (const [relation, joinedModel] of renames) {
    if (relation !== joinedModel && relation in row) {
      row[joinedModel] = row[relation];
      delete row[relation];
    }
  }
  return row;
}

function createFactory(
  models: Prisma8ModelMap,
  config: Prisma8AdapterConfig,
  getOptions: () => BetterAuthOptions | null,
  inTransaction = false,
): DBAdapterInstance {
  return createAdapterFactory({
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
                const options = getOptions();
                if (!options) throw new Prisma8AdapterError("Adapter options are not initialized.");
                const transactionAdapter: DBAdapter = createFactory(
                  transactionModels,
                  config,
                  getOptions,
                  true,
                )(options);
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
        if (offset) query = query.skip(offset);
        if (limit) query = query.take(limit);
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
        return applyWhere(binding.collection, where).updateCount(update);
      },

      async delete({ model, where }) {
        if (!where.length) return;
        const binding = resolveBinding(models, model);
        await applyWhere(binding.collection, where).delete();
      },

      async deleteMany({ model, where }) {
        if (!where.length) return 0;
        const binding = resolveBinding(models, model);
        return applyWhere(binding.collection, where).deleteCount();
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
}

export function prisma8Adapter(
  models: Prisma8ModelMap,
  config: Prisma8AdapterConfig = {},
) {
  let options: BetterAuthOptions | null = null;
  const factory = createFactory(models, config, () => options);
  return (betterAuthOptions: BetterAuthOptions) => {
    options = betterAuthOptions;
    return factory(betterAuthOptions);
  };
}

export function definePrisma8Models<const Models extends Prisma8ModelMap>(models: Models): Models {
  return models;
}
