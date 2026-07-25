import { buildCsv } from "@/lib/admin/analytics-csv";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import {
  resolveAdminAnalyticsPeriodRange,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import {
  topNToLimit,
  type AdminAttributionConfidence,
  type AdminAttributionMode,
  type AdminAnalyticsTopN,
} from "@/lib/admin/analytics-url-state";
import { acquisitionSourceLabel } from "@/lib/analytics/source-class";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminAttributionSummaryBundle = {
  mode: AdminAttributionMode;
  period: AdminAnalyticsPeriod;
  periodLabel: string;
  from: string | null;
  to: string | null;
  includeTest: boolean;
  currency: string;
  paymentsTotal: number;
  buyersTotal: number;
  grossMinorTotal: number;
  paymentsAttributed: number;
  paymentsUnattributed: number;
  buyersAttributed: number;
  grossMinorAttributed: number;
  grossMinorUnattributed: number;
  coveragePct: number | null;
  exactCoveragePct: number | null;
  inferredCoveragePct: number | null;
  confidence: {
    exact: number;
    strong: number;
    inferred: number;
    unknown: number;
  };
  linkage: {
    missingRecord: number;
    directOrUnknown: number;
    note: string;
  };
  tracking: {
    firstTouchUserExactTotal: number;
    firstTouchUserInferredTotal: number;
    firstTouchExactSince: string;
    sessionTouchExactSince: string;
    historicalBackfillApplied: boolean;
    smallSample: boolean;
  };
  notes: Record<string, unknown>;
  error: string | null;
};

export type AdminAttributionBundle = {
  summary: AdminAttributionSummaryBundle;
  sources: { rows: Record<string, unknown>[]; total: number };
  campaigns: { rows: Record<string, unknown>[] };
  landings: { rows: Record<string, unknown>[]; conversionNote: string | null };
  products: { rows: Record<string, unknown>[] };
  authors: { rows: Record<string, unknown>[]; note: string | null };
  comparison: {
    groups: Record<string, unknown>[];
    pathExamples: Record<string, unknown>[];
    note: string | null;
  };
  timeToPurchase: Record<string, unknown>;
  backfillPreview: Record<string, unknown>;
  integrity: {
    critical: number;
    warning: number;
    coverageLimitation: number;
  };
  methodology: {
    banner: string;
    firstTouchTooltip: string;
    sessionTouchTooltip: string;
    historicalNote: string;
    sessionTouchNote: string;
  };
  emptyState: "no_payments" | "no_attribution" | "small_sample" | "ok";
};

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emptyUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function getAdminAttributionBundle(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  mode: AdminAttributionMode;
  confidence: AdminAttributionConfidence;
  sourceClass: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  campaign: string | null;
  landing: string | null;
  authorId: string | null;
  practiceId: string | null;
  search: string;
  top: AdminAnalyticsTopN;
  sort: string;
  sortDir: "asc" | "desc";
}): Promise<AdminAttributionBundle> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();
  const limit = topNToLimit(input.top);
  const authorId = emptyUuid(input.authorId);
  const practiceId = emptyUuid(input.practiceId);

  const common = {
    p_from: range.from,
    p_to: range.to,
    p_include_test: input.includeTest,
    p_author_id: authorId,
    p_practice_id: practiceId,
  };

  const modeArgs = {
    ...common,
    p_mode: input.mode,
    p_confidence: input.confidence,
    p_source_class: input.sourceClass,
    p_utm_source: input.utmSource,
    p_utm_medium: input.utmMedium,
    p_utm_campaign: input.campaign,
    p_landing: input.landing,
    p_search: input.search || null,
  };

  const [
    summaryRes,
    sourcesRes,
    campaignsRes,
    landingsRes,
    productsRes,
    authorsRes,
    comparisonRes,
    timeRes,
    backfillRes,
    integrityRes,
  ] = await Promise.all([
    supabase.rpc("admin_attribution_p323_summary", modeArgs),
    supabase.rpc("admin_attribution_p323_sources", {
      ...modeArgs,
      p_sort: input.sort,
      p_sort_dir: input.sortDir,
      p_limit: limit,
    }),
    supabase.rpc("admin_attribution_p323_campaigns", {
      ...modeArgs,
      p_limit: limit,
    }),
    supabase.rpc("admin_attribution_p323_landings", {
      ...modeArgs,
      p_limit: limit,
    }),
    supabase.rpc("admin_attribution_p323_products", {
      ...common,
      p_confidence: input.confidence,
      p_search: input.search || null,
      p_limit: limit,
    }),
    supabase.rpc("admin_attribution_p323_authors", {
      ...common,
      p_confidence: input.confidence,
      p_search: input.search || null,
      p_limit: limit,
    }),
    supabase.rpc("admin_attribution_p323_touch_comparison", common),
    supabase.rpc("admin_attribution_p323_time_to_purchase", common),
    supabase.rpc("admin_attribution_p323_backfill_preview"),
    supabase.rpc("admin_attribution_p323_integrity_snapshot", {
      p_since: null,
    }),
  ]);

  const summaryRaw = (summaryRes.data ?? {}) as Record<string, unknown>;
  const confidence = (summaryRaw.confidence ?? {}) as Record<string, unknown>;
  const linkage = (summaryRaw.linkage ?? {}) as Record<string, unknown>;
  const tracking = (summaryRaw.tracking ?? {}) as Record<string, unknown>;

  const summary: AdminAttributionSummaryBundle = {
    mode: input.mode,
    period: input.period,
    periodLabel: range.label,
    from: range.from,
    to: range.to,
    includeTest: input.includeTest,
    currency: "RUB",
    paymentsTotal: asNumber(summaryRaw.payments_total),
    buyersTotal: asNumber(summaryRaw.buyers_total),
    grossMinorTotal: asNumber(summaryRaw.gross_minor_total),
    paymentsAttributed: asNumber(summaryRaw.payments_attributed),
    paymentsUnattributed: asNumber(summaryRaw.payments_unattributed),
    buyersAttributed: asNumber(summaryRaw.buyers_attributed),
    grossMinorAttributed: asNumber(summaryRaw.gross_minor_attributed),
    grossMinorUnattributed: asNumber(summaryRaw.gross_minor_unattributed),
    coveragePct: asNullableNumber(summaryRaw.coverage_pct),
    exactCoveragePct: asNullableNumber(summaryRaw.exact_coverage_pct),
    inferredCoveragePct: asNullableNumber(summaryRaw.inferred_coverage_pct),
    confidence: {
      exact: asNumber(confidence.exact),
      strong: asNumber(confidence.strong),
      inferred: asNumber(confidence.inferred),
      unknown: asNumber(confidence.unknown),
    },
    linkage: {
      missingRecord: asNumber(linkage.missing_record),
      directOrUnknown: asNumber(linkage.direct_or_unknown),
      note: typeof linkage.note === "string" ? linkage.note : "",
    },
    tracking: {
      firstTouchUserExactTotal: asNumber(
        tracking.first_touch_user_exact_total,
      ),
      firstTouchUserInferredTotal: asNumber(
        tracking.first_touch_user_inferred_total,
      ),
      firstTouchExactSince: String(tracking.first_touch_exact_since ?? "P3.2.2"),
      sessionTouchExactSince: String(
        tracking.session_touch_exact_since ?? "P3.2.0",
      ),
      historicalBackfillApplied: Boolean(tracking.historical_backfill_applied),
      smallSample: Boolean(tracking.small_sample),
    },
    notes: (summaryRaw.notes as Record<string, unknown>) ?? {},
    error: summaryRes.error?.message ?? null,
  };

  const sourcesData = (sourcesRes.data ?? {}) as Record<string, unknown>;
  const campaignsData = (campaignsRes.data ?? {}) as Record<string, unknown>;
  const landingsData = (landingsRes.data ?? {}) as Record<string, unknown>;
  const productsData = (productsRes.data ?? {}) as Record<string, unknown>;
  const authorsData = (authorsRes.data ?? {}) as Record<string, unknown>;
  const comparisonData = (comparisonRes.data ?? {}) as Record<string, unknown>;
  const integrityData = (integrityRes.data ?? {}) as Record<string, unknown>;

  let emptyState: AdminAttributionBundle["emptyState"] = "ok";
  if (summary.paymentsTotal === 0) emptyState = "no_payments";
  else if (summary.paymentsAttributed === 0) emptyState = "no_attribution";
  else if (summary.tracking.smallSample) emptyState = "small_sample";

  return {
    summary,
    sources: {
      rows: Array.isArray(sourcesData.rows)
        ? (sourcesData.rows as Record<string, unknown>[])
        : [],
      total: asNumber(sourcesData.total),
    },
    campaigns: {
      rows: Array.isArray(campaignsData.rows)
        ? (campaignsData.rows as Record<string, unknown>[])
        : [],
    },
    landings: {
      rows: Array.isArray(landingsData.rows)
        ? (landingsData.rows as Record<string, unknown>[])
        : [],
      conversionNote:
        typeof landingsData.conversion_note === "string"
          ? landingsData.conversion_note
          : null,
    },
    products: {
      rows: Array.isArray(productsData.rows)
        ? (productsData.rows as Record<string, unknown>[])
        : [],
    },
    authors: {
      rows: Array.isArray(authorsData.rows)
        ? (authorsData.rows as Record<string, unknown>[])
        : [],
      note: typeof authorsData.note === "string" ? authorsData.note : null,
    },
    comparison: {
      groups: Array.isArray(comparisonData.groups)
        ? (comparisonData.groups as Record<string, unknown>[])
        : [],
      pathExamples: Array.isArray(comparisonData.path_examples)
        ? (comparisonData.path_examples as Record<string, unknown>[])
        : [],
      note:
        typeof comparisonData.note === "string" ? comparisonData.note : null,
    },
    timeToPurchase: (timeRes.data as Record<string, unknown>) ?? {},
    backfillPreview: (backfillRes.data as Record<string, unknown>) ?? {},
    integrity: {
      critical: asNumber(integrityData.critical),
      warning: asNumber(integrityData.warning),
      coverageLimitation: asNumber(integrityData.coverage_limitation),
    },
    methodology: {
      banner:
        "First-touch показывает первый известный источник пользователя. Сессия заказа показывает источник сессии, в которой был создан заказ. Эти модели отвечают на разные вопросы и не являются multi-touch атрибуцией.",
      firstTouchTooltip:
        "Первый известный источник пользователя в пределах доступной аналитической истории.",
      sessionTouchTooltip:
        "Источник проверенной аналитической сессии, в которой был создан заказ.",
      historicalNote:
        "Исторические first-touch записи пока не восстановлены. Данные exact начинают накапливаться с релиза P3.2.2.",
      sessionTouchNote:
        "Точная session-touch атрибуция заказов начинает накапливаться с релиза P3.2.0.",
    },
    emptyState,
  };
}

