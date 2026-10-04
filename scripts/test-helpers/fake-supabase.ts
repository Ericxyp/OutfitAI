/**
 * 测试辅助：极简 Supabase 客户端替身。
 * - 内存表 + 链式查询（select / eq / in / order / limit / gte / is / maybeSingle / single / insert / update）
 * - 模拟 RLS：只允许读写 user_id === authUserId 的行（与 closet_items_*_own 策略一致）
 * - 可选模拟“迁移未执行”：写入 custom_* 字段时返回 PGRST204
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Row = Record<string, unknown>;
type Filter = { column: string; op: "eq" | "in" | "gte" | "is"; value: unknown };

export type FakeSupabaseOptions = {
  authUserId: string;
  tables?: Record<string, Row[]>;
  rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };
  missingCustomTagColumns?: boolean;
};

export type FakeSupabase = {
  client: SupabaseClient<Database>;
  tables: Record<string, Row[]>;
  log: Array<{ table: string; op: string; filters: Filter[]; payload?: Row }>;
};

const RLS_TABLES = new Set(["closet_items", "outfit_recommendations", "user_style_profiles", "user_personal_profiles", "event_logs"]);

export function createFakeSupabase(options: FakeSupabaseOptions): FakeSupabase {
  const tables: Record<string, Row[]> = options.tables ?? {};
  const log: FakeSupabase["log"] = [];

  const visible = (table: string, row: Row) =>
    !RLS_TABLES.has(table) || row.user_id === options.authUserId;

  const matches = (row: Row, filters: Filter[]) =>
    filters.every((filter) => {
      const value = row[filter.column];
      if (filter.op === "eq") return value === filter.value;
      if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(value);
      if (filter.op === "gte") return String(value) >= String(filter.value);
      if (filter.op === "is") return (value ?? null) === filter.value;
      return true;
    });

  function from(table: string) {
    tables[table] ??= [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | undefined;
    const filters: Filter[] = [];
    let limit: number | undefined;
    let mode: "many" | "single" | "maybeSingle" = "many";

    const execute = () => {
      log.push({ table, op, filters: [...filters], payload });
      const rows = tables[table];
      if (
        options.missingCustomTagColumns &&
        payload &&
        ("custom_style_tags" in payload || "custom_occasion_tags" in payload)
      ) {
        return {
          data: null,
          error: {
            code: "PGRST204",
            name: "PostgrestError",
            message: "Could not find the 'custom_style_tags' column of 'closet_items' in the schema cache",
          },
        };
      }

      let result: Row[];
      if (op === "insert") {
        const row = { id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...payload };
        if (!visible(table, row)) {
          return { data: null, error: { code: "42501", name: "PostgrestError", message: "new row violates row-level security policy" } };
        }
        rows.push(row);
        result = [row];
      } else if (op === "update") {
        result = rows.filter((row) => visible(table, row) && matches(row, filters));
        for (const row of result) Object.assign(row, payload);
      } else {
        result = rows.filter((row) => visible(table, row) && matches(row, filters));
      }

      if (limit !== undefined) result = result.slice(0, limit);
      if (mode === "single") {
        return result.length === 1
          ? { data: { ...result[0] }, error: null }
          : { data: null, error: { code: "PGRST116", name: "PostgrestError", message: "no rows" } };
      }
      if (mode === "maybeSingle") return { data: result[0] ? { ...result[0] } : null, error: null };
      return { data: result.map((row) => ({ ...row })), error: null };
    };

    const builder = {
      select: () => builder,
      insert: (row: Row) => {
        op = "insert";
        payload = row;
        return builder;
      },
      update: (row: Row) => {
        op = "update";
        payload = row;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, op: "eq", value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        filters.push({ column, op: "in", value });
        return builder;
      },
      gte: (column: string, value: unknown) => {
        filters.push({ column, op: "gte", value });
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push({ column, op: "is", value });
        return builder;
      },
      order: () => builder,
      limit: (count: number) => {
        limit = count;
        return builder;
      },
      single: () => {
        mode = "single";
        return Promise.resolve(execute());
      },
      maybeSingle: () => {
        mode = "maybeSingle";
        return Promise.resolve(execute());
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(execute()).then(resolve, reject),
    };
    return builder;
  }

  const client = {
    from,
    rpc: async (name: string, args: Record<string, unknown>) =>
      options.rpc ? options.rpc(name, args) : { data: [], error: null },
  } as unknown as SupabaseClient<Database>;

  return { client, tables, log };
}
