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
  parseYandexWebmasterSourceRows,
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
assert.equal(parsed.sourceRowCount, 2701);
assert.equal(parsed.collapsedGroupCount, 0);
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

const period = "2026-08-29 — 2026-09-29";
const punctuationPair = parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "шум воды",
    datesRange: period,
    impressions: 100,
    clicks: 10,
    ctrPercent: 10,
    avgPosition: 4,
    avgClickPosition: 2,
    extra: { "Impressions for pos. 4-10": 80, "Clicks from pos. 4-10": 10, "CTR % for pos. 4-10": 12.5 },
  },
  {
    query: "шум воды.",
    datesRange: period,
    impressions: 100,
    clicks: 30,
    ctrPercent: 30,
    avgPosition: 6,
    avgClickPosition: 4,
    extra: { "Impressions for pos. 4-10": 70, "Clicks from pos. 4-10": 20, "CTR % for pos. 4-10": 28.6 },
  },
]));
assert.equal(punctuationPair.sourceRowCount, 2);
assert.equal(punctuationPair.collapsedGroupCount, 1);
assert.equal(punctuationPair.rows.length, 1);
const waterPair = punctuationPair.rows[0];
assert.ok(waterPair);
assert.equal(waterPair.normalizedQuery, "шум воды");
assert.equal(waterPair.queryText, "шум воды");
assert.equal(waterPair.impressions, 200);
assert.equal(waterPair.clicks, 40);
assert.equal((waterPair.clicks / waterPair.impressions) * 100, 20);
assert.equal(waterPair.ctr, 0.2);
assert.equal(waterPair.avgPosition, 5);
assert.equal(waterPair.avgClickPosition, 3.5);
assert.equal(waterPair.rawMetrics?.["Impressions for pos. 4-10"], 150);
assert.equal(waterPair.rawMetrics?.["Clicks from pos. 4-10"], 30);
assert.equal(waterPair.rawMetrics?.["CTR % for pos. 4-10"], 12.5);

const sleepPair = parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "шум воды для сна",
    datesRange: period,
    impressions: 10,
    clicks: 1,
    ctrPercent: 10,
    avgPosition: 8,
    avgClickPosition: 3,
    extra: { "Impressions for pos. 4-10": 4 },
  },
  {
    query: "шум воды для сна.",
    datesRange: period,
    impressions: 30,
    clicks: 3,
    ctrPercent: 10,
    avgPosition: 4,
    avgClickPosition: 5,
    extra: { "Impressions for pos. 4-10": 11 },
  },
]));
assert.equal(sleepPair.rows.length, 1);
const sleepMetric = sleepPair.rows[0];
assert.ok(sleepMetric);
assert.equal(sleepMetric.normalizedQuery, "шум воды для сна");
assert.equal(sleepMetric.queryText, "шум воды для сна.");
assert.equal(sleepMetric.impressions, 40);
assert.equal(sleepMetric.clicks, 4);
assert.equal((sleepMetric.clicks / sleepMetric.impressions) * 100, 10);
assert.equal(sleepMetric.ctr, 0.1);
assert.equal(sleepMetric.avgPosition, 5);
assert.equal(sleepMetric.avgClickPosition, 4.5);
assert.equal(sleepMetric.rawMetrics?.["Impressions for pos. 4-10"], 15);

const yoPair = parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "Ёлка",
    datesRange: period,
    impressions: 5,
    clicks: 1,
    ctrPercent: 20,
    avgPosition: 2,
    avgClickPosition: 1,
  },
  {
    query: "елка",
    datesRange: period,
    impressions: 15,
    clicks: 3,
    ctrPercent: 20,
    avgPosition: 4,
    avgClickPosition: 3,
  },
]));
assert.equal(yoPair.rows.length, 1);
assert.equal(yoPair.rows[0]?.normalizedQuery, "елка");
assert.equal(yoPair.rows[0]?.queryText, "елка");
assert.equal(yoPair.rows[0]?.impressions, 20);
assert.equal(yoPair.rows[0]?.clicks, 4);
assert.equal((yoPair.rows[0]!.clicks / yoPair.rows[0]!.impressions) * 100, 20);
assert.equal(yoPair.rows[0]?.avgPosition, 3.5);
assert.equal(yoPair.rows[0]?.avgClickPosition, 2.5);