function displayUtm(value: unknown, emptyLabel: string): string {
  if (typeof value === "string" && value.trim()) return value;
  return emptyLabel;
}

export function buildAttributionSourcesCsv(
  mode: AdminAttributionMode,
  rows: Record<string, unknown>[],
): string {
  return buildCsv(
    [
      "attribution_mode",
      "source_class",
      "source_label",
      "utm_source",
      "utm_medium",
      "payment_count",
      "unique_buyers",
      "gross_amount_minor",
      "formatted_gross",
      "currency",
      "exact_count",
      "inferred_count",
      "unknown_count",
      "coverage_share_pct",
    ],
    rows.map((row) => [
      mode,
      String(row.source_class ?? ""),
      acquisitionSourceLabel(
        row.source_class as Parameters<typeof acquisitionSourceLabel>[0],
      ),
      displayUtm(row.utm_source, "Без UTM"),
      displayUtm(row.utm_medium, "Без medium"),
      asNumber(row.payment_count),
      asNumber(row.unique_buyers),
      asNumber(row.gross_minor),
      formatRubFromMinor(asNumber(row.gross_minor)),
      "RUB",
      asNumber(row.exact_count),
      asNumber(row.inferred_count),
      asNumber(row.unknown_count),
      row.coverage_share_pct == null ? "" : String(row.coverage_share_pct),
    ]),
  );
}

