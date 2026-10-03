import { aggregateSearchMetrics } from "@/lib/seo-analytics/aggregate";
import { collapseNormalizedWebmasterMetrics } from "@/lib/seo-analytics/collapse-metrics";
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
  sourceRowCount: number;
  metricCount: number;
  collapsedGroupCount: number;
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

function prepareImport(workbook: ParsedWebmasterWorkbook): {
  metricsSource: ParsedWebmasterMetric[];
  sourceRowCount: number;
  collapsedGroupCount: number;
} {
  if (workbook.periodEnd < workbook.periodStart) {
    throw new Error("invalid_period");
  }
  if (workbook.rows.length === 0) throw new Error("empty_export");
  for (const row of workbook.rows) {
    if (!row.normalizedQuery) throw new Error("empty_query");
    if (row.impressions < 0 || row.clicks < 0 || row.clicks > row.impressions) {
      throw new Error("invalid_metrics");
    }
  }
  const collapsed = collapseNormalizedWebmasterMetrics(workbook.rows);
  for (const row of collapsed.rows) {
    if (row.clicks > row.impressions || row.ctr < 0 || row.ctr > 1) {
      throw new Error("invalid_metrics");
    }
  }
  const alreadyUnique = collapsed.collapsedGroupCount === 0;
  return {
    metricsSource: collapsed.rows,
    sourceRowCount: alreadyUnique
      ? (workbook.sourceRowCount ?? workbook.rows.length)
      : workbook.rows.length,
    collapsedGroupCount: alreadyUnique
      ? (workbook.collapsedGroupCount ?? 0)
      : collapsed.collapsedGroupCount,
  };
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
  const prepared = prepareImport(workbook);
  const metrics = attachSeoQueryIds(prepared.metricsSource, seoQueryIdsByNormalized);
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
            rowCount: prepared.sourceRowCount,
            sourceRowCount: prepared.sourceRowCount,
            metricCount: metrics.length,
            collapsedGroupCount: prepared.collapsedGroupCount,
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
        rowCount: prepared.sourceRowCount,
        sourceRowCount: prepared.sourceRowCount,
        metricCount: metrics.length,
        collapsedGroupCount: prepared.collapsedGroupCount,
        totalImpressions: totals.impressions,
        totalClicks: totals.clicks,
        metrics,
      },
    ],
  };
}
