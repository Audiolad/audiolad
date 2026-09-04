export type AuthorStatsPeriodKey = "7d" | "30d" | "90d" | "all";

export type AuthorStatsSummary = {
  authorPageViews: number;
  authorPageUniqueVisitors: number;
  practiceViews: number;
  practiceUniqueVisitors: number;
  plays: number;
  progress25: number;
  completions: number;
  librarySaves: number;
  /** Gross canonical purchases (including later refunded). */
  grossPurchases: number;
  /** Canonical sales with at least one confirmed refund. */
  refundSales: number;
  fullRefunds: number;
  partialRefunds: number;
  /** Gross purchases excluding fully refunded sales. */
  netSales: number;
  grossRevenueMinor: number;
  refundedAmountMinor: number;
  netRevenueMinor: number;
  viewToPlayRate: number | null;
  playToCompleteRate: number | null;
  viewToSaveRate: number | null;
  viewToPurchaseRate: number | null;
  /** Confirmed paid appreciation intents in the period. Not a purchase. */
  appreciationCount: number;
  /** Gross listener appreciation in kopeks. Separate from grossRevenueMinor. */
  appreciationGrossMinor: number;
  /** Author share from appreciation sale_accrual. Separate from netRevenueMinor. */
  appreciationAuthorAccruedMinor: number;
};

export type AuthorStatsTimeseriesPoint = {
  date: string;
  practiceViews: number;
  practiceUniqueVisitors: number;
  plays: number;
  progress25: number;
  completions: number;
  librarySaves: number;
  grossPurchases: number;
  refundSales: number;
  fullRefunds: number;
  partialRefunds: number;
  netSales: number;
  authorPageViews: number;
  authorPageUniqueVisitors: number;
  appreciationCount: number;
  appreciationGrossMinor: number;
  appreciationAuthorAccruedMinor: number;
};

export type AuthorStatsTimeseries = {
  from: string | null;
  to: string | null;
  points: AuthorStatsTimeseriesPoint[];
};

export type AuthorStatsProductRow = {
  productSlug: string;
  title: string;
  slug: string;
  status: string;
  isFree: boolean;
  price: number | null;
  practiceViews: number;
  practiceUniqueVisitors: number;
  plays: number;
  progress25: number;
  completions: number;
  librarySaves: number;
  grossPurchases: number;
  refundSales: number;
  fullRefunds: number;
  partialRefunds: number;
  netSales: number;
  grossRevenueMinor: number;
  refundedAmountMinor: number;
  netRevenueMinor: number;
  viewToPlayRate: number | null;
  playToCompleteRate: number | null;
  appreciationCount: number;
  appreciationGrossMinor: number;
  appreciationAuthorAccruedMinor: number;
};

export type AuthorStatsSourceBucket =
  | "direct"
  | "internal"
  | "telegram"
  | "vk"
  | "max"
  | "search"
  | "other_external"
  | "unknown";

export type AuthorStatsSourceRow = {
  bucket: AuthorStatsSourceBucket;
  views: number;
  visitors: number;
  plays: number;
};

export type AuthorStatsChartMetric =
  | "practice_views"
  | "practice_unique_visitors"
  | "plays"
  | "completions"
  | "library_saves"
  | "gross_purchases"
  | "refund_sales"
  | "net_sales"
  | "author_page_views"
  | "author_page_unique_visitors"
  | "appreciation_count"
  | "appreciation_gross"
  | "appreciation_author_accrued";