export function buildAttributionCampaignsCsv(
  mode: AdminAttributionMode,
  rows: Record<string, unknown>[],
): string {
  return buildCsv(
    [
      "attribution_mode",
      "source_class",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "payment_count",
      "unique_buyers",
      "gross_amount_minor",
      "formatted_gross",
      "currency",
      "exact_count",
      "inferred_count",
      "unknown_count",
    ],
    rows.map((row) => [
      mode,
      String(row.source_class ?? ""),
      displayUtm(row.utm_source, "Без UTM"),
      displayUtm(row.utm_medium, "Без medium"),
      displayUtm(row.utm_campaign, "Без campaign"),
      displayUtm(row.utm_content, ""),
      displayUtm(row.utm_term, ""),
      asNumber(row.payment_count),
      asNumber(row.unique_buyers),
      asNumber(row.gross_minor),
      formatRubFromMinor(asNumber(row.gross_minor)),
      "RUB",
      asNumber(row.exact_count),
      asNumber(row.inferred_count),
      asNumber(row.unknown_count),
    ]),
  );
}

export function buildAttributionLandingsCsv(
  mode: AdminAttributionMode,
  rows: Record<string, unknown>[],
): string {
  return buildCsv(
    [
      "attribution_mode",
      "landing_path",
      "payment_count",
      "unique_buyers",
      "gross_amount_minor",
      "formatted_gross",
      "currency",
      "exact_count",
      "inferred_count",
      "top_product",
      "top_author",
    ],
    rows.map((row) => [
      mode,
      String(row.landing_path ?? ""),
      asNumber(row.payment_count),
      asNumber(row.unique_buyers),
      asNumber(row.gross_minor),
      formatRubFromMinor(asNumber(row.gross_minor)),
      "RUB",
      asNumber(row.exact_count),
      asNumber(row.inferred_count),
      String(row.top_product ?? ""),
      String(row.top_author ?? ""),
    ]),
  );
}

