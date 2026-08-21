// src/runtime/adapter.ts
import { createAdapterFactory } from "better-auth/adapters";

// src/runtime/errors.ts
var Prisma8AdapterError = class extends Error {
  name = "Prisma8AdapterError";
};
var Prisma8AdapterCapabilityError = class extends Prisma8AdapterError {
  name = "Prisma8AdapterCapabilityError";
};

// src/runtime/where.ts
import { all, and, not, or } from "@prisma/orm-postgres/orm-client";
var escapeLike = (value) => value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
function fieldAccessor(fields, condition) {
  const field = fields[condition.field];
  if (!field) {
    throw new Prisma8AdapterError(
      `Field ${condition.field} does not exist on the mapped Prisma 8 model.`
    );
  }
  return field;
}
function conditionToPrisma8(fields, condition) {
  const field = fieldAccessor(fields, condition);
  const operator = condition.operator ?? "eq";
  const insensitive = condition.mode === "insensitive" && typeof condition.value === "string";
  switch (operator) {
    case "eq":
      if (condition.value === null) return field.isNull();
      if (insensitive) return field.ilike(escapeLike(condition.value));
      return field.eq(condition.value);
    case "ne":
      if (condition.value === null) return field.isNotNull();
      if (insensitive) return not(field.ilike(escapeLike(condition.value)));
      return field.neq(condition.value);
    case "in":
    case "not_in": {
      if (!Array.isArray(condition.value)) {
        throw new Prisma8AdapterError(
          `${operator} requires an array value for ${condition.field}.`
        );
      }
      if (condition.value.length === 0) return operator === "in" ? not(all()) : all();
      return operator === "in" ? field.in(condition.value) : field.notIn(condition.value);
    }
    case "contains":
    case "starts_with":
    case "ends_with": {
      if (typeof condition.value !== "string") {
        throw new Prisma8AdapterError(
          `${operator} requires a string value for ${condition.field}.`
        );
      }
      const escaped = escapeLike(condition.value);
      const pattern = operator === "contains" ? `%${escaped}%` : operator === "starts_with" ? `${escaped}%` : `%${escaped}`;
      return condition.mode === "insensitive" ? field.ilike(pattern) : field.like(pattern);
    }
    case "lt":
      return field.lt(condition.value);
    case "lte":
      return field.lte(condition.value);
    case "gt":
      return field.gt(condition.value);
    case "gte":
      return field.gte(condition.value);
    default:
      throw new Prisma8AdapterError(`Unsupported where operator ${String(operator)}.`);
  }
}
function applyWhere(collection, where) {
  if (!where?.length) return collection;
  return collection.where((fields) => {
    const andConditions = where.filter((condition) => condition.connector !== "OR").map((condition) => conditionToPrisma8(fields, condition));
    const orConditions = where.filter((condition) => condition.connector === "OR").map((condition) => conditionToPrisma8(fields, condition));
    const expressions = [...andConditions];
    if (orConditions.length > 0) expressions.push(or(...orConditions));
    return and(...expressions);
  });
}