const hyphenPair = parseYandexWebmasterXlsx(buildYandexWebmasterXlsx([
  {
    query: "шум-воды",
    datesRange: period,
    impressions: 8,
    clicks: 2,
    ctrPercent: 25,
    avgPosition: 10,
    avgClickPosition: 8,
    extra: { "Shows: 11-20": 3 },
  },
  {
    query: "шум воды",
    datesRange: period,
    impressions: 2,
    clicks: 0,
    ctrPercent: 0,
    avgPosition: 2,
    extra: { "Shows: 11-20": 7 },
  },
  {
    query: "шум  воды!",
    datesRange: period,
    impressions: 10,
    clicks: 2,
    ctrPercent: 20,
    avgPosition: 6,
    avgClickPosition: 5,
    extra: { "Shows: 11-20": 1 },
  },
]));
assert.equal(hyphenPair.sourceRowCount, 3);
assert.equal(hyphenPair.collapsedGroupCount, 1);
assert.equal(hyphenPair.rows.length, 1);
assert.equal(hyphenPair.rows[0]?.normalizedQuery, "шум воды");
assert.equal(hyphenPair.rows[0]?.queryText, "шум  воды!");
assert.equal(hyphenPair.rows[0]?.impressions, 20);
assert.equal(hyphenPair.rows[0]?.clicks, 4);
assert.equal((hyphenPair.rows[0]!.clicks / hyphenPair.rows[0]!.impressions) * 100, 20);
assert.equal(hyphenPair.rows[0]?.avgPosition, 7.2);
assert.equal(hyphenPair.rows[0]?.avgClickPosition, 6.5);
assert.equal(hyphenPair.rows[0]?.rawMetrics?.["Shows: 11-20"], 11);

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
assert.equal(state.snapshots[0]?.sourceRowCount, 2701);
assert.equal(state.snapshots[0]?.metricCount, 2701);
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

const invalid = {
  ...parsed,
  rows: [{ ...parsed.rows[0]!, clicks: parsed.rows[0]!.impressions + 1 }],
};
assert.throws(() => applySearchSnapshotImport(state, invalid, "bad.xlsx", catalog), /invalid_metrics/);
assert.equal(state.snapshots.length, 1);
assert.equal(state.snapshots[0]?.metrics.length, 2701);
assert.equal(state.snapshots[0]?.sourceRowCount, 2701);
assert.equal(untouched.snapshots.length, 1);

const collapsedImport = applySearchSnapshotImport(
  emptySeoAnalyticsStore(),
  punctuationPair,
  "collapsed.xlsx",
  catalog,
);
assert.equal(collapsedImport.snapshots.length, 1);
assert.equal(collapsedImport.snapshots[0]?.sourceRowCount, 2);
assert.equal(collapsedImport.snapshots[0]?.metricCount, 1);
assert.equal(collapsedImport.snapshots[0]?.metrics.length, 1);
assert.equal(collapsedImport.snapshots[0]?.totalImpressions, 200);
assert.equal(collapsedImport.snapshots[0]?.totalClicks, 40);
assert.equal(catalog.size, catalogSizeBefore);
const collapsedAgain = applySearchSnapshotImport(collapsedImport, punctuationPair, "collapsed-again.xlsx", catalog);
assert.equal(collapsedAgain.snapshots.length, 1);
assert.equal(collapsedAgain.snapshots[0]?.id, collapsedImport.snapshots[0]?.id);
assert.equal(collapsedAgain.snapshots[0]?.metricCount, 1);
assert.equal(collapsedAgain.snapshots[0]?.originalFilename, "collapsed-again.xlsx");

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

const collapseSql = read("supabase/migrations/20261220120000_seo_search_snapshot_normalized_collapse.sql");
assert.match(collapseSql, /ADD COLUMN source_row_count integer/);
assert.match(collapseSql, /ADD COLUMN metric_count integer/);
assert.match(collapseSql, /metric_count <= source_row_count/);
assert.match(collapseSql, /DROP FUNCTION IF EXISTS public\.import_seo_search_snapshot\(text, date, date, text, jsonb\)/);
assert.match(collapseSql, /GROUP BY normalized_query/);
assert.match(collapseSql, /sum\(impressions\)/);
assert.match(collapseSql, /sum\(avg_position \* impressions\) \/ sum\(impressions\)/);
assert.match(collapseSql, /avg_click_position IS NOT NULL/);
assert.match(collapseSql, /DELETE FROM public\.seo_search_query_metrics\s+WHERE snapshot_id = v_id/);
assert.match(collapseSql, /LEFT JOIN public\.seo_queries/);
assert.match(collapseSql, /p_source_row_count/);
assert.doesNotMatch(collapseSql, /duplicate_normalized_query/);
assert.doesNotMatch(collapseSql, /INSERT INTO public\.seo_queries/);
assert.doesNotMatch(collapseSql, /CREATE TABLE public\.seo_pages/);
assert.doesNotMatch(collapseSql, /seo_page_query_metrics/);
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
assert.match(importRoute, /sourceRowCount: workbook\.sourceRowCount/);
assert.match(importRoute, /metricCount: workbook\.rows\.length/);

const productionPath = join(root, "data/seo-analytics/yandex-webmaster-2026-08-29.xlsx");
const productionBytes = readFileSync(productionPath);
const productionSource = parseYandexWebmasterSourceRows(productionBytes);
const production = parseYandexWebmasterXlsx(productionBytes);
const productionTotals = aggregateSearchMetrics(production.rows);
assert.equal(productionSource.rows.length, 2701);
assert.equal(production.sourceRowCount, 2701);
assert.equal(production.rows.length, 2681);
assert.equal(production.collapsedGroupCount, 19);
assert.equal(productionTotals.impressions, 26549);
assert.equal(productionTotals.clicks, 948);
assert.equal(production.periodStart, "2026-08-29");
assert.equal(production.periodEnd, "2026-09-29");

