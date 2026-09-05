import {
  parseAdminRatingsAuthorSort,
  parseAdminRatingsPeriod,
  parseAdminRatingsProductSort,
  type AdminRatingsAuthorSort,
  type AdminRatingsEventKind,
  type AdminRatingsExcludedFilter,
  type AdminRatingsPeriod,
  type AdminRatingsProductSort,
  type AdminRatingsTab,
} from "@/lib/admin/analytics-ratings";
import {
  parseAdminAnalyticsPeriod,
  type AdminAnalyticsPeriod,
} from "@/lib/admin/analytics-period";
import { parseAdminIncludeTestParam } from "@/lib/admin/analytics-test-traffic";

export type AdminAnalyticsView =
  | "product"
  | "money"
  | "sources"
  | "refunds"
  | "authors-economy"
  | "ratings";

export type {
  AdminRatingsAuthorSort,
  AdminRatingsEventKind,
  AdminRatingsExcludedFilter,
  AdminRatingsPeriod,
  AdminRatingsProductSort,
  AdminRatingsTab,
};
export type AdminAuthorEconomyTab =
  | "authors"
  | "ledger"
  | "terms"
  | "payouts"
  | "dry-run";
export type AdminAuthorPayoutTab =
  | "candidates"
  | "drafts"
  | "processing"
  | "paid"
  | "review"
  | "all";
export type AdminAnalyticsTab = "practices" | "authors" | "utm";
export type AdminMoneyTab = "products" | "authors";
export type AdminAnalyticsTopN = "10" | "25" | "all";
export type AdminAnalyticsUtmGroup = "source" | "campaign" | "medium";
export type AdminAttributionMode = "first_touch" | "session_touch";
export type AdminAttributionConfidence =
  | "all"
  | "exact"
  | "strong"
  | "inferred"
  | "unknown";
export type AdminAnalyticsDrillMetric =
  | "visitors"
  | "registrations"
  | "playStarts"
  | "completions"
  | "saves"
  | null;
export type AdminMoneyDrillMetric =
  | "payments"
  | "buyers"
  | "gross"
  | "aov"
  | "repeatBuyers"
  | null;

export type AdminAnalyticsUrlState = {
  view: AdminAnalyticsView;
  period: AdminAnalyticsPeriod;
  includeTest: boolean;
  authorId: string | null;
  practiceId: string | null;
  utmSource: string | null;
  deviceType: string | null;
  tab: AdminAnalyticsTab;
  q: string;
  top: AdminAnalyticsTopN;
  utmGroup: AdminAnalyticsUtmGroup;
  practicesSort: string;
  practicesSortDir: "asc" | "desc";
  authorsSort: string;
  authorsSortDir: "asc" | "desc";
  drill: AdminAnalyticsDrillMetric;
  /** Money-layer period (independent from product analytics). */
  moneyPeriod: AdminAnalyticsPeriod;
  includeTestPayments: boolean;
  moneyTab: AdminMoneyTab;
  moneyQ: string;
  moneyTop: AdminAnalyticsTopN;
  moneyProductsSort: string;
  moneyProductsSortDir: "asc" | "desc";
  moneyAuthorsSort: string;
  moneyAuthorsSortDir: "asc" | "desc";
  moneyAuthorId: string | null;
  moneyPracticeId: string | null;
  moneyDrill: AdminMoneyDrillMetric;
  /** Refunds (P3.3.1) — reuses the money period and test toggle. */
  refundsStatus: string | null;
  refundsQ: string;
  /** Author economy (P3.3.2) — reuses the money period and test toggle. */
  authorEconomyTab: AdminAuthorEconomyTab;
  authorEconomyAuthorId: string | null;
  authorEconomyEntryType: string | null;
  authorEconomyQ: string;
  /** Payouts (P3.3.3) — lives inside the author economy view. */
  payoutTab: AdminAuthorPayoutTab;
  payoutStatus: string | null;
  /** Path-to-purchase (P3.2.1) — independent of money period when set. */
  pathPeriod: AdminAnalyticsPeriod;
  pathProduct: string | null;
  pathSurface: string | null;
  pathMode: "order_cohort";
  pathDrill: string | null;
  /** Attribution panel (P3.2.3) — payment-period cohort. */
  attributionMode: AdminAttributionMode;
  attributionPeriod: AdminAnalyticsPeriod;
  attributionConfidence: AdminAttributionConfidence;
  attributionSourceClass: string | null;
  attributionUtmSource: string | null;
  attributionUtmMedium: string | null;
  attributionCampaign: string | null;
  attributionLanding: string | null;
  attributionAuthorId: string | null;
  attributionPracticeId: string | null;
  attributionQ: string;
  attributionTop: AdminAnalyticsTopN;
  attributionSort: string;
  attributionSortDir: "asc" | "desc";
  attributionSection: string | null;
  /** Ratings analytics (Stage 3) — independent of product/money period. */
  ratingsPeriod: AdminRatingsPeriod;
  ratingsTab: AdminRatingsTab;
  ratingsQ: string;
  ratingsProductsSort: AdminRatingsProductSort;
  ratingsProductsSortDir: "asc" | "desc";
  ratingsAuthorsSort: AdminRatingsAuthorSort;
  ratingsAuthorsSortDir: "asc" | "desc";
  ratingsEventKind: AdminRatingsEventKind | "all";
  ratingsExcludedFilter: AdminRatingsExcludedFilter;
  ratingsJournalPracticeId: string | null;
  ratingsJournalAuthorId: string | null;
  ratingsJournalOffset: number;
};

