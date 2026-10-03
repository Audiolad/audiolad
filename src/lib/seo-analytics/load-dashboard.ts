import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  findPreviousSnapshot,
  metricDelta,
  readMetricNumber,
} from "@/lib/seo-analytics/aggregate";
import type {
  SeoAnalyticsDashboardData,
  SeoAnalyticsDashboardRow,
  SeoAnalyticsHistoryPoint,
  SeoAnalyticsSnapshotSummary,
} from "@/lib/seo-analytics/types";
import { isEffectiveSeoReservation } from "@/lib/seo-queries/reservation-effective";
import { loadPublishedSeoOccupancyForQueries } from "@/lib/seo-queries/load-published-seo-occupancy";
import { lifecycleForSeoOpportunity } from "@/lib/seo-queries/published-query-occupancy";
import type { SeoQueryLifecycle } from "@/lib/seo-queries/types";
import { chunkIds } from "@/lib/supabase/chunk";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type SnapshotRow = {
  id: string;
  period_start: string;
  period_end: string;
  imported_at: string;
  original_filename: string;
  row_count: number;
  source_row_count: number;
  metric_count: number;
  total_impressions: number | string;
  total_clicks: number | string;
};

type MetricRow = {
  id: string;
  query_id: string | null;
  query_text: string;
  normalized_query: string;
  impressions: number | string;
  clicks: number | string;
  ctr: number | string;
  avg_position: number | string;
  avg_click_position: number | string | null;
};

type QueryRow = {
  id: string;
  frequency: number | null;
  recommended_format: string | null;
  seo_clusters: { name: string } | { name: string }[] | null;
};

