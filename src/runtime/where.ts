import { all, and, not, or } from "@prisma/orm-postgres/orm-client";
import type { Where } from "better-auth";

import { Prisma8AdapterError } from "./errors.js";
import type {
  Prisma8Collection,
  Prisma8FieldAccessor,
  Prisma8ModelAccessor,
} from "./types.js";

const escapeLike = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

function fieldAccessor(
  fields: Prisma8ModelAccessor,
  condition: Where,
): Prisma8FieldAccessor {
  const field = fields[condition.field];
  if (!field) {
    throw new Prisma8AdapterError(
      `Field ${condition.field} does not exist on the mapped Prisma 8 model.`,
    );
  }
  return field;
}

export function conditionToPrisma8(
  fields: Prisma8ModelAccessor,
  condition: Where,
): unknown {
  const field = fieldAccessor(fields, condition);
  const operator = condition.operator ?? "eq";
  const insensitive =
    condition.mode === "insensitive" && typeof condition.value === "string";

  switch (operator) {
    case "eq":
      if (condition.value === null) return field.isNull();
      if (insensitive) return field.ilike(escapeLike(condition.value as string));
      return field.eq(condition.value);
    case "ne":
      if (condition.value === null) return field.isNotNull();
      if (insensitive) return not(field.ilike(escapeLike(condition.value as string)) as never);
      return field.neq(condition.value);
    case "in":
    case "not_in": {
      if (!Array.isArray(condition.value)) {
        throw new Prisma8AdapterError(
          `${operator} requires an array value for ${condition.field}.`,
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
          `${operator} requires a string value for ${condition.field}.`,
        );
      }
      const escaped = escapeLike(condition.value);
      const pattern =
        operator === "contains"
          ? `%${escaped}%`
          : operator === "starts_with"
            ? `${escaped}%`
            : `%${escaped}`;
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

export function applyWhere(
  collection: Prisma8Collection,
  where: Where[] | undefined,
): Prisma8Collection {
  if (!where?.length) return collection;

  return collection.where((fields: Prisma8ModelAccessor) => {
    const andConditions = where
      .filter((condition) => condition.connector !== "OR")
      .map((condition) => conditionToPrisma8(fields, condition));
    const orConditions = where
      .filter((condition) => condition.connector === "OR")
      .map((condition) => conditionToPrisma8(fields, condition));

    const expressions = [...andConditions];
    if (orConditions.length > 0) expressions.push(or(...(orConditions as never[])));
    return and(...(expressions as never[]));
  });
}
