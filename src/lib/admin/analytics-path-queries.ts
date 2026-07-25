import { buildCsv } from "@/lib/admin/analytics-csv";
import { formatRubFromMinor } from "@/lib/admin/analytics-money-format";
import {
  resolveAdminAnalyticsPeriodRange,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminPathFunnelStage = {
  key: string;
  label: string;
  entity: string;
  value: number;
};

export type AdminPathConversion = {
  numerator: number;
  denominator: number;
  ratePct: number | null;
  formula?: string;
  note?: string;
};

export type AdminPathProductRow = {
  practiceId: string;
  title: string;
  slug: string | null;
  views: number;
  uniqueViewers: number;
  buyClicks: number;
  uniqueClickers: number;
  ordersCreated: number;
  exactClickLinkedOrders: number;
  succeededPayments: number;
  grossMinor: number;
  accessGrants: number;
  firstPostPurchasePlays: number;
  viewToClickUniquePct: number | null;
  clickToOrderExactPct: number | null;
  orderToSucceededPct: number | null;
  succeededToPlayPct: number | null;
  clickConfidence: string;
};

export type AdminPathSurfaceRow = {
  surface: string;
  buyClicks: number;
  ordersLinked: number;
  succeeded: number;
  grossMinor: number;
};

export type AdminPathBundle = {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  pathMode: "order_cohort";
  methodologyNote: string;
  emptyExactNote: string;
  from: string | null;
  to: string | null;
  engagement: {
    paidProductViews: number;
    uniquePaidProductViewers: number;
    buyClicks: number;
    uniqueBuyClickers: number;
    viewToClickUniquePct: number | null;
  };
  cohort: {
    ordersCreated: number;
    exactClickLinkedOrders: number;
    ordersWithoutClickLink: number;
    exactSessionAttributedOrders: number;
    unknownHistoricalOrders: number;
    paymentAttempts: number;
    succeededPayments: number;
    uniqueBuyers: number;
    grossMinor: number;
    accessGrants: number;
    firstPostPurchasePlays: number;
  };
  conversions: {
    clickToOrderExact: AdminPathConversion;
    orderToPaymentAttempt: AdminPathConversion;
    paymentAttemptToSucceeded: AdminPathConversion;
    succeededToAccess: AdminPathConversion;
    succeededToFirstPlay: AdminPathConversion;
  };
  stages: AdminPathFunnelStage[];
  products: AdminPathProductRow[];
  surfaces: AdminPathSurfaceRow[];
  error: string | null;
};

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function mapConversion(raw: unknown): AdminPathConversion {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    numerator: asNumber(row.numerator),
    denominator: asNumber(row.denominator),
    ratePct: asNullableNumber(row.rate_pct),
    formula: typeof row.formula === "string" ? row.formula : undefined,
    note: typeof row.note === "string" ? row.note : undefined,
  };
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

export function formatPathRate(value: number | null): string {
  return formatPct(value);
}

export async function getAdminPathBundle(input: {
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  practiceId?: string | null;
  purchaseSurface?: string | null;
}): Promise<AdminPathBundle> {
  const range = resolveAdminAnalyticsPeriodRange(input.period);
  const supabase = createServiceRoleClient();

  const [summaryResult, productsResult, surfacesResult] = await Promise.all([
    supabase.rpc("admin_analytics_p321_path_summary", {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_practice_id: input.practiceId || null,
      p_purchase_surface: input.purchaseSurface || null,
    }),
    supabase.rpc("admin_analytics_p321_path_products", {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
      p_limit: 50,
    }),
    supabase.rpc("admin_analytics_p321_path_surfaces", {
      p_from: range.from,
      p_to: range.to,
      p_include_test: input.includeTest,
    }),
  ]);

  if (summaryResult.error) {
    console.error(
      "admin_analytics_p321_path_summary_error",
      summaryResult.error.message,
    );
    return {
      period: input.period,
      includeTest: input.includeTest,
      pathMode: "order_cohort",
      methodologyNote: "",
      emptyExactNote:
        "Точные связи клика с заказом начнут собираться с момента релиза P3.2.1.",
      from: range.from,
      to: range.to,
      engagement: {
        paidProductViews: 0,
        uniquePaidProductViewers: 0,
        buyClicks: 0,
        uniqueBuyClickers: 0,
        viewToClickUniquePct: null,
      },
      cohort: {
        ordersCreated: 0,
        exactClickLinkedOrders: 0,
        ordersWithoutClickLink: 0,
        exactSessionAttributedOrders: 0,
        unknownHistoricalOrders: 0,
        paymentAttempts: 0,
        succeededPayments: 0,
        uniqueBuyers: 0,
        grossMinor: 0,
        accessGrants: 0,
        firstPostPurchasePlays: 0,
      },
      conversions: {
        clickToOrderExact: { numerator: 0, denominator: 0, ratePct: null },
        orderToPaymentAttempt: { numerator: 0, denominator: 0, ratePct: null },
        paymentAttemptToSucceeded: {
          numerator: 0,
          denominator: 0,
          ratePct: null,
        },
        succeededToAccess: { numerator: 0, denominator: 0, ratePct: null },
        succeededToFirstPlay: { numerator: 0, denominator: 0, ratePct: null },
      },
      stages: [],
      products: [],
      surfaces: [],
      error: summaryResult.error.message,
    };
  }

  const summary = (summaryResult.data ?? {}) as Record<string, unknown>;
  const engagement = (summary.engagement ?? {}) as Record<string, unknown>;
  const cohort = (summary.cohort ?? {}) as Record<string, unknown>;
  const conversions = (summary.conversions ?? {}) as Record<string, unknown>;
  const stagesRaw = Array.isArray(summary.stages) ? summary.stages : [];
  const productsRaw = Array.isArray(productsResult.data)
    ? productsResult.data
    : [];
  const surfacesRaw = Array.isArray(surfacesResult.data)
    ? surfacesResult.data
    : [];

  return {
    period: input.period,
    includeTest: input.includeTest,
    pathMode: "order_cohort",
    methodologyNote:
      typeof summary.methodology_note === "string"
        ? summary.methodology_note
        : "Order cohort: outcomes follow orders created in period.",
    emptyExactNote:
      typeof summary.empty_exact_note === "string"
        ? summary.empty_exact_note
        : "Точные связи клика с заказом начнут собираться с момента релиза P3.2.1.",
    from: range.from,
    to: range.to,
    engagement: {
      paidProductViews: asNumber(engagement.paid_product_views),
      uniquePaidProductViewers: asNumber(
        engagement.unique_paid_product_viewers,
      ),
      buyClicks: asNumber(engagement.buy_clicks),
      uniqueBuyClickers: asNumber(engagement.unique_buy_clickers),
      viewToClickUniquePct: asNullableNumber(engagement.view_to_click_unique),
    },
    cohort: {
      ordersCreated: asNumber(cohort.orders_created),
      exactClickLinkedOrders: asNumber(cohort.exact_click_linked_orders),
      ordersWithoutClickLink: asNumber(cohort.orders_without_click_link),
      exactSessionAttributedOrders: asNumber(
        cohort.exact_session_attributed_orders,
      ),
      unknownHistoricalOrders: asNumber(cohort.unknown_historical_orders),
      paymentAttempts: asNumber(cohort.payment_attempts),
      succeededPayments: asNumber(cohort.succeeded_payments),
      uniqueBuyers: asNumber(cohort.unique_buyers),
      grossMinor: asNumber(cohort.gross_minor),
      accessGrants: asNumber(cohort.access_grants),
      firstPostPurchasePlays: asNumber(cohort.first_post_purchase_plays),
    },
    conversions: {
      clickToOrderExact: mapConversion(conversions.click_to_order_exact),
      orderToPaymentAttempt: mapConversion(
        conversions.order_to_payment_attempt,
      ),
      paymentAttemptToSucceeded: mapConversion(
        conversions.payment_attempt_to_succeeded,
      ),
      succeededToAccess: mapConversion(conversions.succeeded_to_access),
      succeededToFirstPlay: mapConversion(conversions.succeeded_to_first_play),
    },
    stages: stagesRaw.map((step) => {
      const row = step as Record<string, unknown>;
      return {
        key: String(row.key ?? ""),
        label: String(row.label ?? ""),
        entity: String(row.entity ?? ""),
        value: asNumber(row.value),
      };
    }),
    products: productsRaw.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        practiceId: String(r.practice_id ?? ""),
        title: String(r.title ?? "Без названия"),
        slug: typeof r.slug === "string" ? r.slug : null,
        views: asNumber(r.views),
        uniqueViewers: asNumber(r.unique_viewers),
        buyClicks: asNumber(r.buy_clicks),
        uniqueClickers: asNumber(r.unique_clickers),
        ordersCreated: asNumber(r.orders_created),
        exactClickLinkedOrders: asNumber(r.exact_click_linked_orders),
        succeededPayments: asNumber(r.succeeded_payments),
        grossMinor: asNumber(r.gross_minor),
        accessGrants: asNumber(r.access_grants),
        firstPostPurchasePlays: asNumber(r.first_post_purchase_plays),
        viewToClickUniquePct: asNullableNumber(r.view_to_click_unique_pct),
        clickToOrderExactPct: asNullableNumber(r.click_to_order_exact_pct),
        orderToSucceededPct: asNullableNumber(r.order_to_succeeded_pct),
        succeededToPlayPct: asNullableNumber(r.succeeded_to_play_pct),
        clickConfidence: String(r.click_confidence ?? "none"),
      };
    }),
    surfaces: surfacesRaw.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        surface: String(r.surface ?? "unknown"),
        buyClicks: asNumber(r.buy_clicks),
        ordersLinked: asNumber(r.orders_linked),
        succeeded: asNumber(r.succeeded),
        grossMinor: asNumber(r.gross_minor),
      };
    }),
    error:
      productsResult.error?.message ??
      surfacesResult.error?.message ??
      null,
  };
}

