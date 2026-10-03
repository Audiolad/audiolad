import type { ParsedWebmasterMetric } from "@/lib/seo-analytics/types";

/**
 * CTR and average-position breakdowns are rates, not counters.
 * Impression and click breakdowns are summed. The same rule is used in
 * import_seo_search_snapshot.
 */
export function isRateOrAverageKey(header: string): boolean {
  return /ctr|avg\.?|average|средн/i.test(header);
}

export type CollapsedWebmasterMetrics = {
  rows: ParsedWebmasterMetric[];
  collapsedGroupCount: number;
};

/**
 * Group already-validated source rows by normalized_query.
 * Impressions and clicks are sums. CTR is total_clicks / total_impressions × 100,
 * stored as the 0–1 ratio the snapshot column already uses.
 * avg_position is impressions-weighted. avg_click_position is clicks-weighted
 * and ignores rows where that value is absent. query_text is the variant
 * with the most impressions (the earliest row wins a tie).
 */
export function collapseNormalizedWebmasterMetrics(
  rows: readonly ParsedWebmasterMetric[],
): CollapsedWebmasterMetrics {
  const groups = new Map<string, ParsedWebmasterMetric[]>();
  const order: string[] = [];
  for (const row of rows) {
    const existing = groups.get(row.normalizedQuery);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.normalizedQuery, [row]);
      order.push(row.normalizedQuery);
    }
  }

  let collapsedGroupCount = 0;
  const merged: ParsedWebmasterMetric[] = [];
  for (const key of order) {
    const group = groups.get(key) ?? [];
    if (group.length > 1) collapsedGroupCount += 1;
    merged.push(group.length === 1 ? group[0]! : mergeNormalizedGroup(group));
  }
  return { rows: merged, collapsedGroupCount };
}

function mergeNormalizedGroup(group: readonly ParsedWebmasterMetric[]): ParsedWebmasterMetric {
  let impressions = 0;
  let clicks = 0;
  let positionWeight = 0;
  let clickPositionWeight = 0;
  let clickPositionSum = 0;
  let representative = group[0]!;

  for (const row of group) {
    impressions += row.impressions;
    clicks += row.clicks;
    positionWeight += row.avgPosition * row.impressions;
    if (row.avgClickPosition != null) {
      clickPositionWeight += row.clicks;
      clickPositionSum += row.avgClickPosition * row.clicks;
    }
    if (row.impressions > representative.impressions) representative = row;
  }

  const ctrPercent = impressions === 0 ? 0 : (clicks / impressions) * 100;
  const counters = new Map<string, number>();
  for (const row of group) {
    for (const [key, value] of Object.entries(row.rawMetrics ?? {})) {
      if (typeof value === "number" && Number.isFinite(value) && !isRateOrAverageKey(key)) {
        counters.set(key, (counters.get(key) ?? 0) + value);
      }
    }
  }

  const preserved = new Map<string, string | number>();
  for (const row of [representative, ...group]) {
    for (const [key, value] of Object.entries(row.rawMetrics ?? {})) {
      if (counters.has(key) || preserved.has(key)) continue;
      if (isRateOrAverageKey(key) || typeof value !== "number") preserved.set(key, value);
    }
  }

  const rawMetrics: Record<string, string | number> = {};
  for (const [key, value] of counters) rawMetrics[key] = value;
  for (const [key, value] of preserved) rawMetrics[key] = value;

  return {
    queryText: representative.queryText,
    normalizedQuery: representative.normalizedQuery,
    impressions,
    clicks,
    ctr: ctrPercent / 100,
    avgPosition: impressions === 0 ? 0 : positionWeight / impressions,
    avgClickPosition: clickPositionWeight > 0 ? clickPositionSum / clickPositionWeight : null,
    rawMetrics: Object.keys(rawMetrics).length > 0 ? rawMetrics : null,
  };
}
