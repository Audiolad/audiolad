import type {
  ParsedWebmasterMetric,
  SeoAnalyticsBoardId,
  SeoAnalyticsDashboardRow,
  SeoAnalyticsMetricDelta,
  SeoAnalyticsSnapshotSummary,
  SeoAnalyticsTotals,
} from "@/lib/seo-analytics/types";

export const DEFAULT_SEO_ANALYTICS_IMPRESSION_THRESHOLD = 10;

type MetricSlice = Pick<
  ParsedWebmasterMetric,
  "impressions" | "clicks" | "avgPosition"
> & {
  queryId?: string | null;
};

/**
 * Issue #735 bucket edges.
 * Position 4–10 is avg_position > 3 and <= 10.
 * Position 11–20 is avg_position > 10 and <= 20.
 * Zero-click impressions are the sum of impressions on rows with clicks = 0.
 */
export function aggregateSearchMetrics(rows: readonly MetricSlice[]): SeoAnalyticsTotals {
  const totals: SeoAnalyticsTotals = {
    queryCount: rows.length,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    queriesPosition1to3: 0,
    queriesPosition4to10: 0,
    queriesPosition11to20: 0,
    zeroClickQueries: 0,
    newQueries: 0,
    impressionsPosition4to10: 0,
    impressionsPosition11to20: 0,
    zeroClickImpressions: 0,
  };

  for (const row of rows) {
    totals.impressions += row.impressions;
    totals.clicks += row.clicks;
    if (row.avgPosition > 0 && row.avgPosition <= 3) totals.queriesPosition1to3 += 1;
    if (row.avgPosition > 3 && row.avgPosition <= 10) {
      totals.queriesPosition4to10 += 1;
      totals.impressionsPosition4to10 += row.impressions;
    }
    if (row.avgPosition > 10 && row.avgPosition <= 20) {
      totals.queriesPosition11to20 += 1;
      totals.impressionsPosition11to20 += row.impressions;
    }
    if (row.clicks === 0) {
      totals.zeroClickQueries += 1;
      totals.zeroClickImpressions += row.impressions;
    }
    if (row.queryId == null) totals.newQueries += 1;
  }

  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
  return totals;
}

export function boardsForMetric(
  row: Pick<SeoAnalyticsDashboardRow, "avgPosition" | "clicks" | "impressions" | "queryId">,
  threshold: number,
): SeoAnalyticsBoardId[] {
  const boards: SeoAnalyticsBoardId[] = [];
  if (row.avgPosition <= 3 && row.clicks > 0) boards.push("winners");
  if (row.avgPosition > 3 && row.avgPosition <= 10 && row.impressions >= threshold) {
    boards.push("fast_reserve");
  }
  if (row.avgPosition > 10 && row.avgPosition <= 20) boards.push("positions_11_20");
  if (row.impressions >= threshold && row.clicks === 0) boards.push("zero_ctr");
  if (row.queryId == null) boards.push("new_queries");
  return boards;
}

export function parseImpressionThreshold(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
    return DEFAULT_SEO_ANALYTICS_IMPRESSION_THRESHOLD;
  }
  return parsed;
}

export function findPreviousSnapshot<T extends Pick<SeoAnalyticsSnapshotSummary, "id" | "periodStart" | "periodEnd">>(
  snapshots: readonly T[],
  current: T,
): T | null {
  return snapshots
    .filter((snapshot) => snapshot.id !== current.id)
    .filter((snapshot) =>
      snapshot.periodEnd < current.periodEnd
      || (snapshot.periodEnd === current.periodEnd && snapshot.periodStart < current.periodStart),
    )
    .sort((left, right) =>
      right.periodEnd.localeCompare(left.periodEnd)
      || right.periodStart.localeCompare(left.periodStart),
    )[0] ?? null;
}

export function metricDelta(
  current: Pick<ParsedWebmasterMetric, "impressions" | "clicks" | "avgPosition">,
  previous: Pick<ParsedWebmasterMetric, "impressions" | "clicks" | "avgPosition">,
): SeoAnalyticsMetricDelta {
  return {
    impressions: current.impressions - previous.impressions,
    clicks: current.clicks - previous.clicks,
    avgPosition: current.avgPosition - previous.avgPosition,
  };
}

export type SeoAnalyticsRowFilter = {
  search?: string;
  cluster?: string;
  position?: "" | "1-3" | "4-10" | "11-20" | "21+";
  status?: string;
  format?: string;
  origin?: "" | "new" | "mapped";
};

export function filterAnalyticsRows(
  rows: readonly SeoAnalyticsDashboardRow[],
  filter: SeoAnalyticsRowFilter,
): SeoAnalyticsDashboardRow[] {
  const search = filter.search?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (search && !row.queryText.toLowerCase().includes(search) && !row.normalizedQuery.includes(search)) {
      return false;
    }
    if (filter.cluster === "__none__" && (row.queryId == null || row.cluster)) return false;
    if (filter.cluster && filter.cluster !== "__none__" && row.cluster !== filter.cluster) return false;
    if (filter.format && row.recommendedFormat !== filter.format) return false;
    if (filter.status && row.lifecycle !== filter.status) return false;
    if (filter.origin === "new" && row.queryId != null) return false;
    if (filter.origin === "mapped" && row.queryId == null) return false;
    if (filter.position === "1-3" && !(row.avgPosition > 0 && row.avgPosition <= 3)) return false;
    if (filter.position === "4-10" && !(row.avgPosition > 3 && row.avgPosition <= 10)) return false;
    if (filter.position === "11-20" && !(row.avgPosition > 10 && row.avgPosition <= 20)) return false;
    if (filter.position === "21+" && !(row.avgPosition > 20)) return false;
    return true;
  });
}

export function formatPeriod(start: string, end: string): string {
  const format = (iso: string) => {
    const [year, month, day] = iso.split("-");
    return `${day}.${month}.${year}`;
  };
  return `${format(start)} — ${format(end)}`;
}

export function formatSignedInt(value: number): string {
  const formatted = Math.abs(value).toLocaleString("ru-RU");
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return "0";
}

export function formatSignedPosition(value: number): string {
  const formatted = Math.abs(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return "0";
}

export function formatCtr(ctr: number): string {
  return `${(ctr * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

export function formatPosition(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

export function readMetricNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("invalid_metric_number");
}