function parseTab(value: string | null): AdminAnalyticsTab {
  if (value === "authors" || value === "utm" || value === "practices") {
    return value;
  }
  return "practices";
}

function parseTop(value: string | null): AdminAnalyticsTopN {
  if (value === "10" || value === "25" || value === "all") {
    return value;
  }
  return "25";
}

function parseUtmGroup(value: string | null): AdminAnalyticsUtmGroup {
  if (value === "campaign" || value === "medium" || value === "source") {
    return value;
  }
  return "source";
}

function parseDir(value: string | null): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

function parseDrill(value: string | null): AdminAnalyticsDrillMetric {
  if (
    value === "visitors" ||
    value === "registrations" ||
    value === "playStarts" ||
    value === "completions" ||
    value === "saves"
  ) {
    return value;
  }
  return null;
}

function parseView(value: string | null): AdminAnalyticsView {
  if (
    value === "money" ||
    value === "sources" ||
    value === "refunds" ||
    value === "authors-economy" ||
    value === "ratings"
  ) {
    return value;
  }
  return "product";
}

function parseRatingsTab(value: string | null): AdminRatingsTab {
  if (value === "authors" || value === "journal") {
    return value;
  }
  return "products";
}

function parseRatingsEventKind(
  value: string | null,
): AdminRatingsEventKind | "all" {
  if (value === "first" || value === "changed") {
    return value;
  }
  return "all";
}

function parseRatingsExcludedFilter(
  value: string | null,
): AdminRatingsExcludedFilter {
  if (value === "included" || value === "excluded") {
    return value;
  }
  return "all";
}