export function buildAttributionProductsCsv(
  rows: Record<string, unknown>[],
): string {
  return buildCsv(
    [
      "practice_title",
      "payment_count",
      "unique_buyers",
      "gross_amount_minor",
      "formatted_gross",
      "currency",
      "ft_attributed",
      "st_attributed",
      "top_ft_source",
      "top_st_source",
    ],
    rows.map((row) => [
      String(row.practice_title ?? ""),
      asNumber(row.payment_count),
      asNumber(row.unique_buyers),
      asNumber(row.gross_minor),
      formatRubFromMinor(asNumber(row.gross_minor)),
      "RUB",
      asNumber(row.ft_attributed),
      asNumber(row.st_attributed),
      String(row.top_ft_source ?? ""),
      String(row.top_st_source ?? ""),
    ]),
  );
}

export function buildAttributionAuthorsCsv(
  rows: Record<string, unknown>[],
): string {
  return buildCsv(
    [
      "author_name",
      "payment_count",
      "unique_buyers",
      "gross_amount_minor",
      "formatted_gross",
      "currency",
      "attributed_gross_minor",
      "unattributed_gross_minor",
      "top_ft_source",
      "top_st_source",
      "note",
    ],
    rows.map((row) => [
      String(row.author_name ?? ""),
      asNumber(row.payment_count),
      asNumber(row.unique_buyers),
      asNumber(row.gross_minor),
      formatRubFromMinor(asNumber(row.gross_minor)),
      "RUB",
      asNumber(row.attributed_gross_minor),
      asNumber(row.unattributed_gross_minor),
      String(row.top_ft_source ?? ""),
      String(row.top_st_source ?? ""),
      "gross is payments for author products, not payout",
    ]),
  );
}

export function buildAttributionComparisonCsv(
  groups: Record<string, unknown>[],
): string {
  return buildCsv(
    ["cmp_group", "payment_count", "unique_buyers", "gross_amount_minor", "formatted_gross", "currency"],
    groups.map((row) => [
      String(row.cmp_group ?? ""),
      asNumber(row.payment_count),
      asNumber(row.unique_buyers),
      asNumber(row.gross_minor),
      formatRubFromMinor(asNumber(row.gross_minor)),
      "RUB",
    ]),
  );
}

export function buildAttributionTimeCsv(
  time: Record<string, unknown>,
): string {
  const ft = (time.first_touch_to_first_payment ?? {}) as Record<string, unknown>;
  return buildCsv(
    ["metric", "value"],
    [
      ["median_sec", ft.median_sec == null ? "" : String(ft.median_sec)],
      ["p25_sec", ft.p25_sec == null ? "" : String(ft.p25_sec)],
      ["p75_sec", ft.p75_sec == null ? "" : String(ft.p75_sec)],
      ["bucket_lt_10m", asNumber(ft.bucket_lt_10m)],
      ["bucket_10m_60m", asNumber(ft.bucket_10m_60m)],
      ["bucket_1h_24h", asNumber(ft.bucket_1h_24h)],
      ["bucket_1d_7d", asNumber(ft.bucket_1d_7d)],
      ["bucket_gt_7d", asNumber(ft.bucket_gt_7d)],
      ["bucket_unknown", asNumber(ft.bucket_unknown)],
    ],
  );
}
