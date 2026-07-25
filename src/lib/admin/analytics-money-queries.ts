import {
  ADMIN_MONEY_METRIC_DICTIONARY,
  type AdminMoneyMetricKey,
} from "@/lib/admin/analytics-money-dictionary";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import {
  formatAdminDelta,
  resolveAdminAnalyticsPeriodRange,
  resolvePreviousAdminAnalyticsPeriodRange,
  type AdminAnalyticsDelta,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminMoneyKpiCard = {
  key: AdminMoneyMetricKey;
  label: string;
  value: number | null;
  formatted: string;
  kind: string;
  kindLabel: string;
  formula: string;
  hint: string;
  delta: AdminAnalyticsDelta | null;
  sparkline: number[];
};

export type AdminMoneyFunnelStep = {
  key: string;
  label: string;
  entity: string;
  value: number;
};

export type AdminMoneyTimeseriesPoint = {
  bucket: string;
  payments: number;
  uniqueBuyers: number;
  grossMinor: number;
  aovMinor: number | null;
};

export type AdminMoneyProductRow = {
  practiceId: string;
  title: string;
  slug: string | null;
  authorId: string | null;
  authorName: string;
  authorSlug: string | null;
  href: string | null;
  paymentCount: number;
  uniqueBuyers: number;
  grossMinor: number;
  aovMinor: number | null;
  firstTimeBuyers: number;
  repeatBuyers: number;
  accessGranted: number;
  postPurchasePlay: number;
  playConversionPct: number | null;
};

export type AdminMoneyAuthorRow = {
  authorId: string | null;
  authorName: string;
  authorSlug: string | null;
  publishedPractices: number;
  soldProducts: number;
  paymentCount: number;
  uniqueBuyers: number;
  grossMinor: number;
  aovMinor: number | null;
  firstTimeBuyers: number;
  repeatBuyers: number;
};

export type AdminMoneySummaryBundle = {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  periodLabel: string;
  from: string | null;
  to: string | null;
  currency: string;
  paymentCount: number;
  uniqueBuyers: number;
  grossMinor: number;
  aovMinor: number | null;
  newBuyers: number;
  repeatBuyers: number;
  accessGranted: number;
  postPurchasePlay: number;
  testPaymentCount: number;
  testGrossMinor: number;
  kpi: AdminMoneyKpiCard[];
  funnel: AdminMoneyFunnelStep[];
  timeseries: AdminMoneyTimeseriesPoint[];
  notes: {
    sot: string;
    refunds: string;
    authorPayout: string;
    dailyUniqueBuyers: string;
  };
  error: string | null;
};

export type AdminMoneyBreakdownBundle = {
  products: {
    total: number;
    rows: AdminMoneyProductRow[];
    sort: string;
    sortDir: "asc" | "desc";
    error: string | null;
  };
  authors: {
    total: number;
    rows: AdminMoneyAuthorRow[];
    sort: string;
    sortDir: "asc" | "desc";
    error: string | null;
  };
};

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sparkFromSummary(sparkline: unknown, key: "payments" | "gross_minor"): number[] {
  if (!Array.isArray(sparkline)) return [];
  return sparkline.map((point) => {
    if (!point || typeof point !== "object") return 0;
    return asNumber((point as Record<string, unknown>)[key], 0);
  });
}

function buildMoneyKpi(input: {
  paymentCount: number;
  uniqueBuyers: number;
  grossMinor: number;
  aovMinor: number | null;
  repeatBuyers: number;
  previous: Record<string, unknown> | null;
  sparkline: unknown;
}): AdminMoneyKpiCard[] {
  const prev = input.previous;
  const defs = ADMIN_MONEY_METRIC_DICTIONARY;

  const cards: Array<{
    key: AdminMoneyMetricKey;
    value: number | null;
    formatted: string;
    prevValue: number | null | undefined;
    spark: number[];
  }> = [
    {
      key: "payments",
      value: input.paymentCount,
      formatted: String(input.paymentCount),
      prevValue: prev ? asNullableNumber(prev.payment_count) : null,
      spark: sparkFromSummary(input.sparkline, "payments"),
    },
    {
      key: "buyers",
      value: input.uniqueBuyers,
      formatted: String(input.uniqueBuyers),
      prevValue: prev ? asNullableNumber(prev.unique_buyers) : null,
      spark: sparkFromSummary(input.sparkline, "payments"),
    },
    {
      key: "gross",
      value: input.grossMinor,
      formatted: formatRubFromMinor(input.grossMinor),
      prevValue: prev ? asNullableNumber(prev.gross_minor) : null,
      spark: sparkFromSummary(input.sparkline, "gross_minor"),
    },
    {
      key: "aov",
      value: input.aovMinor,
      formatted: formatRubFromMinor(input.aovMinor),
      prevValue: prev ? asNullableNumber(prev.aov_minor) : null,
      spark: sparkFromSummary(input.sparkline, "gross_minor"),
    },
    {
      key: "repeatBuyers",
      value: input.repeatBuyers,
      formatted: String(input.repeatBuyers),
      prevValue: prev ? asNullableNumber(prev.repeat_buyers) : null,
      spark: sparkFromSummary(input.sparkline, "payments"),
    },
  ];

  return cards.map((card) => {
    const def = defs[card.key];
    const delta =
      card.prevValue === null || card.prevValue === undefined || card.value === null
        ? null
        : formatAdminDelta(card.value, card.prevValue);

    return {
      key: card.key,
      label: def.label,
      value: card.value,
      formatted: card.formatted,
      kind: def.kind,
      kindLabel: def.kindLabel,
      formula: def.formula,
      hint: def.hint,
      delta,
      sparkline: card.spark,
    };
  });
}

export async function getAdminMoneySummaryBundle(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  authorId?: string | null;
  practiceId?: string | null;
}): Promise<AdminMoneySummaryBundle> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const previous = resolvePreviousAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();

  const empty: AdminMoneySummaryBundle = {
    period: input.period,
    includeTest: input.includeTest,
    periodLabel: range.label,
    from: range.from,
    to: range.to,
    currency: "RUB",
    paymentCount: 0,
    uniqueBuyers: 0,
    grossMinor: 0,
    aovMinor: null,
    newBuyers: 0,
    repeatBuyers: 0,
    accessGranted: 0,
    postPurchasePlay: 0,
    testPaymentCount: 0,
    testGrossMinor: 0,
    kpi: buildMoneyKpi({
      paymentCount: 0,
      uniqueBuyers: 0,
      grossMinor: 0,
      aovMinor: null,
      repeatBuyers: 0,
      previous: null,
      sparkline: [],
    }),
    funnel: [],
    timeseries: [],
    notes: {
      sot: "payments.status=succeeded",
      refunds: "not_connected",
      authorPayout: "not_connected",
      dailyUniqueBuyers: "not_additive_to_period_unique",
    },
    error: null,
  };

  const bucket =
    input.period === "all" ||
    (range.from &&
      range.to &&
      Date.parse(range.to) - Date.parse(range.from) > 90 * 24 * 60 * 60 * 1000)
      ? "week"
      : "day";

  const [summaryResult, timeseriesResult] = await Promise.all([
    supabase.rpc("admin_payments_p31_summary", {
      p_from: range.from,
      p_to: range.to,
      p_prev_from: previous?.from ?? null,
      p_prev_to: previous?.to ?? null,
      p_include_test: input.includeTest,
      p_author_id: input.authorId ?? null,
      p_practice_id: input.practiceId ?? null,
    }),
    supabase.rpc("admin_payments_p31_timeseries", {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_author_id: input.authorId ?? null,
      p_practice_id: input.practiceId ?? null,
      p_bucket: bucket,
    }),
  ]);

  if (summaryResult.error) {
    console.error("admin_payments_p31_summary_error", summaryResult.error.message);
    return { ...empty, error: "summary_failed" };
  }

  const raw = (summaryResult.data ?? {}) as Record<string, unknown>;
  const previousRaw =
    raw.previous && typeof raw.previous === "object"
      ? (raw.previous as Record<string, unknown>)
      : null;

  const paymentCount = asNumber(raw.payment_count);
  const uniqueBuyers = asNumber(raw.unique_buyers);
  const grossMinor = asNumber(raw.gross_minor);
  const aovMinor = asNullableNumber(raw.aov_minor);
  const repeatBuyers = asNumber(raw.repeat_buyers);

  const funnel = Array.isArray(raw.funnel)
    ? raw.funnel.map((step) => {
        const row = step as Record<string, unknown>;
        return {
          key: String(row.key ?? ""),
          label: String(row.label ?? ""),
          entity: String(row.entity ?? ""),
          value: asNumber(row.value),
        };
      })
    : [];

  const timeseriesRaw = (timeseriesResult.data ?? {}) as Record<string, unknown>;
  const timeseries = Array.isArray(timeseriesRaw.points)
    ? timeseriesRaw.points.map((point) => {
        const row = point as Record<string, unknown>;
        return {
          bucket: String(row.bucket ?? ""),
          payments: asNumber(row.payments),
          uniqueBuyers: asNumber(row.unique_buyers),
          grossMinor: asNumber(row.gross_minor),
          aovMinor: asNullableNumber(row.aov_minor),
        };
      })
    : [];

  return {
    period: input.period,
    includeTest: input.includeTest,
    periodLabel: range.label,
    from: range.from,
    to: range.to,
    currency: "RUB",
    paymentCount,
    uniqueBuyers,
    grossMinor,
    aovMinor,
    newBuyers: asNumber(raw.new_buyers),
    repeatBuyers,
    accessGranted: asNumber(raw.access_granted),
    postPurchasePlay: asNumber(raw.post_purchase_play),
    testPaymentCount: asNumber(raw.test_payment_count),
    testGrossMinor: asNumber(raw.test_gross_minor),
    kpi: buildMoneyKpi({
      paymentCount,
      uniqueBuyers,
      grossMinor,
      aovMinor,
      repeatBuyers,
      previous: previousRaw,
      sparkline: raw.sparkline,
    }),
    funnel,
    timeseries,
    notes: {
      sot: "payments.status=succeeded",
      refunds: "not_connected",
      authorPayout: "not_connected",
      dailyUniqueBuyers: "not_additive_to_period_unique",
    },
    error: timeseriesResult.error ? "timeseries_partial" : null,
  };
}

