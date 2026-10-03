import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  aggregateSearchMetrics,
  boardsForMetric,
  findPreviousSnapshot,
  metricDelta,
} from "../src/lib/seo-analytics/aggregate";
import {
  buildIssue735ControlWorkbook,
  ISSUE_735_CONTROL,
} from "../src/lib/seo-analytics/control-fixture";
import {
  applySearchSnapshotImport,
  emptySeoAnalyticsStore,
} from "../src/lib/seo-analytics/import-store";
import { normalizeSeoQueryText } from "../src/lib/seo-queries/published-query-occupancy";
import {
  buildYandexWebmasterXlsx,
  parseYandexWebmasterXlsx,
  SEO_ANALYTICS_MAX_XLSX_BYTES,
  SeoAnalyticsImportError,
} from "../src/lib/seo-analytics/yandex-webmaster-xlsx";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const fixturePath = join(root, "data/seo-analytics/yandex-webmaster-control.xlsx");

function assertImportError(run: () => void, code: string) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof SeoAnalyticsImportError);
    assert.equal(error.code, code);
    return true;
  });
}

const fixtureBytes = readFileSync(fixturePath);
const parsed = parseYandexWebmasterXlsx(fixtureBytes);
const totals = aggregateSearchMetrics(parsed.rows);

assert.equal(parsed.periodStart, ISSUE_735_CONTROL.periodStart);
assert.equal(parsed.periodEnd, ISSUE_735_CONTROL.periodEnd);
assert.equal(totals.queryCount, 2701);
assert.equal(totals.impressions, 26549);
assert.equal(totals.clicks, 948);
assert.equal(totals.impressionsPosition4to10, 21579);
assert.equal(totals.impressionsPosition11to20, 3732);
assert.equal(totals.zeroClickImpressions, 14119);

const built = parseYandexWebmasterXlsx(buildIssue735ControlWorkbook());
const builtTotals = aggregateSearchMetrics(built.rows);
assert.equal(builtTotals.queryCount, 2701);
assert.equal(builtTotals.impressions, 26549);
assert.equal(builtTotals.clicks, 948);
assert.equal(builtTotals.impressionsPosition4to10, 21579);
assert.equal(builtTotals.impressionsPosition11to20, 3732);
assert.equal(builtTotals.zeroClickImpressions, 14119);

for (const source of [parsed, built]) {
  const water = source.rows.find((row) => row.queryText === "шум воды");
  const hotel = source.rows.find((row) => row.queryText === "музыка для отелей и ресторанов");
  const dryer = source.rows.find((row) => row.queryText === "шум фена");
  assert.ok(water && hotel && dryer);
  assert.equal(water.impressions, 2219);
  assert.equal(water.clicks, 55);
  assert.equal(water.avgPosition, 6.551);
  assert.equal(hotel.impressions, 450);
  assert.equal(hotel.clicks, 0);
  assert.equal(hotel.avgPosition, 6.42);
  assert.equal(dryer.impressions, 438);
  assert.equal(dryer.clicks, 1);
  assert.equal(dryer.avgPosition, 10.71);
  assert.equal(water.rawMetrics?.["Shows: 4-10"], 2219);
  assert.equal("url" in water, false);
  assert.equal(Object.hasOwn(water, "pageType"), false);
}

assert.equal(normalizeSeoQueryText("Шум  воды!"), "шум воды");
assert.equal(normalizeSeoQueryText("Ёлка"), "елка");
assert.equal(normalizeSeoQueryText("музыка для отелей и ресторанов"), "музыка для отелей и ресторанов");

const normalizedSheet = parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "Шум  воды!",
    datesRange: "29.08.2026 - 29.09.2026",
    impressions: 10,
    clicks: 1,
    ctrPercent: 10,
    avgPosition: 4,
  },
  {
    query: "Ёлка",
    datesRange: "29.08.2026 - 29.09.2026",
    impressions: 3,
    clicks: 0,
    ctrPercent: 0,
    avgPosition: 12,
    extra: { "Shows: 11-20": 3 },
  },
], { compression: "store" }));
assert.equal(normalizedSheet.periodStart, "2026-08-29");
assert.equal(normalizedSheet.periodEnd, "2026-09-29");
assert.equal(normalizedSheet.rows[0]?.normalizedQuery, "шум воды");
assert.equal(normalizedSheet.rows[1]?.normalizedQuery, "елка");
assert.equal(normalizedSheet.rows[1]?.rawMetrics?.["Shows: 11-20"], 3);
assert.equal(normalizedSheet.rows[0]?.ctr, 0.1);