function closeTo(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 0.0005, `${label}: ${actual} is not near ${expected}`);
}

const waterSource = productionSource.rows.filter((row) => row.queryText === "шум воды");
assert.equal(waterSource.length, 1);
assert.equal(waterSource[0]?.impressions, 2219);
assert.equal(waterSource[0]?.clicks, 55);
closeTo(waterSource[0]!.avgPosition, 6.551, "шум воды");
const waterMerged = production.rows.filter((row) => row.normalizedQuery === "шум воды");
assert.equal(waterMerged.length, 1);
assert.equal(waterMerged[0]?.queryText, "шум воды");
assert.equal(waterMerged[0]?.impressions, 2230);
assert.equal(waterMerged[0]?.clicks, 55);
closeTo(waterMerged[0]!.avgPosition, 6.5417, "шум воды merged");

for (const [query, impressions, clicks, position] of [
  ["музыка для отелей и ресторанов", 450, 0, 6.42],
  ["шум фена", 438, 1, 10.71],
] as const) {
  const sourceRows = productionSource.rows.filter((row) => row.queryText === query);
  const matches = production.rows.filter((row) => row.normalizedQuery === query);
  assert.equal(sourceRows.length, 1, query);
  assert.equal(matches.length, 1, query);
  assert.equal(matches[0]?.impressions, impressions, query);
  assert.equal(matches[0]?.clicks, clicks, query);
  closeTo(matches[0]!.avgPosition, position, query);
}

const sleepSource = productionSource.rows.filter((row) => row.normalizedQuery === "шум воды для сна");
assert.equal(sleepSource.length >= 2, true);
assert.equal(sleepSource.some((row) => row.queryText === "шум воды для сна"), true);
assert.equal(sleepSource.some((row) => row.queryText === "шум воды для сна."), true);
const sleepMerged = production.rows.filter((row) => row.normalizedQuery === "шум воды для сна");
assert.equal(sleepMerged.length, 1);
assert.equal(
  sleepMerged[0]?.impressions,
  sleepSource.reduce((sum, row) => sum + row.impressions, 0),
);
assert.equal(
  sleepMerged[0]?.clicks,
  sleepSource.reduce((sum, row) => sum + row.clicks, 0),
);
const sleepCtrPercent = sleepMerged[0]!.impressions === 0
  ? 0
  : (sleepMerged[0]!.clicks / sleepMerged[0]!.impressions) * 100;
assert.equal(sleepMerged[0]?.ctr, sleepCtrPercent / 100);

const productionGroups = new Map<string, number>();
for (const row of productionSource.rows) {
  productionGroups.set(row.normalizedQuery, (productionGroups.get(row.normalizedQuery) ?? 0) + 1);
}
assert.equal([...productionGroups.values()].filter((count) => count > 1).length, 19);
assert.equal(production.rows.some((row) => row.rawMetrics && "url" in row.rawMetrics), false);

const productionCatalog = new Map<string, string>();
let productionState = applySearchSnapshotImport(
  emptySeoAnalyticsStore(),
  production,
  "yandex-webmaster-2026-08-29.xlsx",
  productionCatalog,
);
assert.equal(productionCatalog.size, 0);
assert.equal(productionState.snapshots.length, 1);
assert.equal(productionState.snapshots[0]?.sourceRowCount, 2701);
assert.equal(productionState.snapshots[0]?.metricCount, 2681);
assert.equal(productionState.snapshots[0]?.metrics.length, 2681);
assert.equal(productionState.snapshots[0]?.totalImpressions, 26549);
assert.equal(productionState.snapshots[0]?.totalClicks, 948);
const productionId = productionState.snapshots[0]?.id;
productionState = applySearchSnapshotImport(
  productionState,
  production,
  "reimport.xlsx",
  productionCatalog,
);
assert.equal(productionState.snapshots.length, 1);
assert.equal(productionState.snapshots[0]?.id, productionId);
assert.equal(productionState.snapshots[0]?.metricCount, 2681);
assert.equal(productionState.snapshots[0]?.sourceRowCount, 2701);
assert.equal(productionCatalog.size, 0);

console.log("seo-analytics-phase1-unit: ok");
console.log(JSON.stringify({
  sourceRowCount: production.sourceRowCount,
  metricCount: production.rows.length,
  collapsedGroupCount: production.collapsedGroupCount,
  impressions: productionTotals.impressions,
  clicks: productionTotals.clicks,
  waterSource: { impressions: waterSource[0]?.impressions, clicks: waterSource[0]?.clicks, avgPosition: waterSource[0]?.avgPosition },
  waterMerged: { impressions: waterMerged[0]?.impressions, clicks: waterMerged[0]?.clicks, avgPosition: waterMerged[0]?.avgPosition },
  sleepMerged: { impressions: sleepMerged[0]?.impressions, clicks: sleepMerged[0]?.clicks, avgPosition: sleepMerged[0]?.avgPosition, queryText: sleepMerged[0]?.queryText },
}));
