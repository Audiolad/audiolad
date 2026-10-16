/**
 * Read-only query of playback_usage_facts for the "what played at T" report.
 * Kept free of server-only imports so the exact filters can be unit-tested
 * with a mocked Supabase client.
 *
 * `listened_ms > 0` is required: every usable index on playback_usage_facts
 * (e.g. playback_usage_facts_business_org_occurred_idx) is partial
 * `WHERE usage_kind = 'business' AND listened_ms > 0`; without this predicate
 * the planner falls back to a sequential scan.
 */
export const PLAYBACK_FACTS_COLUMNS =
  "occurred_at, audio_item_id, location_id, player_id, listened_ms";

type FactsQueryBuilder = {
  select(columns: string): FactsQueryBuilder;
  eq(column: string, value: unknown): FactsQueryBuilder;
  gt(column: string, value: unknown): FactsQueryBuilder;
  gte(column: string, value: unknown): FactsQueryBuilder;
  lte(column: string, value: unknown): FactsQueryBuilder;
  order(column: string, options: { ascending: boolean }): FactsQueryBuilder;
  limit(count: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

export type PlaybackFactsClient = {
  from(table: "playback_usage_facts"): unknown;
};

export function queryPlaybackFacts(
  client: PlaybackFactsClient,
  params: {
    organizationId: string;
    locationId: string;
    from: string;
    to: string;
    limit: number;
  },
): PromiseLike<{ data: unknown[] | null; error: unknown }> {
  const q = client.from("playback_usage_facts") as FactsQueryBuilder;
  return q
    .select(PLAYBACK_FACTS_COLUMNS)
    .eq("usage_kind", "business")
    .eq("organization_id", params.organizationId)
    .eq("location_id", params.locationId)
    .gt("listened_ms", 0)
    .gte("occurred_at", params.from)
    .lte("occurred_at", params.to)
    .order("occurred_at", { ascending: true })
    .limit(params.limit);
}
