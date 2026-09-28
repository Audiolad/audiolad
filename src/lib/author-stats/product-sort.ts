import { formatAuthorStatsProductStatus } from "@/lib/author-stats/labels";
import type { AuthorStatsProductRow } from "@/lib/author-stats/types";
import {
  defaultSortOrder,
  parseSortOrder,
  sortRows,
  type SortOrder,
  type SortValue,
  type SortValueKind,
} from "@/lib/stats/table-sort";

export const AUTHOR_STATS_PRODUCT_SORT_KEYS = [
  "title",
  "status",
  "views",
  "visitors",
  "starts",
  "listening_time",
  "progress_25",
  "completions",
  "saves",
  "purchases",
  "refunds",
  "net_sales",
  "appreciation_count",
  "appreciation_gross",
  "appreciation_accrued",
  "view_to_play",
] as const;

export type AuthorStatsProductSortKey =
  (typeof AUTHOR_STATS_PRODUCT_SORT_KEYS)[number];

export const AUTHOR_STATS_PRODUCT_SORT_LABELS: Record<
  AuthorStatsProductSortKey,
  string
> = {
  title: "Продукт",
  status: "Статус",
  views: "Просмотры",
  visitors: "Посетители",
  starts: "Запуски",
  listening_time: "Время прослушивания",
  progress_25: "25%",
  completions: "Завершения",
  saves: "Сохранения",
  purchases: "Покупки",
  refunds: "Возвраты",
  net_sales: "Чистые продажи",
  appreciation_count: "Благодарности",
  appreciation_gross: "Сумма благодарностей",
  appreciation_accrued: "Начислено вам",
  view_to_play: "Просмотр → запуск",
};

const ALIASES: Record<string, AuthorStatsProductSortKey> = {
  title: "title",
  product: "title",
  status: "status",
  views: "views",
  views_count: "views",
  visitors: "visitors",
  practice_unique_visitors: "visitors",
  starts: "starts",
  plays: "starts",
  play_starts: "starts",
  listening_time: "listening_time",
  listened_ms: "listening_time",
  listening_seconds: "listening_time",
  progress_25: "progress_25",
  progress25: "progress_25",
  completion: "completions",
  completions: "completions",
  saves: "saves",
  library_saves: "saves",
  purchases: "purchases",
  gross_purchases: "purchases",
  refunds: "refunds",
  refund_sales: "refunds",
  net_sales: "net_sales",
  appreciation_count: "appreciation_count",
  appreciation_gross: "appreciation_gross",
  appreciation_accrued: "appreciation_accrued",
  view_to_play: "view_to_play",
};

export function authorProductSortKind(
  sort: AuthorStatsProductSortKey,
): SortValueKind {
  if (sort === "title" || sort === "status") return "text";
  if (sort === "listening_time") return "duration";
  return "number";
}

export function canonicalizeAuthorProductSort(
  value: string | null | undefined,
): AuthorStatsProductSortKey {
  const key = value?.trim().toLowerCase() ?? "";
  return ALIASES[key] ?? "views";
}

export function parseAuthorProductSortState(
  sortParam: string | null | undefined,
  orderParam: string | null | undefined,
): { sort: AuthorStatsProductSortKey; order: SortOrder } {
  const sort = canonicalizeAuthorProductSort(sortParam);
  const fallback = sortParam?.trim()
    ? "desc"
    : defaultSortOrder(authorProductSortKind(sort));
  return { sort, order: parseSortOrder(orderParam, fallback) };
}

function productValue(
  row: AuthorStatsProductRow,
  sort: AuthorStatsProductSortKey,
): SortValue {
  switch (sort) {
    case "title":
      return row.title;
    case "status":
      return formatAuthorStatsProductStatus(row.status);
    case "views":
      return row.practiceViews;
    case "visitors":
      return row.practiceUniqueVisitors;
    case "starts":
      return row.plays;
    case "listening_time":
      return row.listenedMs;
    case "progress_25":
      return row.progress25;
    case "completions":
      return row.completions;
    case "saves":
      return row.librarySaves;
    case "purchases":
      return row.grossPurchases;
    case "refunds":
      return row.refundSales;
    case "net_sales":
      return row.netSales;
    case "appreciation_count":
      return row.appreciationCount;
    case "appreciation_gross":
      return row.appreciationGrossMinor;
    case "appreciation_accrued":
      return row.appreciationAuthorAccruedMinor;
    case "view_to_play":
      return row.viewToPlayRate;
  }
}

export function sortAuthorStatsProducts(
  rows: readonly AuthorStatsProductRow[],
  sortParam: string | null | undefined,
  orderParam: string | null | undefined,
): AuthorStatsProductRow[] {
  const { sort, order } = parseAuthorProductSortState(sortParam, orderParam);
  return sortRows(
    rows,
    {
      kind: authorProductSortKind(sort),
      value: (row) => productValue(row, sort),
      tieBreak: (row) => `${row.title}\u0000${row.productSlug}`,
    },
    order,
  );
}