type ReservationRow = {
  query_id: string;
  author_id: string;
  product_id: string | null;
  status: string;
  expires_at: string | null;
  practices:
    | { title: string | null; status: string | null; moderation_status: string | null }
    | { title: string | null; status: string | null; moderation_status: string | null }[]
    | null;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function selectPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await load(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function snapshotSummary(row: SnapshotRow): SeoAnalyticsSnapshotSummary {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    importedAt: row.imported_at,
    originalFilename: row.original_filename,
    rowCount: row.source_row_count,
    sourceRowCount: row.source_row_count,
    metricCount: row.metric_count,
    totalImpressions: readMetricNumber(row.total_impressions),
    totalClicks: readMetricNumber(row.total_clicks),
  };
}

async function loadMetrics(supabase: SupabaseClient, snapshotId: string): Promise<MetricRow[]> {
  return selectPages((from, to) =>
    supabase
      .from("seo_search_query_metrics")
      .select("id, query_id, query_text, normalized_query, impressions, clicks, ctr, avg_position, avg_click_position")
      .eq("snapshot_id", snapshotId)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

async function loadQueries(supabase: SupabaseClient, ids: readonly string[]): Promise<Map<string, QueryRow>> {
  const map = new Map<string, QueryRow>();
  for (const chunk of chunkIds(ids, 50)) {
    const { data, error } = await supabase
      .from("seo_queries")
      .select("id, frequency, recommended_format, seo_clusters(name)")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) map.set(row.id as string, row as QueryRow);
  }
  return map;
}

async function loadReservations(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, ReservationRow>> {
  const map = new Map<string, ReservationRow>();
  for (const chunk of chunkIds(ids, 50)) {
    const { data, error } = await supabase
      .from("seo_query_reservations")
      .select("query_id, author_id, product_id, status, expires_at, practices(title, status, moderation_status)")
      .in("query_id", chunk)
      .in("status", ["active", "used"]);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ReservationRow[]) {
      if (!map.has(row.query_id)) map.set(row.query_id, row);
    }
  }
  return map;
}

async function loadAuthorNames(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (const chunk of chunkIds(unique, 50)) {
    const { data, error } = await supabase.from("authors").select("id, name").in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (typeof row.name === "string") map.set(row.id as string, row.name);
    }
  }
  return map;
}

async function countMatches(
  supabase: SupabaseClient,
  normalizedQueries: readonly string[],
): Promise<number> {
  const unique = [...new Set(normalizedQueries)];
  let matched = 0;
  for (const chunk of chunkIds(unique, 50)) {
    const { data, error } = await supabase
      .from("seo_queries")
      .select("normalized_query")
      .in("normalized_query", chunk);
    if (error) throw new Error(error.message);
    matched += data?.length ?? 0;
  }
  return matched;
}

export async function previewSeoQueryMatches(
  normalizedQueries: readonly string[],
): Promise<{ matched: number; fresh: number }> {
  const supabase = createServiceRoleClient();
  const matched = await countMatches(supabase, normalizedQueries);
  return { matched, fresh: normalizedQueries.length - matched };
}

export async function loadSeoAnalyticsDashboard(
  snapshotId: string | null,
): Promise<SeoAnalyticsDashboardData> {
  const supabase = createServiceRoleClient();
  const snapshotRows = await selectPages<SnapshotRow>((from, to) =>
    supabase
      .from("seo_search_snapshots")
      .select("id, period_start, period_end, imported_at, original_filename, row_count, source_row_count, metric_count, total_impressions, total_clicks")
      .order("period_end", { ascending: false })
      .order("period_start", { ascending: false })
      .range(from, to),
  );
  const snapshots = snapshotRows.map(snapshotSummary);
  const selected = snapshots.find((snapshot) => snapshot.id === snapshotId) ?? snapshots[0] ?? null;
  if (!selected) {
    return {
      snapshots,
      selectedSnapshotId: null,
      previousSnapshotId: null,
      previousPeriodStart: null,
      previousPeriodEnd: null,
      rows: [],
    };
  }

  const previous = findPreviousSnapshot(snapshots, selected);
  const [metrics, previousMetrics] = await Promise.all([
    loadMetrics(supabase, selected.id),
    previous ? loadMetrics(supabase, previous.id) : Promise.resolve([]),
  ]);
  const previousByQuery = new Map(previousMetrics.map((row) => [row.normalized_query, row]));
  const queryIds = [...new Set(metrics.flatMap((row) => row.query_id ? [row.query_id] : []))];
  const [queries, reservations] = await Promise.all([
    loadQueries(supabase, queryIds),
    loadReservations(supabase, queryIds),
  ]);
  const metricByQueryId = new Map(
    metrics.flatMap((row) => (row.query_id ? [[row.query_id, row] as const] : [])),
  );
  const occupancy = queryIds.length === 0
    ? new Map()
    : await loadPublishedSeoOccupancyForQueries(
        supabase,
        queryIds.map((id) => ({
          id,
          queryText: metricByQueryId.get(id)?.query_text ?? "",
          normalizedQuery: metricByQueryId.get(id)?.normalized_query ?? null,
        })),
      );
  const authorNames = await loadAuthorNames(
    supabase,
    [...occupancy.values()].map((hit) => hit.authorId),
  );

  const rows: SeoAnalyticsDashboardRow[] = metrics.map((metric) => {
    const query = metric.query_id ? queries.get(metric.query_id) : undefined;
    const cluster = relation(query?.seo_clusters ?? null);
    const reservation = metric.query_id ? reservations.get(metric.query_id) : undefined;
    const product = relation(reservation?.practices ?? null);
    const published = metric.query_id ? occupancy.get(metric.query_id) : undefined;
    const effectiveReservation = reservation
      ? isEffectiveSeoReservation({
          status: reservation.status,
          productId: reservation.product_id,
          expiresAt: reservation.expires_at,
        })
      : false;
    let lifecycle: SeoQueryLifecycle | null = null;
    if (metric.query_id) {
      if (published) {
        lifecycle = lifecycleForSeoOpportunity({ publishedOccupancy: published });
      } else if (!reservation || !effectiveReservation) {
        lifecycle = reservation?.status === "used" || product?.status === "published"
          ? "published"
          : "available";
      } else {
        lifecycle = lifecycleForSeoOpportunity({
          reservation,
          product,
        });
      }
    }
    const previousMetric = previousByQuery.get(metric.normalized_query);
    const currentPoint = {
      impressions: readMetricNumber(metric.impressions),
      clicks: readMetricNumber(metric.clicks),
      avgPosition: readMetricNumber(metric.avg_position),
    };
    return {
      queryText: metric.query_text,
      normalizedQuery: metric.normalized_query,
      impressions: currentPoint.impressions,
      clicks: currentPoint.clicks,
      ctr: readMetricNumber(metric.ctr),
      avgPosition: currentPoint.avgPosition,
      avgClickPosition: metric.avg_click_position == null
        ? null
        : readMetricNumber(metric.avg_click_position),
      queryId: metric.query_id,
      frequency: typeof query?.frequency === "number" ? query.frequency : null,
      cluster: cluster?.name ?? null,
      recommendedFormat: query?.recommended_format ?? null,
      lifecycle,
      authorName: published ? authorNames.get(published.authorId) ?? null : null,
      productTitle: published?.productTitle ?? null,
      delta: previous && previousMetric
        ? metricDelta(currentPoint, {
            impressions: readMetricNumber(previousMetric.impressions),
            clicks: readMetricNumber(previousMetric.clicks),
            avgPosition: readMetricNumber(previousMetric.avg_position),
          })
        : null,
      deltaKind: !previous ? "no_baseline" : previousMetric ? "compared" : "new_in_period",
    };
  });

  rows.sort((left, right) => right.impressions - left.impressions || left.queryText.localeCompare(right.queryText, "ru"));

  return {
    snapshots,
    selectedSnapshotId: selected.id,
    previousSnapshotId: previous?.id ?? null,
    previousPeriodStart: previous?.periodStart ?? null,
    previousPeriodEnd: previous?.periodEnd ?? null,
    rows,
  };
}

export async function loadSeoQueryMetricHistory(
  normalizedQuery: string,
): Promise<SeoAnalyticsHistoryPoint[]> {
  const supabase = createServiceRoleClient();
  const metrics = await selectPages<{
    snapshot_id: string;
    impressions: number | string;
    clicks: number | string;
    ctr: number | string;
    avg_position: number | string;
  }>((from, to) =>
    supabase
      .from("seo_search_query_metrics")
      .select("snapshot_id, impressions, clicks, ctr, avg_position")
      .eq("normalized_query", normalizedQuery)
      .order("snapshot_id", { ascending: true })
      .range(from, to),
  );
  if (metrics.length === 0) return [];
  const snapshotIds = [...new Set(metrics.map((row) => row.snapshot_id))];
  const snapshots = new Map<string, { period_start: string; period_end: string }>();
  for (const chunk of chunkIds(snapshotIds, 50)) {
    const { data, error } = await supabase
      .from("seo_search_snapshots")
      .select("id, period_start, period_end")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      snapshots.set(row.id as string, {
        period_start: row.period_start as string,
        period_end: row.period_end as string,
      });
    }
  }
  return metrics
    .flatMap((metric) => {
      const snapshot = snapshots.get(metric.snapshot_id);
      if (!snapshot) return [];
      return [{
        periodStart: snapshot.period_start,
        periodEnd: snapshot.period_end,
        impressions: readMetricNumber(metric.impressions),
        clicks: readMetricNumber(metric.clicks),
        ctr: readMetricNumber(metric.ctr),
        avgPosition: readMetricNumber(metric.avg_position),
      }];
    })
    .sort((left, right) => left.periodStart.localeCompare(right.periodStart) || left.periodEnd.localeCompare(right.periodEnd));
}
