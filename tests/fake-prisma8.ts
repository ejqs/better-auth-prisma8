import type {
  Prisma8Collection,
  Prisma8FieldAccessor,
  Prisma8ModelAccessor,
  UnknownRecord,
} from "../src/runtime/types.js";

interface Expression {
  kind: string;
  field?: string;
  operator?: string;
  value?: unknown;
  exprs?: Expression[];
  expr?: Expression;
  expression?: Expression;
  not(): Expression;
}

function expression(value: Omit<Expression, "not">): Expression {
  return {
    ...value,
    not() {
      return expression({ kind: "not", expression: this });
    },
  };
}

function accessor(field: string): Prisma8FieldAccessor {
  const compare = (operator: string, value?: unknown) =>
    expression({ kind: "comparison", field, operator, value });
  return {
    eq: (value) => compare("eq", value),
    neq: (value) => compare("neq", value),
    lt: (value) => compare("lt", value),
    lte: (value) => compare("lte", value),
    gt: (value) => compare("gt", value),
    gte: (value) => compare("gte", value),
    in: (value) => compare("in", value),
    notIn: (value) => compare("notIn", value),
    like: (value) => compare("like", value),
    ilike: (value) => compare("ilike", value),
    isNull: () => compare("isNull"),
    isNotNull: () => compare("isNotNull"),
    asc: () => ({ field, direction: "asc" }),
    desc: () => ({ field, direction: "desc" }),
  };
}

function like(value: string, pattern: string, insensitive: boolean): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = escaped.replaceAll("%", ".*").replaceAll("_", ".");
  return new RegExp(`^${regex}$`, insensitive ? "i" : "").test(value);
}

function matches(row: UnknownRecord, value: unknown): boolean {
  const item = value as Expression;
  if (item.kind === "and") return (item.exprs ?? []).every((child) => matches(row, child));
  if (item.kind === "or") return (item.exprs ?? []).some((child) => matches(row, child));
  if (item.kind === "not") return !matches(row, item.expression ?? item.expr);
  if (item.kind !== "comparison" || !item.field) return true;
  const actual = row[item.field];
  switch (item.operator) {
    case "eq": return actual === item.value;
    case "neq": return actual !== item.value;
    case "lt": return actual! < item.value!;
    case "lte": return actual! <= item.value!;
    case "gt": return actual! > item.value!;
    case "gte": return actual! >= item.value!;
    case "in": return (item.value as unknown[]).includes(actual);
    case "notIn": return !(item.value as unknown[]).includes(actual);
    case "isNull": return actual === null;
    case "isNotNull": return actual !== null;
    case "like": return typeof actual === "string" && like(actual, String(item.value), false);
    case "ilike": return typeof actual === "string" && like(actual, String(item.value), true);
    default: return false;
  }
}

interface QueryState {
  predicate?: unknown;
  selected?: string[];
  order?: { field: string; direction: "asc" | "desc" };
  take?: number;
  skip?: number;
}

export class FakeCollection implements Prisma8Collection {
  constructor(
    readonly rows: UnknownRecord[],
    private readonly state: QueryState = {},
  ) {}

  private next(change: Partial<QueryState>): FakeCollection {
    return new FakeCollection(this.rows, { ...this.state, ...change });
  }

  private filtered(): UnknownRecord[] {
    let rows = this.state.predicate
      ? this.rows.filter((row) => matches(row, this.state.predicate))
      : [...this.rows];
    if (this.state.order) {
      const { field, direction } = this.state.order;
      rows.sort((left, right) => {
        const result = left[field]! < right[field]! ? -1 : left[field]! > right[field]! ? 1 : 0;
        return direction === "desc" ? -result : result;
      });
    }
    rows = rows.slice(this.state.skip ?? 0);
    if (this.state.take !== undefined) rows = rows.slice(0, this.state.take);
    return rows;
  }

  private project(row: UnknownRecord): UnknownRecord {
    if (!this.state.selected) return row;
    return Object.fromEntries(this.state.selected.map((field) => [field, row[field]]));
  }

  where(predicate: (fields: Prisma8ModelAccessor) => unknown): Prisma8Collection {
    const fields = new Proxy({}, { get: (_target, field) => accessor(String(field)) });
    return this.next({ predicate: predicate(fields) });
  }

  select(...fields: string[]): Prisma8Collection { return this.next({ selected: fields }); }
  include(): Prisma8Collection { return this; }
  orderBy(selector: (fields: Prisma8ModelAccessor) => unknown): Prisma8Collection {
    const fields = new Proxy({}, { get: (_target, field) => accessor(String(field)) });
    return this.next({
      order: selector(fields) as { field: string; direction: "asc" | "desc" },
    });
  }
  take(count: number): Prisma8Collection { return this.next({ take: count }); }
  skip(count: number): Prisma8Collection { return this.next({ skip: count }); }
  all(): PromiseLike<UnknownRecord[]> { return Promise.resolve(this.filtered().map((row) => this.project(row))); }
  first(): Promise<UnknownRecord | null> { return Promise.resolve(this.filtered()[0] ?? null); }
  aggregate(): Promise<Record<string, unknown>> { return Promise.resolve({ total: this.filtered().length }); }
  create(data: UnknownRecord): Promise<UnknownRecord> { this.rows.push(data); return Promise.resolve(data); }
  update(data: UnknownRecord): Promise<UnknownRecord | null> {
    const row = this.filtered()[0];
    if (!row) return Promise.resolve(null);
    Object.assign(row, data);
    return Promise.resolve(row);
  }
  updateAll(data: UnknownRecord): Promise<UnknownRecord[]> {
    const rows = this.filtered();
    rows.forEach((row) => Object.assign(row, data));
    return Promise.resolve(rows);
  }
  updateCount(data: UnknownRecord): Promise<number> {
    const rows = this.filtered();
    rows.forEach((row) => Object.assign(row, data));
    return Promise.resolve(rows.length);
  }
  delete(): Promise<UnknownRecord | null> {
    const row = this.filtered()[0];
    if (!row) return Promise.resolve(null);
    this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve(row);
  }
  deleteAll(): Promise<UnknownRecord[]> {
    const rows = this.filtered();
    rows.forEach((row) => this.rows.splice(this.rows.indexOf(row), 1));
    return Promise.resolve(rows);
  }
  deleteCount(): Promise<number> {
    const rows = this.filtered();
    rows.forEach((row) => this.rows.splice(this.rows.indexOf(row), 1));
    return Promise.resolve(rows.length);
  }
}
