import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";

/**
 * Chunked, paged SELECT ... WHERE column IN (...) for «Подарочная неделя» (task 253821e0).
 * Kept free of "server-only" so the unit test can drive it with a fake client.
 * Every chunk is read page by page with a deterministic order, so the PostgREST row cap
 * (1000 by default) can never silently truncate the result.
 */

export const BUSINESS_TRIALS_IN_CHUNK = 50;
export const BUSINESS_TRIALS_PAGE_SIZE = 1000;

type Row = Record<string, unknown>;
type PageResult = { data: Row[] | null; error: { message: string } | null };

/** The subset of the PostgREST builder used here. */
export type BusinessTrialsQuery = PromiseLike<PageResult> & {
  in(column: string, values: readonly string[]): BusinessTrialsQuery;
  eq(column: string, value: string): BusinessTrialsQuery;
  gte(column: string, value: string): BusinessTrialsQuery;
  order(column: string, options: { ascending: boolean }): BusinessTrialsQuery;
  range(from: number, to: number): BusinessTrialsQuery;
};

export type BusinessTrialsDb = {
  from(table: string): { select(columns: string): BusinessTrialsQuery };
};

export type SelectInOptions = {
  /** Unique, deterministic order for paging (primary key or unique columns). Required. */
  order: readonly string[];
  eq?: Readonly<Record<string, string>>;
  gte?: Readonly<Record<string, string>>;
  chunk?: number;
  pageSize?: number;
};

export function chunkValues<T>(values: readonly T[], size: number = BUSINESS_TRIALS_IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export async function selectInPaged(
  db: BusinessTrialsDb,
  table: string,
  columns: string,
  column: string,
  values: readonly string[],
  options: SelectInOptions,
): Promise<Row[]> {
  if (options.order.length === 0) throw new Error(`business_trials_${table}_order_required`);
  const rows: Row[] = [];
  for (const part of chunkValues(values, options.chunk ?? BUSINESS_TRIALS_IN_CHUNK)) {
    try {
      const page = await fetchAllPages<Row>((from, to) => {
        let query = db.from(table).select(columns).in(column, part);
        for (const [key, value] of Object.entries(options.eq ?? {})) query = query.eq(key, value);
        for (const [key, value] of Object.entries(options.gte ?? {})) query = query.gte(key, value);
        for (const key of options.order) query = query.order(key, { ascending: true });
        return query.range(from, to);
      }, options.pageSize ?? BUSINESS_TRIALS_PAGE_SIZE);
      rows.push(...page);
    } catch (error) {
      throw new Error(`business_trials_${table}_failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }
  return rows;
}
