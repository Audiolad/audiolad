/**
 * Statistics table sort: whitelist, direction, nulls, ties, search, Top N, period.
 * SQL execution of the admin RPCs stays in the isolated analytics database tests.
 * This file checks the shared contract and that PostgreSQL sorts before LIMIT.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sortAuthorStatsProducts } from "../src/lib/author-stats/product-sort";
import type { AuthorStatsProductRow } from "../src/lib/author-stats/types";
import {
  buildAdminAnalyticsSearchParams,
  parseAdminAnalyticsUrlState,
  topNToLimit,
} from "../src/lib/admin/analytics-url-state";
import {
  ADMIN_PRACTICE_SORT_KEYS,
  canonicalizeAdminAuthorSort,
  canonicalizeAdminPracticeSort,
  canonicalizeAdminUtmSort,
  compareSortValues,
  defaultSortOrder,
  nextColumnSort,
  sortRows,
  STATS_TABLE_ROW_CAP,
  takeSortedSlice,
} from "../src/lib/stats/table-sort";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type Practice = {
  id: string;
  title: string;
  author: string;
  views: number;
  starts: number;
  completions: number;
  listenedMs: number | null;
  listeningLabel: string;
};

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function practice(partial: Partial<Practice> & Pick<Practice, "id">): Practice {
  return {
    title: partial.title ?? partial.id,
    author: partial.author ?? "Автор",
    views: partial.views ?? 0,
    starts: partial.starts ?? 0,
    completions: partial.completions ?? 0,
    listenedMs: partial.listenedMs === undefined ? 0 : partial.listenedMs,
    listeningLabel: partial.listeningLabel ?? "",
    ...partial,
  };
}

function sortPractices(
  rows: readonly Practice[],
  key: "title" | "author" | "views" | "starts" | "completions" | "listening_time",
  order: "asc" | "desc",
) {
  const kind =
    key === "title" || key === "author"
      ? "text"
      : key === "listening_time"
        ? "duration"
        : "number";
  return sortRows(
    rows,
    {
      kind,
      value: (row) => {
        if (key === "title") return row.title;
        if (key === "author") return row.author;
        if (key === "views") return row.views;
        if (key === "starts") return row.starts;
        if (key === "completions") return row.completions;
        return row.listenedMs;
      },
      tieBreak: (row) => `${row.title}\u0000${row.id}`,
    },
    order,
  );
}

function filterThenSortThenLimit(
  rows: readonly Practice[],
  query: string,
  key: "views" | "listening_time",
  order: "asc" | "desc",
  limit: number | null,
) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) =>
        [row.title, row.author, row.id].join(" ").toLowerCase().includes(q),
      )
    : [...rows];
  return takeSortedSlice(sortPractices(filtered, key, order), limit);
}

function product(partial: Partial<AuthorStatsProductRow> & Pick<AuthorStatsProductRow, "productSlug" | "title">): AuthorStatsProductRow {
  return {
    slug: partial.productSlug,
    status: "published",
    isFree: true,
    price: null,
    practiceViews: 0,
    practiceUniqueVisitors: 0,
    plays: 0,
    progress25: 0,
    completions: 0,
    librarySaves: 0,
    grossPurchases: 0,
    refundSales: 0,
    fullRefunds: 0,
    partialRefunds: 0,
    netSales: 0,
    grossRevenueMinor: 0,
    refundedAmountMinor: 0,
    netRevenueMinor: 0,
    viewToPlayRate: null,
    playToCompleteRate: null,
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
    listenedMs: 0,
    ...partial,
  };
}

function testDirectionsAndWhitelist() {
  assert.equal(defaultSortOrder("text"), "asc");
  assert.equal(defaultSortOrder("number"), "desc");
  assert.equal(defaultSortOrder("duration"), "desc");
  assert.equal(defaultSortOrder("date"), "desc");

  const firstText = nextColumnSort(
    { sort: "play_starts" as const, order: "desc" as const },
    "title",
    "text",
  );
  assert.deepEqual(firstText, { sort: "title", order: "asc" });
  const flipped = nextColumnSort(firstText, "title", "text");
  assert.equal(flipped.order, "desc");

  const firstNumber = nextColumnSort(
    { sort: "play_starts" as const, order: "desc" as const },
    "views",
    "number",
  );
  assert.equal(firstNumber.order, "desc");

  assert.equal(canonicalizeAdminPracticeSort("listening_time"), "listened_ms");
  assert.equal(canonicalizeAdminPracticeSort("starts"), "play_starts");
  assert.equal(canonicalizeAdminPracticeSort("completion"), "completions");
  assert.equal(canonicalizeAdminPracticeSort("title"), "title");
  assert.equal(canonicalizeAdminPracticeSort("author"), "author");
  assert.equal(
    canonicalizeAdminPracticeSort("play_starts; DROP TABLE practices"),
    "play_starts",
  );
  assert.equal(canonicalizeAdminPracticeSort("listened_ms DESC"), "play_starts");
  assert.equal(canonicalizeAdminAuthorSort("name"), "name");
  assert.equal(canonicalizeAdminAuthorSort("author;select"), "play_starts");
  assert.equal(canonicalizeAdminUtmSort("play_starts"), "play_starts");
  assert.equal(canonicalizeAdminUtmSort("not-a-column"), "sessions");
  assert.ok(ADMIN_PRACTICE_SORT_KEYS.includes("listened_ms"));
}

function testColumnOrders() {
  const rows = [
    practice({ id: "b", title: "Бета", author: "Яна", views: 2, starts: 5, completions: 1, listenedMs: 9 * MINUTE_MS, listeningLabel: "9 мин" }),
    practice({ id: "a", title: "Альфа", author: "Борис", views: 9, starts: 1, completions: 4, listenedMs: 5 * HOUR_MS + 56 * MINUTE_MS, listeningLabel: "5 ч 56 мин" }),
    practice({ id: "c", title: "Гамма", author: "Анна", views: 2, starts: 5, completions: 0, listenedMs: null, listeningLabel: "—" }),
  ];

  assert.deepEqual(sortPractices(rows, "title", "asc").map((row) => row.id), ["a", "b", "c"]);
  assert.deepEqual(sortPractices(rows, "title", "desc").map((row) => row.id), ["c", "b", "a"]);
  assert.deepEqual(sortPractices(rows, "author", "asc").map((row) => row.author), ["Анна", "Борис", "Яна"]);
  assert.deepEqual(sortPractices(rows, "author", "desc").map((row) => row.author), ["Яна", "Борис", "Анна"]);
  assert.deepEqual(sortPractices(rows, "views", "desc").map((row) => row.id), ["a", "b", "c"]);
  assert.deepEqual(sortPractices(rows, "views", "asc").map((row) => row.id), ["b", "c", "a"]);
  assert.deepEqual(sortPractices(rows, "starts", "desc").map((row) => row.id), ["b", "c", "a"]);
  assert.deepEqual(sortPractices(rows, "starts", "asc").map((row) => row.id), ["a", "b", "c"]);
  assert.deepEqual(sortPractices(rows, "completions", "desc").map((row) => row.id), ["a", "b", "c"]);
  assert.deepEqual(sortPractices(rows, "completions", "asc").map((row) => row.id), ["c", "b", "a"]);

  const byTimeDesc = sortPractices(rows, "listening_time", "desc").map((row) => row.id);
  const byTimeAsc = sortPractices(rows, "listening_time", "asc").map((row) => row.id);
  assert.deepEqual(byTimeDesc, ["a", "b", "c"]);
  assert.deepEqual(byTimeAsc, ["b", "a", "c"]);
  assert.notDeepEqual(
    [...rows].sort((left, right) => right.listeningLabel.localeCompare(left.listeningLabel, "ru")).map((row) => row.id),
    byTimeDesc,
  );
}

function testNullsAndTies() {
  assert.equal(compareSortValues(null, 1, "asc", "duration"), 1);
  assert.equal(compareSortValues(null, 1, "desc", "duration"), 1);
  assert.equal(compareSortValues(1, null, "asc", "number"), -1);
  assert.equal(compareSortValues(Number.NaN, 2, "desc", "number"), 1);

  const tied = [
    practice({ id: "2", title: "Одинаково", views: 4 }),
    practice({ id: "1", title: "Одинаково", views: 4 }),
    practice({ id: "3", title: "Альфа", views: 4 }),
  ];
  assert.deepEqual(sortPractices(tied, "views", "desc").map((row) => row.id), ["3", "1", "2"]);
  assert.deepEqual(sortPractices(tied, "views", "asc").map((row) => row.id), ["3", "1", "2"]);
}

function testSearchTopAndPeriod() {
  const rows = Array.from({ length: 30 }, (_, index) =>
    practice({
      id: String(index).padStart(2, "0"),
      title: index % 2 === 0 ? `Поиск ${index}` : `Другое ${index}`,
      views: index,
      listenedMs: index * MINUTE_MS,
    }),
  );

  const top10 = filterThenSortThenLimit(rows, "", "views", "desc", 10);
  assert.equal(top10.length, 10);
  assert.equal(top10[0].views, 29);
  assert.equal(top10[9].views, 20);

  const preSliced = takeSortedSlice(rows, 10);
  const wrong = sortPractices(preSliced, "views", "desc");
  assert.notEqual(wrong[0].views, top10[0].views);

  const top25 = filterThenSortThenLimit(rows, "", "listening_time", "desc", 25);
  assert.equal(top25.length, 25);
  assert.equal(top25[0].listenedMs, 29 * MINUTE_MS);
  assert.equal(top25.at(-1)?.listenedMs, 5 * MINUTE_MS);

  const all = filterThenSortThenLimit(rows, "", "views", "asc", null);
  assert.equal(all.length, 30);
  assert.equal(all[0].views, 0);

  const searched = filterThenSortThenLimit(rows, "поиск", "views", "desc", 10);
  assert.ok(searched.every((row) => row.title.toLowerCase().includes("поиск")));
  assert.equal(searched[0].views, 28);
  assert.ok(searched[0].views > 10);

  const periodState = parseAdminAnalyticsUrlState(
    new URLSearchParams(
      "period=30d&q=поиск&top=10&authorId=11111111-1111-1111-1111-111111111111&sort=listening_time&order=desc&tab=practices",
    ),
  );
  assert.equal(periodState.period, "30d");
  assert.equal(periodState.q, "поиск");
  assert.equal(periodState.top, "10");
  assert.equal(periodState.practicesSort, "listened_ms");
  assert.equal(periodState.practicesSortDir, "desc");
  assert.equal(topNToLimit(periodState.top), 10);
  assert.equal(topNToLimit("25"), 25);
  assert.equal(topNToLimit("all"), STATS_TABLE_ROW_CAP);

  const next = nextColumnSort(
    { sort: periodState.practicesSort, order: periodState.practicesSortDir },
    "title",
    "text",
  );
  const preserved = buildAdminAnalyticsSearchParams({
    ...periodState,
    practicesSort: next.sort,
    practicesSortDir: next.order,
  });
  assert.equal(preserved.get("period"), "30d");
  assert.equal(preserved.get("q"), "поиск");
  assert.equal(preserved.get("top"), "10");
  assert.equal(preserved.get("authorId"), "11111111-1111-1111-1111-111111111111");
  assert.equal(preserved.get("sort"), "title");
  assert.equal(preserved.get("order"), "asc");
  assert.equal(preserved.get("practicesSort"), "title");
}

function testAuthorCabinet() {
  const rows = [
    product({
      productSlug: "b",
      title: "Бета",
      status: "draft",
      practiceViews: 1,
      plays: 3,
      completions: 0,
      listenedMs: null,
    }),
    product({
      productSlug: "a",
      title: "Альфа",
      status: "published",
      practiceViews: 8,
      plays: 1,
      completions: 2,
      listenedMs: 5 * HOUR_MS + 56 * MINUTE_MS,
    }),
    product({
      productSlug: "c",
      title: "Гамма",
      status: "archived",
      practiceViews: 8,
      plays: 9,
      completions: 1,
      listenedMs: 9 * MINUTE_MS,
    }),
  ];

  assert.deepEqual(
    sortAuthorStatsProducts(rows, "title", "asc").map((row) => row.productSlug),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "title", "desc").map((row) => row.productSlug),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "status", "asc").map((row) => row.status),
    ["archived", "published", "draft"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "views", "desc").map((row) => row.productSlug),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "starts", "desc").map((row) => row.productSlug),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "starts", "asc").map((row) => row.productSlug),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "completion", "desc").map((row) => row.productSlug),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "listening_time", "desc").map((row) => row.productSlug),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    sortAuthorStatsProducts(rows, "listening_time", "asc").map((row) => row.productSlug),
    ["c", "a", "b"],
  );
  assert.equal(
    sortAuthorStatsProducts(rows, null, null)[0]?.productSlug,
    "a",
  );
}

function testSqlSortsBeforeLimit() {
  const sql = readFileSync(
    join(ROOT, "supabase/migrations/20261206120100_stats_table_column_sort.sql"),
    "utf8",
  );
  assert.equal(sql.includes("EXECUTE"), true);
  assert.doesNotMatch(sql, /EXECUTE\s+format/i);
  assert.doesNotMatch(sql, /EXECUTE\s+v_sort/i);
  assert.match(sql, /IF v_sort NOT IN/);
  assert.match(sql, /WHEN 'listened_ms'/);
  assert.match(sql, /WHEN 'title'/);
  assert.match(sql, /WHEN 'author'/);
  assert.match(sql, /WHEN 'name'/);
  assert.match(sql, /p_query/);
  assert.match(sql, /strpos\(/);
  assert.match(sql, /NULLS LAST/);
  const practices = sql.slice(
    sql.indexOf("CREATE FUNCTION public.admin_analytics_p2_practices"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_analytics_p2_authors"),
  );
  const filterAt = practices.indexOf("filtered AS");
  const orderAt = practices.indexOf("ORDER BY");
  const limitAt = practices.indexOf("LIMIT v_limit");
  assert.ok(filterAt > 0 && filterAt < orderAt && orderAt < limitAt);
  assert.match(practices, /v_unmeasured THEN NULL/);
  assert.doesNotMatch(practices, /listeningTimeLabel/);

  const authorClient = readFileSync(
    join(ROOT, "src/components/author-dashboard/AuthorStatsClient.tsx"),
    "utf8",
  );
  assert.match(authorClient, /md:hidden/);
  assert.match(authorClient, /aria-label="Сортировка продуктов"/);
  assert.match(authorClient, /sort=/);
  const panel = readFileSync(
    join(ROOT, "src/components/admin/AdminAnalyticsBreakdownPanel.tsx"),
    "utf8",
  );
  assert.match(panel, /SortableColumnHeader/);
  assert.match(panel, /overflow-x-auto/);
  assert.doesNotMatch(panel, /function filterPractices/);
  assert.doesNotMatch(panel, /function groupUtm/);
}

function main() {
  testDirectionsAndWhitelist();
  testColumnOrders();
  testNullsAndTies();
  testSearchTopAndPeriod();
  testAuthorCabinet();
  testSqlSortsBeforeLimit();
  console.log("stats-table-sort-unit: ok");
}

main();
