import { aggregateSearchMetrics } from "@/lib/seo-analytics/aggregate";
import type { ParsedWebmasterMetric, ParsedWebmasterWorkbook } from "@/lib/seo-analytics/types";
import { YANDEX_WEBMASTER_SOURCE } from "@/lib/seo-analytics/types";

export type StoredSearchMetric = ParsedWebmasterMetric & {
  queryId: string | null;
};

export type StoredSearchSnapshot = {
  id: string;
  source: typeof YANDEX_WEBMASTER_SOURCE;
  periodStart: string;
  periodEnd: string;
  originalFilename: string;
  rowCount: number;
  totalImpressions: number;
  totalClicks: number;
  metrics: StoredSearchMetric[];
};

export type SeoAnalyticsStore = {
  snapshots: StoredSearchSnapshot[];
  nextId: number;
};

export function emptySeoAnalyticsStore(): SeoAnalyticsStore {
  return { snapshots: [], nextId: 1 };
}

export function attachSeoQueryIds(
  rows: readonly ParsedWebmasterMetric[],
  seoQueryIdsByNormalized: ReadonlyMap<string, string>,
): StoredSearchMetric[] {
  return rows.map((row) => ({
    ...row,
    queryId: seoQueryIdsByNormalized.get(row.normalizedQuery) ?? null,
  }));
}

function assertImportable(workbook: ParsedWebmasterWorkbook): void {
  if (workbook.periodEnd < workbook.periodStart) {
    throw new Error("invalid_period");
  }
  if (workbook.rows.length === 0) throw new Error("empty_export");
  const seen = new Set<string>();
  for (const row of workbook.rows) {
    if (!row.normalizedQuery) throw new Error("empty_query");
    if (seen.has(row.normalizedQuery)) throw new Error("duplicate_normalized_query");
    seen.add(row.normalizedQuery);
    if (row.impressions < 0 || row.clicks < 0 || row.clicks > row.impressions) {
      throw new Error("invalid_metrics");
    }
  }
}

/**
 * Reference import used by tests. Production writes the same rules in
 * public.import_seo_search_snapshot: one snapshot per source and period,
 * re-import replaces that snapshot's metrics, other periods stay, and
 * seo_queries are never inserted.
 */
export function applySearchSnapshotImport(
  state: SeoAnalyticsStore,
  workbook: ParsedWebmasterWorkbook,
  filename: string,
  seoQueryIdsByNormalized: ReadonlyMap<string, string>,
): SeoAnalyticsStore {
  assertImportable(workbook);
  const metrics = attachSeoQueryIds(workbook.rows, seoQueryIdsByNormalized);
  const totals = aggregateSearchMetrics(metrics);
  const existing = state.snapshots.find((snapshot) =>
    snapshot.source === YANDEX_WEBMASTER_SOURCE
    && snapshot.periodStart === workbook.periodStart
    && snapshot.periodEnd === workbook.periodEnd,
  );
  if (existing) {
    return {
      nextId: state.nextId,
      snapshots: state.snapshots.map((snapshot) => snapshot.id === existing.id
        ? {
            ...snapshot,
            originalFilename: filename,
            rowCount: totals.queryCount,
            totalImpressions: totals.impressions,
            totalClicks: totals.clicks,
            metrics,
          }
        : snapshot),
    };
  }
  return {
    nextId: state.nextId + 1,
    snapshots: [
      ...state.snapshots,
      {
        id: `snapshot-${state.nextId}`,
        source: YANDEX_WEBMASTER_SOURCE,
        periodStart: workbook.periodStart,
        periodEnd: workbook.periodEnd,
        originalFilename: filename,
        rowCount: totals.queryCount,
        totalImpressions: totals.impressions,
        totalClicks: totals.clicks,
        metrics,
      },
    ],
  };
}