const deflated = parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "шум воды",
    datesRange: "2026-08-29 — 2026-09-29",
    impressions: 2219,
    clicks: 55,
    ctrPercent: 2.478,
    avgPosition: 6.551,
  },
], { compression: "deflate" }));
assert.equal(deflated.rows[0]?.impressions, 2219);
assert.equal(deflated.rows[0]?.clicks, 55);
assert.equal(deflated.rows[0]?.avgPosition, 6.551);

assertImportError(() => parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "шум воды",
    datesRange: "2026-08-29 — 2026-09-29",
    impressions: 2,
    clicks: 0,
    ctrPercent: 0,
    avgPosition: 4,
  },
  {
    query: "Шум воды",
    datesRange: "2026-08-29 — 2026-09-29",
    impressions: 2,
    clicks: 0,
    ctrPercent: 0,
    avgPosition: 5,
  },
])), "duplicate_normalized_query");

assertImportError(() => parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "шум воды",
    datesRange: "2026-08-29 — 2026-09-29",
    impressions: 2,
    clicks: 0,
    ctrPercent: 0,
    avgPosition: 4,
  },
  {
    query: "шум фена",
    datesRange: "2026-07-01 — 2026-07-31",
    impressions: 2,
    clicks: 0,
    ctrPercent: 0,
    avgPosition: 11,
  },
])), "period_conflict");

assertImportError(() => parseYandexWebmasterXlsx(Buffer.from("not-a-zip")), "not_xlsx");
const huge = Buffer.alloc(SEO_ANALYTICS_MAX_XLSX_BYTES + 1);
huge[0] = 0x50;
huge[1] = 0x4b;
assertImportError(() => parseYandexWebmasterXlsx(huge), "file_too_large");

assert.deepEqual(
  boardsForMetric({ avgPosition: 6.551, clicks: 55, impressions: 2219, queryId: "mapped" }, 10),
  ["fast_reserve"],
);
assert.deepEqual(
  boardsForMetric({ avgPosition: 6.42, clicks: 0, impressions: 450, queryId: null }, 10),
  ["fast_reserve", "zero_ctr", "new_queries"],
);
assert.deepEqual(
  boardsForMetric({ avgPosition: 10.71, clicks: 1, impressions: 438, queryId: "mapped" }, 10),
  ["positions_11_20"],
);
assert.deepEqual(
  boardsForMetric({ avgPosition: 3, clicks: 1, impressions: 8, queryId: "mapped" }, 10),
  ["winners"],
);
assert.deepEqual(
  boardsForMetric({ avgPosition: 10, clicks: 1, impressions: 9, queryId: "mapped" }, 10),
  [],
);
assert.deepEqual(
  boardsForMetric({ avgPosition: 20, clicks: 0, impressions: 10, queryId: null }, 10),
  ["positions_11_20", "zero_ctr", "new_queries"],
);
assert.deepEqual(
  boardsForMetric({ avgPosition: 20.01, clicks: 0, impressions: 10, queryId: "mapped" }, 10),
  ["zero_ctr"],
);

const catalog = new Map<string, string>([["шум воды", "query-water"]]);
const catalogSizeBefore = catalog.size;
let state = applySearchSnapshotImport(emptySeoAnalyticsStore(), parsed, "first.xlsx", catalog);
assert.equal(catalog.size, catalogSizeBefore);
assert.equal(state.snapshots.length, 1);
assert.equal(state.snapshots[0]?.metrics.length, 2701);
assert.equal(state.snapshots[0]?.totalImpressions, 26549);
assert.equal(state.snapshots[0]?.totalClicks, 948);
assert.equal(state.snapshots[0]?.metrics.find((row) => row.queryText === "шум воды")?.queryId, "query-water");
assert.equal(
  state.snapshots[0]?.metrics.find((row) => row.queryText === "музыка для отелей и ресторанов")?.queryId,
  null,
);
assert.equal(state.snapshots[0]?.metrics.filter((row) => row.queryId != null).length, 1);
const firstId = state.snapshots[0]?.id;
const untouched = state;

state = applySearchSnapshotImport(state, parsed, "second.xlsx", catalog);
assert.equal(state.snapshots.length, 1);
assert.equal(state.snapshots[0]?.id, firstId);
assert.equal(state.snapshots[0]?.metrics.length, 2701);
assert.equal(state.snapshots[0]?.originalFilename, "second.xlsx");
assert.equal(state.snapshots[0]?.totalImpressions, 26549);
assert.equal(catalog.size, 1);

