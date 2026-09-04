/**
 * Author stats read models. Access must already be proved by the API route.
 * Uses service_role only because author_stats_* RPCs are service_role-only.
 */

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import type {
  AuthorStatsProductRow,
  AuthorStatsSourceBucket,
  AuthorStatsSourceRow,
  AuthorStatsSummary,
  AuthorStatsTimeseries,
  AuthorStatsTimeseriesPoint,
} from "./types";

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

const SOURCE_BUCKETS = new Set<AuthorStatsSourceBucket>([
  "direct",
  "internal",
  "telegram",
  "vk",
  "max",
  "search",
  "other_external",
  "unknown",
]);

function mapSummary(raw: unknown): AuthorStatsSummary | null {
  const row = asRecord(raw);
  if (!("practice_views" in row) && !("author_page_views" in row)) {
    return null;
  }

  return {
    authorPageViews: asNumber(row.author_page_views),
    authorPageUniqueVisitors: asNumber(row.author_page_unique_visitors),
    practiceViews: asNumber(row.practice_views),
    practiceUniqueVisitors: asNumber(row.practice_unique_visitors),
    plays: asNumber(row.plays),
    progress25: asNumber(row.progress_25),
    completions: asNumber(row.completions),
    librarySaves: asNumber(row.library_saves),
    grossPurchases: asNumber(row.gross_purchases),
    refundSales: asNumber(row.refund_sales),
    fullRefunds: asNumber(row.full_refunds),
    partialRefunds: asNumber(row.partial_refunds),
    netSales: asNumber(row.net_sales),
    grossRevenueMinor: asNumber(row.gross_revenue_minor),
    refundedAmountMinor: asNumber(row.refunded_amount_minor),
    netRevenueMinor: asNumber(row.net_revenue_minor),
    viewToPlayRate: asNullableNumber(row.view_to_play_rate),
    playToCompleteRate: asNullableNumber(row.play_to_complete_rate),
    viewToSaveRate: asNullableNumber(row.view_to_save_rate),
    viewToPurchaseRate: asNullableNumber(row.view_to_purchase_rate),
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

function mapPoint(raw: unknown): AuthorStatsTimeseriesPoint | null {
  const row = asRecord(raw);
  const date = asText(row.date);
  if (!date) return null;

  return {
    date,
    practiceViews: asNumber(row.practice_views),
    practiceUniqueVisitors: asNumber(row.practice_unique_visitors),
    plays: asNumber(row.plays),
    progress25: asNumber(row.progress_25),
    completions: asNumber(row.completions),
    librarySaves: asNumber(row.library_saves),
    grossPurchases: asNumber(row.gross_purchases),
    refundSales: asNumber(row.refund_sales),
    fullRefunds: asNumber(row.full_refunds),
    partialRefunds: asNumber(row.partial_refunds),
    netSales: asNumber(row.net_sales),
    authorPageViews: asNumber(row.author_page_views),
    authorPageUniqueVisitors: asNumber(row.author_page_unique_visitors),
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

function mapProduct(raw: unknown): AuthorStatsProductRow | null {
  const row = asRecord(raw);
  const productSlug = asText(row.product_slug);
  if (!productSlug) return null;

  return {
    productSlug,
    title: asText(row.title) ?? "Без названия",
    slug: asText(row.slug) ?? "",
    status: asText(row.status) ?? "unknown",
    isFree: Boolean(row.is_free),
    price:
      row.price === null || row.price === undefined
        ? null
        : asNumber(row.price),
    practiceViews: asNumber(row.practice_views),
    practiceUniqueVisitors: asNumber(row.practice_unique_visitors),
    plays: asNumber(row.plays),
    progress25: asNumber(row.progress_25),
    completions: asNumber(row.completions),
    librarySaves: asNumber(row.library_saves),
    grossPurchases: asNumber(row.gross_purchases),
    refundSales: asNumber(row.refund_sales),
    fullRefunds: asNumber(row.full_refunds),
    partialRefunds: asNumber(row.partial_refunds),
    netSales: asNumber(row.net_sales),
    grossRevenueMinor: asNumber(row.gross_revenue_minor),
    refundedAmountMinor: asNumber(row.refunded_amount_minor),
    netRevenueMinor: asNumber(row.net_revenue_minor),
    viewToPlayRate: asNullableNumber(row.view_to_play_rate),
    playToCompleteRate: asNullableNumber(row.play_to_complete_rate),
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
  };
}

function mapSource(raw: unknown): AuthorStatsSourceRow | null {
  const row = asRecord(raw);
  const bucket = asText(row.bucket);
  if (!bucket || !SOURCE_BUCKETS.has(bucket as AuthorStatsSourceBucket)) {
    return null;
  }

  return {
    bucket: bucket as AuthorStatsSourceBucket,
    views: asNumber(row.views),
    visitors: asNumber(row.visitors),
    plays: asNumber(row.plays),
  };
}

type Bounds = {
  authorId: string;
  dateFrom: string | null;
  dateTo: string | null;
};

export async function getAuthorStatsSummary(
  input: Bounds,
): Promise<AuthorStatsSummary | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("author_stats_summary", {
    p_author_id: input.authorId,
    p_from: input.dateFrom,
    p_to: input.dateTo,
  });

  if (error) {
    console.error("author_stats_summary_failed", error.message);
    return null;
  }

  return mapSummary(data);
}

export async function getAuthorStatsTimeseries(
  input: Bounds,
): Promise<AuthorStatsTimeseries | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("author_stats_timeseries", {
    p_author_id: input.authorId,
    p_from: input.dateFrom,
    p_to: input.dateTo,
  });

  if (error) {
    console.error("author_stats_timeseries_failed", error.message);
    return null;
  }

  const row = asRecord(data);
  const pointsRaw = Array.isArray(row.points) ? row.points : [];
  const points = pointsRaw
    .map(mapPoint)
    .filter((point): point is AuthorStatsTimeseriesPoint => point !== null);

  return {
    from: asText(row.from),
    to: asText(row.to),
    points,
  };
}

export async function getAuthorStatsProducts(
  input: Bounds,
): Promise<AuthorStatsProductRow[] | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("author_stats_products", {
    p_author_id: input.authorId,
    p_from: input.dateFrom,
    p_to: input.dateTo,
  });

  if (error) {
    console.error("author_stats_products_failed", error.message);
    return null;
  }

  const row = asRecord(data);
  const rowsRaw = Array.isArray(row.rows) ? row.rows : [];
  return rowsRaw
    .map(mapProduct)
    .filter((item): item is AuthorStatsProductRow => item !== null);
}

export async function getAuthorStatsSources(
  input: Bounds,
): Promise<AuthorStatsSourceRow[] | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("author_stats_sources", {
    p_author_id: input.authorId,
    p_from: input.dateFrom,
    p_to: input.dateTo,
  });

  if (error) {
    console.error("author_stats_sources_failed", error.message);
    return null;
  }

  const row = asRecord(data);
  const rowsRaw = Array.isArray(row.rows) ? row.rows : [];
  return rowsRaw
    .map(mapSource)
    .filter((item): item is AuthorStatsSourceRow => item !== null);
}
