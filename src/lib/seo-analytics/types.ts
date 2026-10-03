import type { SeoQueryLifecycle } from "@/lib/seo-queries/types";

export const YANDEX_WEBMASTER_SOURCE = "yandex_webmaster" as const;

export type ParsedWebmasterMetric = {
  queryText: string;
  normalizedQuery: string;
  impressions: number;
  clicks: number;
  /** Clicks / impressions, from 0 to 1. */
  ctr: number;
  avgPosition: number;
  avgClickPosition: number | null;
  /** Position-breakdown and other non-required columns. No URL is inferred. */
  rawMetrics: Record<string, string | number> | null;
};

export type ParsedWebmasterWorkbook = {
  periodStart: string;
  periodEnd: string;
  /** Rows in the XLSX before normalized queries are merged. */
  sourceRowCount: number;
  /** Normalized queries that had more than one source row. */
  collapsedGroupCount: number;
  /** One row per normalized query. */
  rows: ParsedWebmasterMetric[];
};

export type SeoAnalyticsTotals = {
  queryCount: number;
  impressions: number;
  clicks: number;
  ctr: number;
  queriesPosition1to3: number;
  queriesPosition4to10: number;
  queriesPosition11to20: number;
  zeroClickQueries: number;
  newQueries: number;
  impressionsPosition4to10: number;
  impressionsPosition11to20: number;
  zeroClickImpressions: number;
};

export type SeoAnalyticsMetricDelta = {
  impressions: number;
  clicks: number;
  avgPosition: number;
};

export type SeoAnalyticsDeltaKind = "no_baseline" | "new_in_period" | "compared";

export type SeoAnalyticsDashboardRow = {
  queryText: string;
  normalizedQuery: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  avgClickPosition: number | null;
  queryId: string | null;
  frequency: number | null;
  cluster: string | null;
  recommendedFormat: string | null;
  lifecycle: SeoQueryLifecycle | null;
  authorName: string | null;
  productTitle: string | null;
  delta: SeoAnalyticsMetricDelta | null;
  deltaKind: SeoAnalyticsDeltaKind;
};

export type SeoAnalyticsSnapshotSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  importedAt: string;
  originalFilename: string;
  /** Source rows in the export. */
  rowCount: number;
  sourceRowCount: number;
  /** Unique normalized queries stored for the snapshot. */
  metricCount: number;
  totalImpressions: number;
  totalClicks: number;
};

export type SeoAnalyticsDashboardData = {
  snapshots: SeoAnalyticsSnapshotSummary[];
  selectedSnapshotId: string | null;
  previousSnapshotId: string | null;
  previousPeriodStart: string | null;
  previousPeriodEnd: string | null;
  rows: SeoAnalyticsDashboardRow[];
};

export type SeoAnalyticsHistoryPoint = {
  periodStart: string;
  periodEnd: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
};

export type SeoAnalyticsBoardId =
  | "winners"
  | "fast_reserve"
  | "positions_11_20"
  | "zero_ctr"
  | "new_queries";
