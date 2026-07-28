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
  paidPurchases: number;
  viewToPlayRate: number | null;
  playToCompleteRate: number | null;
  viewToSaveRate: number | null;
  viewToPurchaseRate: number | null;
};

export type AuthorStatsTimeseriesPoint = {
  date: string;
  practiceViews: number;
  practiceUniqueVisitors: number;
  plays: number;
  progress25: number;
  completions: number;
  librarySaves: number;
  paidPurchases: number;
  authorPageViews: number;
  authorPageUniqueVisitors: number;
};

export type AuthorStatsTimeseries = {
  from: string | null;
  to: string | null;
  points: AuthorStatsTimeseriesPoint[];
};

export type AuthorStatsProductRow = {
  practiceId: string;
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
  paidPurchases: number;
  viewToPlayRate: number | null;
  playToCompleteRate: number | null;
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
  | "paid_purchases"
  | "author_page_views"
  | "author_page_unique_visitors";