export function buildPathSummaryCsv(bundle: AdminPathBundle): string {
  return buildCsv(
    ["metric", "value", "note"],
    [
      ["methodology", bundle.pathMode, bundle.methodologyNote],
      ["paid_product_views", bundle.engagement.paidProductViews, "event"],
      [
        "unique_paid_product_viewers",
        bundle.engagement.uniquePaidProductViewers,
        "person",
      ],
      ["buy_clicks", bundle.engagement.buyClicks, "event"],
      ["unique_buy_clickers", bundle.engagement.uniqueBuyClickers, "person"],
      ["orders_created", bundle.cohort.ordersCreated, "order cohort"],
      [
        "exact_click_linked_orders",
        bundle.cohort.exactClickLinkedOrders,
        "exact",
      ],
      [
        "orders_without_click_link",
        bundle.cohort.ordersWithoutClickLink,
        "partial/unknown",
      ],
      [
        "exact_session_attributed_orders",
        bundle.cohort.exactSessionAttributedOrders,
        "exact session",
      ],
      [
        "unknown_historical_orders",
        bundle.cohort.unknownHistoricalOrders,
        "unknown",
      ],
      ["payment_attempts", bundle.cohort.paymentAttempts, "payment attempt"],
      ["succeeded_payments", bundle.cohort.succeededPayments, "payment"],
      ["unique_buyers", bundle.cohort.uniqueBuyers, "buyer"],
      ["gross_minor", bundle.cohort.grossMinor, "P3.1 SoT"],
      [
        "gross_formatted",
        formatRubFromMinor(bundle.cohort.grossMinor),
        "display",
      ],
      ["access_grants", bundle.cohort.accessGrants, "entitlement"],
      [
        "first_post_purchase_plays",
        bundle.cohort.firstPostPurchasePlays,
        "unique purchased product",
      ],
      [
        "view_to_click_unique_pct",
        formatPct(bundle.engagement.viewToClickUniquePct),
        "engagement",
      ],
      [
        "click_to_order_exact_pct",
        formatPct(bundle.conversions.clickToOrderExact.ratePct),
        bundle.conversions.clickToOrderExact.formula ?? "",
      ],
    ],
  );
}

