import { all, and, not, or } from "@prisma-next/sql-orm-client";
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

  if (operator === "eq") {
    if (condition.value === null) return field.isNull();
    if (insensitive) return field.ilike(escapeLike(condition.value as string));
    return field.eq(condition.value);
  }

  if (operator === "ne") {
    if (condition.value === null) return field.isNotNull();
    if (insensitive) return not(field.ilike(escapeLike(condition.value as string)) as never);
    return field.neq(condition.value);
  }

  if (operator === "in" || operator === "not_in") {
    const values = Array.isArray(condition.value) ? condition.value : [];
    if (values.length === 0) return operator === "in" ? not(all()) : all();
    return operator === "in" ? field.in(values) : field.notIn(values);
  }

  if (operator === "contains" || operator === "starts_with" || operator === "ends_with") {
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

  return field[operator](condition.value);
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