export async function getAdminMoneyBreakdownBundle(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  authorId?: string | null;
  practiceId?: string | null;
  q?: string;
  top?: number;
  productsSort?: string;
  productsSortDir?: "asc" | "desc";
  authorsSort?: string;
  authorsSortDir?: "asc" | "desc";
}): Promise<AdminMoneyBreakdownBundle> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();
  const limit = input.top && input.top > 0 ? input.top : 25;

  const [productsResult, authorsResult] = await Promise.all([
    supabase.rpc("admin_payments_p31_products", {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_author_id: input.authorId ?? null,
      p_practice_id: input.practiceId ?? null,
      p_search: input.q?.trim() || null,
      p_sort: input.productsSort ?? "gross_minor",
      p_sort_dir: input.productsSortDir ?? "desc",
      p_limit: limit,
      p_offset: 0,
    }),
    supabase.rpc("admin_payments_p31_authors", {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_author_id: input.authorId ?? null,
      p_practice_id: input.practiceId ?? null,
      p_search: input.q?.trim() || null,
      p_sort: input.authorsSort ?? "gross_minor",
      p_sort_dir: input.authorsSortDir ?? "desc",
      p_limit: limit,
      p_offset: 0,
    }),
  ]);

  const productsRaw = (productsResult.data ?? {}) as Record<string, unknown>;
  const authorsRaw = (authorsResult.data ?? {}) as Record<string, unknown>;

  const productRows = Array.isArray(productsRaw.rows)
    ? productsRaw.rows.map((row) => {
        const r = row as Record<string, unknown>;
        const slug = typeof r.practice_slug === "string" ? r.practice_slug : null;
        return {
          practiceId: String(r.practice_id ?? ""),
          title: String(r.practice_title ?? "Без названия"),
          slug,
          authorId: typeof r.author_id === "string" ? r.author_id : null,
          authorName: String(r.author_name ?? "Без автора"),
          authorSlug: typeof r.author_slug === "string" ? r.author_slug : null,
          href: slug ? `/practice/${slug}` : null,
          paymentCount: asNumber(r.payment_count),
          uniqueBuyers: asNumber(r.unique_buyers),
          grossMinor: asNumber(r.gross_minor),
          aovMinor: asNullableNumber(r.aov_minor),
          firstTimeBuyers: asNumber(r.first_time_buyers),
          repeatBuyers: asNumber(r.repeat_buyers),
          accessGranted: asNumber(r.access_granted),
          postPurchasePlay: asNumber(r.post_purchase_play),
          playConversionPct: asNullableNumber(r.play_conversion_pct),
        } satisfies AdminMoneyProductRow;
      })
    : [];

  const authorRows = Array.isArray(authorsRaw.rows)
    ? authorsRaw.rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          authorId: typeof r.author_id === "string" ? r.author_id : null,
          authorName: String(r.author_name ?? "Без автора"),
          authorSlug: typeof r.author_slug === "string" ? r.author_slug : null,
          publishedPractices: asNumber(r.published_practices),
          soldProducts: asNumber(r.sold_products),
          paymentCount: asNumber(r.payment_count),
          uniqueBuyers: asNumber(r.unique_buyers),
          grossMinor: asNumber(r.gross_minor),
          aovMinor: asNullableNumber(r.aov_minor),
          firstTimeBuyers: asNumber(r.first_time_buyers),
          repeatBuyers: asNumber(r.repeat_buyers),
        } satisfies AdminMoneyAuthorRow;
      })
    : [];

  return {
    products: {
      total: asNumber(productsRaw.total),
      rows: productRows,
      sort: String(productsRaw.sort ?? "gross_minor"),
      sortDir: productsRaw.sort_dir === "asc" ? "asc" : "desc",
      error: productsResult.error ? productsResult.error.message : null,
    },
    authors: {
      total: asNumber(authorsRaw.total),
      rows: authorRows,
      sort: String(authorsRaw.sort ?? "gross_minor"),
      sortDir: authorsRaw.sort_dir === "asc" ? "asc" : "desc",
      error: authorsResult.error ? authorsResult.error.message : null,
    },
  };
}