function parseNonNegativeInt(value: string | null, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAuthorEconomyTab(value: string | null): AdminAuthorEconomyTab {
  if (
    value === "ledger" ||
    value === "terms" ||
    value === "payouts" ||
    value === "dry-run"
  ) {
    return value;
  }
  return "authors";
}

function parsePayoutTab(value: string | null): AdminAuthorPayoutTab {
  if (
    value === "drafts" ||
    value === "processing" ||
    value === "paid" ||
    value === "review" ||
    value === "all"
  ) {
    return value;
  }
  return "candidates";
}

function parsePayoutStatus(value: string | null): string | null {
  if (!value) return null;
  const allowed = new Set([
    "draft",
    "approved",
    "processing",
    "paid",
    "failed",
    "cancelled",
    "requires_review",
    "reversed",
  ]);
  return allowed.has(value) ? value : null;
}

function parseAuthorEconomyEntryType(value: string | null): string | null {
  if (!value) return null;
  const allowed = new Set([
    "sale_accrual",
    "refund_reversal",
    "manual_credit",
    "manual_debit",
    "correction",
  ]);
  return allowed.has(value) ? value : null;
}

function parseRefundsStatus(value: string | null): string | null {
  if (!value) return null;
  const allowed = new Set([
    "requested",
    "submitted",
    "pending",
    "succeeded",
    "failed",
    "cancelled",
    "requires_review",
  ]);
  return allowed.has(value) ? value : null;
}

function parseMoneyTab(value: string | null): AdminMoneyTab {
  return value === "authors" ? "authors" : "products";
}

function parseMoneyDrill(value: string | null): AdminMoneyDrillMetric {
  if (
    value === "payments" ||
    value === "buyers" ||
    value === "gross" ||
    value === "aov" ||
    value === "repeatBuyers"
  ) {
    return value;
  }
  return null;
}

function parseIncludeTestPayments(value: string | null): boolean {
  return value === "1" || value === "true";
}

function parsePathMode(_value: string | null): "order_cohort" {
  return "order_cohort";
}

function parsePathSurface(value: string | null): string | null {
  if (!value) return null;
  const allowed = new Set([
    "practice_page",
    "preview",
    "catalog_card",
    "playlist",
    "author_page",
    "unknown",
  ]);
  return allowed.has(value) ? value : null;
}

function parseAttributionMode(value: string | null): AdminAttributionMode {
  return value === "first_touch" ? "first_touch" : "session_touch";
}

function parseAttributionConfidence(
  value: string | null,
): AdminAttributionConfidence {
  if (
    value === "exact" ||
    value === "strong" ||
    value === "inferred" ||
    value === "unknown" ||
    value === "all"
  ) {
    return value;
  }
  return "all";
}

export function parseAdminAnalyticsUrlState(
  params: URLSearchParams | Record<string, string | undefined>,
): AdminAnalyticsUrlState {
  const get = (key: string) => {
    if (params instanceof URLSearchParams) {
      return params.get(key);
    }
    return params[key] ?? null;
  };

  return {
    view: parseView(get("view")),
    period: parseAdminAnalyticsPeriod(get("period")),
    includeTest: parseAdminIncludeTestParam(get("includeTest")),
    authorId: get("authorId"),
    practiceId: get("practiceId"),
    utmSource: get("utmSource"),
    deviceType: get("deviceType"),
    tab: parseTab(get("tab")),
    q: (get("q") ?? "").trim(),
    top: parseTop(get("top")),
    utmGroup: parseUtmGroup(get("utmGroup")),
    practicesSort: get("practicesSort")?.trim() || "play_starts",
    practicesSortDir: parseDir(get("practicesSortDir")),
    authorsSort: get("authorsSort")?.trim() || "play_starts",
    authorsSortDir: parseDir(get("authorsSortDir")),
    drill: parseDrill(get("drill")),
    moneyPeriod: parseAdminAnalyticsPeriod(get("moneyPeriod")),
    includeTestPayments: parseIncludeTestPayments(get("includeTestPayments")),
    moneyTab: parseMoneyTab(get("moneyTab")),
    moneyQ: (get("moneyQ") ?? "").trim(),
    moneyTop: parseTop(get("moneyTop")),
    moneyProductsSort: get("moneyProductsSort")?.trim() || "gross_minor",
    moneyProductsSortDir: parseDir(get("moneyProductsSortDir")),
    moneyAuthorsSort: get("moneyAuthorsSort")?.trim() || "gross_minor",
    moneyAuthorsSortDir: parseDir(get("moneyAuthorsSortDir")),
    moneyAuthorId: get("moneyAuthorId"),
    moneyPracticeId: get("moneyPracticeId"),
    moneyDrill: parseMoneyDrill(get("moneyDrill")),
    refundsStatus: parseRefundsStatus(get("refundsStatus")),
    refundsQ: (get("refundsQ") ?? "").trim(),
    authorEconomyTab: parseAuthorEconomyTab(get("authorEconomyTab")),
    authorEconomyAuthorId: get("authorEconomyAuthorId"),
    authorEconomyEntryType: parseAuthorEconomyEntryType(
      get("authorEconomyEntryType"),
    ),
    payoutTab: parsePayoutTab(get("payoutTab")),
    payoutStatus: parsePayoutStatus(get("payoutStatus")),
    authorEconomyQ: (get("authorEconomyQ") ?? "").trim(),
    pathPeriod: parseAdminAnalyticsPeriod(
      get("pathPeriod") ?? get("moneyPeriod"),
    ),
    pathProduct: get("pathProduct"),
    pathSurface: parsePathSurface(get("pathSurface")),
    pathMode: parsePathMode(get("pathMode")),
    pathDrill: get("pathDrill"),
    attributionMode: parseAttributionMode(get("attributionMode")),
    attributionPeriod: parseAdminAnalyticsPeriod(
      get("attributionPeriod") ?? get("moneyPeriod"),
    ),
    attributionConfidence: parseAttributionConfidence(
      get("confidence") ?? get("attributionConfidence"),
    ),
    attributionSourceClass: get("sourceClass") ?? get("attributionSourceClass"),
    attributionUtmSource: get("attributionUtmSource"),
    attributionUtmMedium: get("attributionUtmMedium"),
    attributionCampaign: get("campaign") ?? get("attributionCampaign"),
    attributionLanding: get("landing") ?? get("attributionLanding"),
    attributionAuthorId: get("attributionAuthorId"),
    attributionPracticeId: get("attributionPracticeId"),
    attributionQ: (get("attributionQ") ?? "").trim(),
    attributionTop: parseTop(get("attributionTop")),
    attributionSort: get("attributionSort")?.trim() || "gross_minor",
    attributionSortDir: parseDir(get("attributionSortDir")),
    attributionSection: get("attributionSection"),
    ratingsPeriod: parseAdminRatingsPeriod(get("ratingsPeriod")),
    ratingsTab: parseRatingsTab(get("ratingsTab")),
    ratingsQ: (get("ratingsQ") ?? "").trim(),
    ratingsProductsSort: parseAdminRatingsProductSort(get("ratingsProductsSort")),
    ratingsProductsSortDir: parseDir(get("ratingsProductsSortDir")),
    ratingsAuthorsSort: parseAdminRatingsAuthorSort(get("ratingsAuthorsSort")),
    ratingsAuthorsSortDir: parseDir(get("ratingsAuthorsSortDir")),
    ratingsEventKind: parseRatingsEventKind(get("ratingsEventKind")),
    ratingsExcludedFilter: parseRatingsExcludedFilter(
      get("ratingsExcludedFilter"),
    ),
    ratingsJournalPracticeId: get("ratingsJournalPracticeId"),
    ratingsJournalAuthorId: get("ratingsJournalAuthorId"),
    ratingsJournalOffset: parseNonNegativeInt(get("ratingsJournalOffset")),
  };
}

export function buildAdminAnalyticsSearchParams(
  state: AdminAnalyticsUrlState,
  base?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base?.toString() ?? "");
  params.set("period", state.period);
  params.set("includeTest", state.includeTest ? "1" : "0");
  params.set("moneyPeriod", state.moneyPeriod);
  params.set("includeTestPayments", state.includeTestPayments ? "1" : "0");

  const optional: Array<[string, string | null | undefined]> = [
    ["view", state.view === "product" ? null : state.view],
    ["authorId", state.authorId],
    ["practiceId", state.practiceId],
    ["utmSource", state.utmSource],
    ["deviceType", state.deviceType],
    ["tab", state.tab === "practices" ? null : state.tab],
    ["q", state.q || null],
    ["top", state.top === "25" ? null : state.top],
    ["utmGroup", state.utmGroup === "source" ? null : state.utmGroup],
    ["practicesSort", state.practicesSort === "play_starts" ? null : state.practicesSort],
    ["practicesSortDir", state.practicesSortDir === "desc" ? null : state.practicesSortDir],
    ["authorsSort", state.authorsSort === "play_starts" ? null : state.authorsSort],
    ["authorsSortDir", state.authorsSortDir === "desc" ? null : state.authorsSortDir],
    ["drill", state.drill],
    ["moneyTab", state.moneyTab === "products" ? null : state.moneyTab],
    ["moneyQ", state.moneyQ || null],
    ["moneyTop", state.moneyTop === "25" ? null : state.moneyTop],
    [
      "moneyProductsSort",
      state.moneyProductsSort === "gross_minor" ? null : state.moneyProductsSort,
    ],
    [
      "moneyProductsSortDir",
      state.moneyProductsSortDir === "desc" ? null : state.moneyProductsSortDir,
    ],
    [
      "moneyAuthorsSort",
      state.moneyAuthorsSort === "gross_minor" ? null : state.moneyAuthorsSort,
    ],
    [
      "moneyAuthorsSortDir",
      state.moneyAuthorsSortDir === "desc" ? null : state.moneyAuthorsSortDir,
    ],
    ["moneyAuthorId", state.moneyAuthorId],
    ["moneyPracticeId", state.moneyPracticeId],
    ["moneyDrill", state.moneyDrill],
    ["refundsStatus", state.refundsStatus],
    ["refundsQ", state.refundsQ || null],
    [
      "authorEconomyTab",
      state.authorEconomyTab === "authors" ? null : state.authorEconomyTab,
    ],
    ["authorEconomyAuthorId", state.authorEconomyAuthorId],
    ["authorEconomyEntryType", state.authorEconomyEntryType],
    ["authorEconomyQ", state.authorEconomyQ || null],
    ["payoutTab", state.payoutTab === "candidates" ? null : state.payoutTab],
    ["payoutStatus", state.payoutStatus],
    [
      "pathPeriod",
      state.pathPeriod === state.moneyPeriod ? null : state.pathPeriod,
    ],
    ["pathProduct", state.pathProduct],
    ["pathSurface", state.pathSurface],
    ["pathMode", state.pathMode === "order_cohort" ? null : state.pathMode],
    ["pathDrill", state.pathDrill],
    [
      "attributionMode",
      state.attributionMode === "session_touch" ? null : state.attributionMode,
    ],
    [
      "attributionPeriod",
      state.attributionPeriod === state.moneyPeriod
        ? null
        : state.attributionPeriod,
    ],
    [
      "confidence",
      state.attributionConfidence === "all"
        ? null
        : state.attributionConfidence,
    ],
    ["sourceClass", state.attributionSourceClass],
    ["attributionUtmSource", state.attributionUtmSource],
    ["attributionUtmMedium", state.attributionUtmMedium],
    ["campaign", state.attributionCampaign],
    ["landing", state.attributionLanding],
    ["attributionAuthorId", state.attributionAuthorId],
    ["attributionPracticeId", state.attributionPracticeId],
    ["attributionQ", state.attributionQ || null],
    ["attributionTop", state.attributionTop === "25" ? null : state.attributionTop],
    [
      "attributionSort",
      state.attributionSort === "gross_minor" ? null : state.attributionSort,
    ],
    [
      "attributionSortDir",
      state.attributionSortDir === "desc" ? null : state.attributionSortDir,
    ],
    ["attributionSection", state.attributionSection],
    [
      "ratingsPeriod",
      state.ratingsPeriod === "all" ? null : state.ratingsPeriod,
    ],
    ["ratingsTab", state.ratingsTab === "products" ? null : state.ratingsTab],
    ["ratingsQ", state.ratingsQ || null],
    [
      "ratingsProductsSort",
      state.ratingsProductsSort === "total_stars"
        ? null
        : state.ratingsProductsSort,
    ],
    [
      "ratingsProductsSortDir",
      state.ratingsProductsSortDir === "desc"
        ? null
        : state.ratingsProductsSortDir,
    ],
    [
      "ratingsAuthorsSort",
      state.ratingsAuthorsSort === "total_stars"
        ? null
        : state.ratingsAuthorsSort,
    ],
    [
      "ratingsAuthorsSortDir",
      state.ratingsAuthorsSortDir === "desc" ? null : state.ratingsAuthorsSortDir,
    ],
    [
      "ratingsEventKind",
      state.ratingsEventKind === "all" ? null : state.ratingsEventKind,
    ],
    [
      "ratingsExcludedFilter",
      state.ratingsExcludedFilter === "all"
        ? null
        : state.ratingsExcludedFilter,
    ],
    ["ratingsJournalPracticeId", state.ratingsJournalPracticeId],
    ["ratingsJournalAuthorId", state.ratingsJournalAuthorId],
    [
      "ratingsJournalOffset",
      state.ratingsJournalOffset > 0
        ? String(state.ratingsJournalOffset)
        : null,
    ],
  ];

  for (const [key, value] of optional) {
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return params;
}

export function topNToLimit(top: AdminAnalyticsTopN): number {
  if (top === "10") return 10;
  if (top === "25") return 25;
  return 100;
}