const duplicate = {
  ...parsed,
  rows: [parsed.rows[0]!, parsed.rows[0]!],
};
assert.throws(() => applySearchSnapshotImport(state, duplicate, "bad.xlsx", catalog), /duplicate_normalized_query/);
assert.equal(state.snapshots.length, 1);
assert.equal(state.snapshots[0]?.metrics.length, 2701);
assert.equal(untouched.snapshots.length, 1);

const earlier = {
  ...parsed,
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
};
state = applySearchSnapshotImport(state, earlier, "previous.xlsx", catalog);
assert.equal(state.snapshots.length, 2);
const kept = state.snapshots.find((snapshot) => snapshot.periodStart === "2026-08-29");
const older = state.snapshots.find((snapshot) => snapshot.periodStart === "2026-07-01");
assert.equal(kept?.metrics.length, 2701);
assert.equal(kept?.totalImpressions, 26549);
assert.equal(kept?.totalClicks, 948);
assert.equal(older?.metrics.length, 2701);
assert.equal(findPreviousSnapshot(state.snapshots, kept!)?.id, older?.id);
assert.equal(findPreviousSnapshot(state.snapshots, older!), null);
assert.deepEqual(
  metricDelta(
    { impressions: 2219, clicks: 55, avgPosition: 6.551 },
    { impressions: 2000, clicks: 40, avgPosition: 7.051 },
  ),
  { impressions: 219, clicks: 15, avgPosition: -0.5 },
);

const sql = read("supabase/migrations/20261219121000_seo_search_analytics_phase1.sql");
assert.match(sql, /CREATE TABLE public\.seo_search_snapshots/);
assert.match(sql, /CREATE TABLE public\.seo_search_query_metrics/);
assert.match(sql, /seo_search_snapshots_period_source_unique UNIQUE \(period_start, period_end, source\)/);
assert.match(sql, /seo_search_query_metrics_snapshot_query_unique UNIQUE \(snapshot_id, normalized_query\)/);
assert.match(sql, /query_id uuid NULL REFERENCES public\.seo_queries/);
assert.match(sql, /raw_metrics jsonb NULL/);
assert.match(sql, /avg_click_position numeric NULL/);
assert.match(sql, /has_platform_permission\(auth\.uid\(\), 'seo\.manage'\)/);
assert.match(sql, /GRANT ALL ON public\.seo_search_snapshots, public\.seo_search_query_metrics TO service_role/);
assert.match(sql, /LEFT JOIN public\.seo_queries/);
assert.match(sql, /DELETE FROM public\.seo_search_query_metrics\s+WHERE snapshot_id = v_id/);
assert.match(sql, /public\.normalize_seo_query\(row\.query_text\)/);
assert.doesNotMatch(sql, /INSERT INTO public\.seo_queries/);
assert.doesNotMatch(sql, /CREATE TABLE public\.seo_pages/);
assert.doesNotMatch(sql, /seo_page_query_metrics/);
assert.match(read("data/seo-analytics/README.md"), /derived from the control values published in/);
assert.match(read("data/seo-analytics/README.md"), /not a live Yandex Webmaster export/);

const page = read("src/app/(platform)/admin/seo-analytics/page.tsx");
const client = read("src/components/admin/AdminSeoAnalyticsClient.tsx");
const importRoute = read("src/app/api/admin/seo-analytics/import/route.ts");
const nav = read("src/lib/admin/nav.ts");
assert.match(page, /requireAdminPermission\("seo\.manage"\)/);
assert.match(importRoute, /requireAdminPermission\("seo\.manage"\)/);
assert.match(importRoute, /import_seo_search_snapshot|importYandexWebmasterSnapshot/);
assert.match(nav, /href: "\/admin\/seo-analytics"/);
assert.match(nav, /requiredPermission: "seo\.manage"/);
for (const title of ["Победители", "Быстрый резерв", "11–20", "Нулевой CTR", "Новые запросы Яндекса"]) {
  assert.match(client, new RegExp(title.replace("–", "–")));
}
assert.match(client, /md:hidden/);
assert.match(client, /Обзор/);
assert.match(client, /Возможности/);
assert.match(client, /Импорты/);
assert.doesNotMatch(client, /Каннибализация/);
assert.doesNotMatch(client, /seo_pages/);
assert.doesNotMatch(importRoute, /\.from\("seo_queries"\)\.insert/);

console.log("seo-analytics-phase1-unit: ok");