// src/runtime/adapter.ts
function isObject(value) {
  return typeof value === "object" && value !== null || typeof value === "function";
}
function isBinding(value) {
  return isObject(value) && Object.hasOwn(value, "collection");
}
function ownValue(values, key) {
  return Object.hasOwn(values, key) ? values[key] : void 0;
}
function caseInsensitiveOwnValue(values, key, kind) {
  const exact = ownValue(values, key);
  if (exact !== void 0) return exact;
  const matches = Object.keys(values).filter(
    (candidate) => candidate.toLowerCase() === key.toLowerCase()
  );
  if (matches.length > 1) {
    throw new Prisma8AdapterError(
      `Ambiguous ${kind} ${key}; matching keys differ only by letter case.`
    );
  }
  return matches[0] ? ownValue(values, matches[0]) : void 0;
}
function resolveBinding(models, model) {
  const value = caseInsensitiveOwnValue(models, model, "model");
  if (!value) {
    throw new Prisma8AdapterError(
      `Model ${model} is not mapped. Regenerate the model map or add it manually.`
    );
  }
  return isBinding(value) ? value : { collection: value };
}
function resolveRelation(binding, joinedModel) {
  return binding.relations ? caseInsensitiveOwnValue(binding.relations, joinedModel, "relation") : void 0;
}
function assertNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Prisma8AdapterError(`${name} must be a non-negative safe integer.`);
  }
}
function affectedRowCount(value, operation) {
  if (!Array.isArray(value)) {
    throw new Prisma8AdapterError(`${operation} did not return an array of affected rows.`);
  }
  return value.length;
}
function applySelect(collection, select) {
  return select?.length ? collection.select(...select) : collection;
}
function applyJoin(binding, collection, join) {
  const renames = /* @__PURE__ */ new Map();
  let query = collection;
  for (const [joinedModel, config] of Object.entries(join ?? {})) {
    const relation = resolveRelation(binding, joinedModel);
    if (!relation) {
      throw new Prisma8AdapterCapabilityError(
        `Join ${joinedModel} is not mapped for this model. Regenerate the model map or configure relations manually.`
      );
    }
    const limit = config.limit ?? 100;
    assertNonNegativeInteger(limit, `Join limit for ${joinedModel}`);
    query = query.include(relation, (related) => related.take(limit));
    renames.set(relation, joinedModel);
  }
  return { collection: query, renames };
}
function renameJoins(row, renames) {
  if (renames.size === 0) return row;
  const renamed = { ...row };
  for (const [relation, joinedModel] of renames) {
    if (relation !== joinedModel && Object.hasOwn(renamed, relation)) {
      Object.defineProperty(renamed, joinedModel, {
        configurable: true,
        enumerable: true,
        value: renamed[relation],
        writable: true
      });
      delete renamed[relation];
    }
  }
  return renamed;
}
function createAdapter(models, config, options, inTransaction = false) {
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
      transaction: !inTransaction && config.transaction ? async (callback) => config.transaction(async (transactionModels) => {
        const transactionAdapter = createAdapter(
          transactionModels,
          config,
          options,
          true
        );
        return callback(transactionAdapter);
      }) : false
    },
    adapter: () => ({
      async create({
        model,
        data,
        select
      }) {
        const binding = resolveBinding(models, model);
        return await applySelect(binding.collection, select).create(data);
      },
      async findOne({
        model,
        where,
        select,
        join
      }) {
        const binding = resolveBinding(models, model);
        let query = applyWhere(binding.collection, where);
        query = applySelect(query, select);
        const joined = applyJoin(binding, query, join);
        const row = await joined.collection.first();
        return row ? renameJoins(row, joined.renames) : null;
      },
      async findMany({
        model,
        where,
        limit,
        select,
        offset,
        sortBy,
        join
      }) {
        const binding = resolveBinding(models, model);
        let query = applyWhere(binding.collection, where);
        query = applySelect(query, select);
        if (sortBy?.field) {
          query = query.orderBy((fields) => {
            const field = fields[sortBy.field];
            if (!field) throw new Prisma8AdapterError(`Unknown sort field ${sortBy.field}.`);
            return sortBy.direction === "desc" ? field.desc() : field.asc();
          });
        }
        assertNonNegativeInteger(offset ?? 0, "Offset");
        assertNonNegativeInteger(limit, "Limit");
        if (offset !== void 0) query = query.skip(offset);
        query = query.take(limit);
        const joined = applyJoin(binding, query, join);
        const rows = await joined.collection.all();
        return rows.map(
          (row) => renameJoins(row, joined.renames)
        );
      },
      async count({ model, where }) {
        const binding = resolveBinding(models, model);
        const result = await applyWhere(binding.collection, where).aggregate((aggregate) => ({
          total: aggregate.count()
        }));
        return Number(result.total ?? 0);
      },
      async update({
        model,
        where,
        update
      }) {
        if (!where.length) return null;
        const binding = resolveBinding(models, model);
        return await applyWhere(binding.collection, where).update(
          update
        );
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
      async consumeOne({ model, where }) {
        if (!where.length) return null;
        const binding = resolveBinding(models, model);
        return await applyWhere(binding.collection, where).delete();
      },
      async incrementOne({
        model,
        where,
        increment,
        set
      }) {
        if (!where.length) return null;
        const binding = resolveBinding(models, model);
        if (!binding.incrementOne) {
          throw new Prisma8AdapterCapabilityError(
            `Model ${model} needs an atomic incrementOne hook. Prisma 8's ORM does not expose arithmetic updates yet.`
          );
        }
        const collection = applyWhere(binding.collection, where);
        return await binding.incrementOne({ collection, where, increment, set });
      },
      options: config
    })
  });
  return factory(options);
}
function prisma8Adapter(models, config = {}) {
  return (betterAuthOptions) => createAdapter(models, config, betterAuthOptions);
}
function definePrisma8Models(models) {
  return models;
}

