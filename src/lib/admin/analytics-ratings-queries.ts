import "server-only";

import {
  ADMIN_RATINGS_AVG_NOTE,
  ADMIN_RATINGS_DIAGNOSTICS_NOTE,
  ADMIN_RATINGS_EXCLUDED_NOTE,
  ADMIN_RATINGS_JOURNAL_NOTE,
  ADMIN_RATINGS_TEMPORAL_NOTE,
} from "@/lib/admin/analytics-ratings-dictionary";
import {
  ADMIN_RATINGS_JOURNAL_PAGE_SIZE,
  formatAdminAverageStars,
  formatAdminConversion,
  parseAdminRatingsAuthorSort,
  parseAdminRatingsPeriod,
  parseAdminRatingsProductSort,
  throwIfAdminRatingsRpcFailed,
  type AdminRatingsAuthorRow,
  type AdminRatingsBreakdownBundle,
  type AdminRatingsDiagnosticObservation,
  type AdminRatingsDiagnosticsBundle,
  type AdminRatingsEventRow,
  type AdminRatingsEventsBundle,
  type AdminRatingsExcludedFilter,
  type AdminRatingsExcludedRow,
  type AdminRatingsPeriod,
  type AdminRatingsProductRow,
  type AdminRatingsSummaryBundle,
} from "@/lib/admin/analytics-ratings";
import { resolveAdminAnalyticsPeriodRange } from "@/lib/admin/analytics-period";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type {
  AdminRatingsAuthorRow,
  AdminRatingsBreakdownBundle,
  AdminRatingsDiagnosticsBundle,
  AdminRatingsEventRow,
  AdminRatingsEventsBundle,
  AdminRatingsExcludedRow,
  AdminRatingsProductRow,
  AdminRatingsSummaryBundle,
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asProductKind(
  value: unknown,
): AdminRatingsProductRow["productKind"] {
  if (value === "music" || value === "audio_post" || value === "practice") {
    return value;
  }
  return "practice";
}

function ratingsPeriodRange(period: AdminRatingsPeriod) {
  return resolveAdminAnalyticsPeriodRange(period);
}

export async function getAdminRatingsSummaryBundle(input: {
  period?: string | null;
}): Promise<AdminRatingsSummaryBundle> {
  const period = parseAdminRatingsPeriod(input.period);
  const range = ratingsPeriodRange(period);
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("admin_ratings_summary", {
    p_from: range.from,
    p_to: range.to,
  });

  if (error) {
    console.error("admin_ratings_summary_error", error.message);
    throwIfAdminRatingsRpcFailed(error);
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const ratingCount = asNumber(raw.rating_count);
  const totalStars = asNumber(raw.total_stars);
  const average = asNullableNumber(raw.average);
  const conversion = asNullableNumber(raw.conversion);

  return {
    period,
    periodLabel: range.label,
    generatedAt: new Date().toISOString(),
    ratingCount,
    totalStars,
    uniqueRaters: asNumber(raw.unique_raters),
    average,
    averageFormatted: formatAdminAverageStars(average),
    eligibleListeners: asNumber(raw.eligible_listeners),
    eligibleUnrated: asNumber(raw.eligible_unrated),
    ratedEligible: asNumber(raw.rated_eligible),
    conversion,
    conversionFormatted: formatAdminConversion(conversion),
    activeCount: asNumber(raw.active_count),
    excludedCount: asNumber(raw.excluded_count),
    notes: {
      temporal: ADMIN_RATINGS_TEMPORAL_NOTE,
      average: ADMIN_RATINGS_AVG_NOTE,
      excluded: ADMIN_RATINGS_EXCLUDED_NOTE,
      diagnostics: ADMIN_RATINGS_DIAGNOSTICS_NOTE,
      journal: ADMIN_RATINGS_JOURNAL_NOTE,
    },
  };
}

export async function getAdminRatingsBreakdownBundle(input: {
  q?: string | null;
  productsSort?: string | null;
  productsSortDir?: string | null;
  authorsSort?: string | null;
  authorsSortDir?: string | null;
}): Promise<AdminRatingsBreakdownBundle> {
  const range7d = ratingsPeriodRange("7d");
  const range30d = ratingsPeriodRange("30d");
  const productsSort = parseAdminRatingsProductSort(input.productsSort);
  const authorsSort = parseAdminRatingsAuthorSort(input.authorsSort);
  const productsSortDir = input.productsSortDir === "asc" ? "asc" : "desc";
  const authorsSortDir = input.authorsSortDir === "asc" ? "asc" : "desc";
  const supabase = createServiceRoleClient();

  const [productsResult, authorsResult] = await Promise.all([
    supabase.rpc("admin_ratings_products", {
      p_from_7d: range7d.from,
      p_from_30d: range30d.from,
      p_to: range7d.to,
      p_search: input.q?.trim() || null,
      p_sort: productsSort,
      p_sort_dir: productsSortDir,
      p_limit: 100,
      p_offset: 0,
    }),
    supabase.rpc("admin_ratings_authors", {
      p_from_7d: range7d.from,
      p_from_30d: range30d.from,
      p_to: range7d.to,
      p_search: input.q?.trim() || null,
      p_sort: authorsSort,
      p_sort_dir: authorsSortDir,
      p_limit: 100,
      p_offset: 0,
    }),
  ]);

  if (productsResult.error) {
    console.error("admin_ratings_products_error", productsResult.error.message);
    throwIfAdminRatingsRpcFailed(productsResult.error);
  }
  if (authorsResult.error) {
    console.error("admin_ratings_authors_error", authorsResult.error.message);
    throwIfAdminRatingsRpcFailed(authorsResult.error);
  }

  const productsRaw = (productsResult.data ?? {}) as Record<string, unknown>;
  const authorsRaw = (authorsResult.data ?? {}) as Record<string, unknown>;

  const productRows = Array.isArray(productsRaw.rows)
    ? productsRaw.rows.flatMap((row) => {
        const r = row as Record<string, unknown>;
        if (typeof r.practice_id !== "string") return [];
        const average = asNullableNumber(r.average);
        const conversion = asNullableNumber(r.conversion);
        return [
          {
            practiceId: r.practice_id,
            title: String(r.title ?? "Практика"),
            productKind: asProductKind(r.product_kind),
            authorId: asText(r.author_id),
            authorName: String(r.author_name ?? "Автор"),
            authorSlug: asText(r.author_slug),
            href: asText(r.href),
            totalStars: asNumber(r.total_stars),
            ratingCount: asNumber(r.rating_count),
            average,
            averageFormatted: formatAdminAverageStars(average),
            stars7d: asNumber(r.stars_7d),
            count7d: asNumber(r.count_7d),
            stars30d: asNumber(r.stars_30d),
            count30d: asNumber(r.count_30d),
            eligibleListeners: asNumber(r.eligible_listeners),
            ratedEligible: asNumber(r.rated_eligible),
            conversion,
            conversionFormatted: formatAdminConversion(conversion),
          } satisfies AdminRatingsProductRow,
        ];
      })
    : [];

  const authorRows = Array.isArray(authorsRaw.rows)
    ? authorsRaw.rows.flatMap((row) => {
        const r = row as Record<string, unknown>;
        if (typeof r.author_id !== "string") return [];
        const average = asNullableNumber(r.average);
        return [
          {
            authorId: r.author_id,
            authorName: String(r.author_name ?? "Автор"),
            authorSlug: asText(r.author_slug),
            href: asText(r.href),
            totalStars: asNumber(r.total_stars),
            ratingCount: asNumber(r.rating_count),
            average,
            averageFormatted: formatAdminAverageStars(average),
            uniqueRaters: asNumber(r.unique_raters),
            stars7d: asNumber(r.stars_7d),
            count7d: asNumber(r.count_7d),
            stars30d: asNumber(r.stars_30d),
            count30d: asNumber(r.count_30d),
            ratingBearingProducts: asNumber(r.rating_bearing_products),
          } satisfies AdminRatingsAuthorRow,
        ];
      })
    : [];

  return {
    products: {
      total: asNumber(productsRaw.total),
      rows: productRows,
      sort: parseAdminRatingsProductSort(asText(productsRaw.sort)),
      sortDir: productsRaw.sort_dir === "asc" ? "asc" : "desc",
      error: null,
    },
    authors: {
      total: asNumber(authorsRaw.total),
      rows: authorRows,
      sort: parseAdminRatingsAuthorSort(asText(authorsRaw.sort)),
      sortDir: authorsRaw.sort_dir === "asc" ? "asc" : "desc",
      error: null,
    },
  };
}

export async function getAdminRatingsEventsBundle(input: {
  period?: string | null;
  practiceId?: string | null;
  authorId?: string | null;
  eventKind?: string | null;
  excluded?: string | null;
  offset?: string | number | null;
}): Promise<AdminRatingsEventsBundle> {
  const period = parseAdminRatingsPeriod(input.period);
  const range = ratingsPeriodRange(period);
  const offsetRaw =
    typeof input.offset === "number"
      ? input.offset
      : Number.parseInt(String(input.offset ?? "0"), 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  const eventKind =
    input.eventKind === "first" || input.eventKind === "changed"
      ? input.eventKind
      : null;
  const excluded: AdminRatingsExcludedFilter | null =
    input.excluded === "included" || input.excluded === "excluded"
      ? input.excluded
      : null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("admin_ratings_events", {
    p_from: range.from,
    p_to: range.to,
    p_practice_id: input.practiceId || null,
    p_author_id: input.authorId || null,
    p_event_kind: eventKind,
    p_excluded: excluded,
    p_limit: ADMIN_RATINGS_JOURNAL_PAGE_SIZE,
    p_offset: offset,
  });

  if (error) {
    console.error("admin_ratings_events_error", error.message);
    throwIfAdminRatingsRpcFailed(error);
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(raw.rows)
    ? raw.rows.flatMap((row) => {
        const r = row as Record<string, unknown>;
        if (typeof r.id !== "string") return [];
        return [
          {
            id: r.id,
            occurredAt: String(r.occurred_at ?? ""),
            oldStars: asNullableNumber(r.old_stars),
            newStars: asNumber(r.new_stars),
            eventKind: r.event_kind === "changed" ? "changed" : "first",
            userId: String(r.user_id ?? ""),
            listenerLabel: String(r.listener_label ?? "Слушатель"),
            practiceId: String(r.practice_id ?? ""),
            title: String(r.title ?? "Практика"),
            href: asText(r.href),
            authorId: asText(r.author_id),
            authorName: String(r.author_name ?? "Автор"),
            excluded: r.excluded === true,
            excludedReason: asText(r.excluded_reason),
          } satisfies AdminRatingsEventRow,
        ];
      })
    : [];

  return {
    total: asNumber(raw.total),
    limit: asNumber(raw.limit, ADMIN_RATINGS_JOURNAL_PAGE_SIZE),
    offset: asNumber(raw.offset, offset),
    rows,
    error: null,
  };
}

export async function getAdminRatingsDiagnosticsBundle(): Promise<AdminRatingsDiagnosticsBundle> {
  const supabase = createServiceRoleClient();
  const [diagResult, excludedResult] = await Promise.all([
    supabase.rpc("admin_ratings_diagnostics"),
    supabase.rpc("admin_ratings_excluded", { p_limit: 50, p_offset: 0 }),
  ]);

  if (diagResult.error) {
    console.error("admin_ratings_diagnostics_error", diagResult.error.message);
    throwIfAdminRatingsRpcFailed(diagResult.error);
  }
  if (excludedResult.error) {
    console.error("admin_ratings_excluded_error", excludedResult.error.message);
    throwIfAdminRatingsRpcFailed(excludedResult.error);
  }

  const diagRaw = (diagResult.data ?? {}) as Record<string, unknown>;
  const excludedRaw = (excludedResult.data ?? {}) as Record<string, unknown>;

  const observations = Array.isArray(diagRaw.observations)
    ? diagRaw.observations.flatMap((row) => {
        const r = row as Record<string, unknown>;
        if (typeof r.kind !== "string" || typeof r.label !== "string") {
          return [];
        }
        return [
          {
            kind: r.kind,
            label: r.label,
            detail: String(r.detail ?? ""),
            count: asNumber(r.count),
          } as AdminRatingsDiagnosticObservation,
        ];
      })
    : [];

  const excludedRows = Array.isArray(excludedRaw.rows)
    ? excludedRaw.rows.flatMap((row) => {
        const r = row as Record<string, unknown>;
        if (typeof r.id !== "string") return [];
        return [
          {
            id: r.id,
            userId: String(r.user_id ?? ""),
            practiceId: String(r.practice_id ?? ""),
            stars: asNumber(r.stars),
            createdAt: String(r.created_at ?? ""),
            excludedAt: String(r.excluded_at ?? ""),
            excludedReason: asText(r.excluded_reason),
            title: String(r.title ?? "Практика"),
            authorName: String(r.author_name ?? "Автор"),
          } satisfies AdminRatingsExcludedRow,
        ];
      })
    : [];

  return {
    attention: diagRaw.attention === true || observations.length > 0,
    observations,
    excluded: {
      total: asNumber(excludedRaw.total),
      rows: excludedRows,
    },
    notes: {
      diagnostics: ADMIN_RATINGS_DIAGNOSTICS_NOTE,
      excluded: ADMIN_RATINGS_EXCLUDED_NOTE,
    },
  };
}
