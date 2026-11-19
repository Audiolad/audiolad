/**
 * Read-only query of playback_usage_facts for the "what played at T" report.
 * Kept free of server-only imports so the exact filters can be unit-tested
 * with a mocked Supabase client.
 *
 * `listened_ms > 0` is required: every usable index on playback_usage_facts
 * (e.g. playback_usage_facts_business_org_occurred_idx) is partial
 * `WHERE usage_kind = 'business' AND listened_ms > 0`; without this predicate
 * the planner falls back to a sequential scan.
 *
 * t1578u: one request returns at most one PostgREST page (the server caps rows per
 * response), so a long window used to be cut silently. fetchAllPlaybackFacts reads the
 * window page by page (stable order occurred_at, id) and reports `truncated` when the
 * hard cap is reached instead of dropping rows without a word.
 */
export const PLAYBACK_FACTS_COLUMNS =
  "id, occurred_at, audio_item_id, location_id, player_id, listened_ms, position_ms";

/** Rows per request. Not above the PostgREST max-rows of the Supabase stack (1000). */
export const PLAYBACK_FACTS_PAGE_SIZE = 1000;
/** Hard cap for the venue report (±180 min of several players fits easily). */
export const PLAYBACK_REPORT_MAX_FACTS = 50_000;

type FactsQueryBuilder = {
  select(columns: string): FactsQueryBuilder;
  eq(column: string, value: unknown): FactsQueryBuilder;
  gt(column: string, value: unknown): FactsQueryBuilder;
  gte(column: string, value: unknown): FactsQueryBuilder;
  lte(column: string, value: unknown): FactsQueryBuilder;
  order(column: string, options: { ascending: boolean }): FactsQueryBuilder;
  limit(count: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

export type PlaybackFactsClient = {
  from(table: "playback_usage_facts"): unknown;
};

type FactsWindow = {
  organizationId: string;
  locationId: string;
  from: string;
  to: string;
};

function baseQuery(client: PlaybackFactsClient, params: FactsWindow, columns: string): FactsQueryBuilder {
  const q = client.from("playback_usage_facts") as FactsQueryBuilder;
  return q
    .select(columns)
    .eq("usage_kind", "business")
    .eq("organization_id", params.organizationId)
    .eq("location_id", params.locationId)
    .gt("listened_ms", 0)
    .gte("occurred_at", params.from)
    .lte("occurred_at", params.to)
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true });
}

export function queryPlaybackFacts(
  client: PlaybackFactsClient,
  params: FactsWindow & { limit: number },
): PromiseLike<{ data: unknown[] | null; error: unknown }> {
  return baseQuery(client, params, PLAYBACK_FACTS_COLUMNS).limit(params.limit);
}

export type PagedFactsResult = {
  rows: unknown[];
  /** True when maxRows was reached: the window holds more rows than were read. */
  truncated: boolean;
  pages: number;
  error: unknown;
};

/** Reads the whole window page by page. Stops at maxRows and says so. */
export async function fetchAllPlaybackFacts(
  client: PlaybackFactsClient,
  params: FactsWindow & { maxRows: number; columns?: string; pageSize?: number },
): Promise<PagedFactsResult> {
  const pageSize = Math.max(1, Math.min(params.pageSize ?? PLAYBACK_FACTS_PAGE_SIZE, PLAYBACK_FACTS_PAGE_SIZE));
  const columns = params.columns ?? PLAYBACK_FACTS_COLUMNS;
  const rows: unknown[] = [];
  let pages = 0;
  while (rows.length < params.maxRows) {
    const from = rows.length;
    const want = Math.min(pageSize, params.maxRows - from);
    const { data, error } = await baseQuery(client, params, columns).range(from, from + want - 1);
    pages += 1;
    if (error) return { rows, truncated: false, pages, error };
    const batch = data ?? [];
    rows.push(...batch);
    // A short page means the window is exhausted. PostgREST may return fewer rows than asked
    // only at the end, because the page size never exceeds its max-rows.
    if (batch.length < want) return { rows, truncated: false, pages, error: null };
  }
  // Cap reached: check whether anything is left beyond it.
  const { data, error } = await baseQuery(client, params, "id").range(rows.length, rows.length);
  pages += 1;
  if (error) return { rows, truncated: true, pages, error: null };
  return { rows, truncated: (data ?? []).length > 0, pages, error: null };
}