// src/generator/generate.ts
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function ownValue2(values, key) {
  return Object.hasOwn(values, key) ? values[key] : void 0;
}
function assertContract(value) {
  if (!isRecord(value) || !isRecord(value.roots) || !isRecord(value.domain)) {
    throw new Error("The file is not a supported Prisma 8 contract.json.");
  }
  const namespaces = value.domain.namespaces;
  if (!isRecord(namespaces)) {
    throw new Error("The file is not a supported Prisma 8 contract.json.");
  }
  for (const root of Object.values(value.roots)) {
    if (!isRecord(root) || typeof root.model !== "string" || typeof root.namespace !== "string") {
      throw new Error("The file is not a supported Prisma 8 contract.json.");
    }
  }
  for (const namespace of Object.values(namespaces)) {
    if (!isRecord(namespace) || !isRecord(namespace.models)) {
      throw new Error("The file is not a supported Prisma 8 contract.json.");
    }
    for (const model of Object.values(namespace.models)) {
      if (!isRecord(model)) {
        throw new Error("The file is not a supported Prisma 8 contract.json.");
      }
      if (model.relations === void 0) continue;
      if (!isRecord(model.relations)) {
        throw new Error("The file is not a supported Prisma 8 contract.json.");
      }
      for (const relation of Object.values(model.relations)) {
        if (!isRecord(relation) || !isRecord(relation.to) || typeof relation.to.model !== "string" || typeof relation.to.namespace !== "string") {
          throw new Error("The file is not a supported Prisma 8 contract.json.");
        }
      }
    }
  }
}
function relationMap(contract, model) {
  const relations = /* @__PURE__ */ Object.create(null);
  for (const [relationName, relation] of Object.entries(model?.relations ?? {})) {
    const root = Object.entries(contract.roots).find(
      ([, candidate]) => candidate.model === relation.to.model && candidate.namespace === relation.to.namespace
    );
    if (root) relations[root[0]] = relationName;
  }
  return relations;
}
function renderModelMap(contract, dbImport, runtimeImport = "@ejqs/better-auth-prisma8/runtime") {
  const entries = Object.entries(contract.roots).sort(([left], [right]) => left.localeCompare(right)).map(([rootName, root]) => {
    const namespace = ownValue2(contract.domain.namespaces, root.namespace);
    const model = namespace ? ownValue2(namespace.models, root.model) : void 0;
    const relations = relationMap(contract, model);
    const relationCode = Object.keys(relations).length ? `, relations: ${JSON.stringify(relations)}` : "";
    return `    [${JSON.stringify(rootName)}]: { collection: client.orm[${JSON.stringify(root.namespace)}][${JSON.stringify(root.model)}]${relationCode} },`;
  }).join("\n");
  return `// Generated by @ejqs/better-auth-prisma8. Do not edit by hand.
import { definePrisma8Models } from ${JSON.stringify(runtimeImport)};
import { db } from ${JSON.stringify(dbImport)};

export function createPrisma8Models(client: Pick<typeof db, "orm">) {
  return definePrisma8Models({
${entries}
  });
}

export const prisma8Models = createPrisma8Models(db);
`;
}
async function generateModelMap(options) {
  const parsed = JSON.parse(await readFile(options.contractPath, "utf8"));
  assertContract(parsed);
  const code = renderModelMap(parsed, options.dbImport, options.runtimeImport);
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, code, "utf8");
  return code;
}
export {
  Prisma8AdapterCapabilityError,
  Prisma8AdapterError,
  applyWhere,
  conditionToPrisma8,
  definePrisma8Models,
  generateModelMap,
  prisma8Adapter,
  renderModelMap
};
//# sourceMappingURL=index.js.map