export function buildPathProductsCsv(rows: AdminPathProductRow[]): string {
  return buildCsv(
    [
      "title",
      "slug",
      "views",
      "unique_viewers",
      "buy_clicks",
      "unique_clickers",
      "orders",
      "exact_click_linked",
      "succeeded",
      "gross_minor",
      "gross_formatted",
      "access",
      "first_play",
      "view_to_click_pct",
      "click_to_order_exact_pct",
      "order_to_succeeded_pct",
      "succeeded_to_play_pct",
      "click_confidence",
    ],
    rows.map((row) => [
      row.title,
      row.slug,
      row.views,
      row.uniqueViewers,
      row.buyClicks,
      row.uniqueClickers,
      row.ordersCreated,
      row.exactClickLinkedOrders,
      row.succeededPayments,
      row.grossMinor,
      formatRubFromMinor(row.grossMinor),
      row.accessGrants,
      row.firstPostPurchasePlays,
      formatPct(row.viewToClickUniquePct),
      formatPct(row.clickToOrderExactPct),
      formatPct(row.orderToSucceededPct),
      formatPct(row.succeededToPlayPct),
      row.clickConfidence,
    ]),
  );
}

export function buildPathSurfacesCsv(rows: AdminPathSurfaceRow[]): string {
  return buildCsv(
    [
      "surface",
      "buy_clicks",
      "orders_linked",
      "succeeded",
      "gross_minor",
      "gross_formatted",
    ],
    rows.map((row) => [
      row.surface,
      row.buyClicks,
      row.ordersLinked,
      row.succeeded,
      row.grossMinor,
      formatRubFromMinor(row.grossMinor),
    ]),
  );
}
