/**
 * Author listening-time projection. Database isolation is covered by
 * scripts/author-stats-listening-sql-unit.mjs.
 */
import assert from "node:assert/strict";

import {
  applyListeningProducts,
  applyListeningSummary,
  applyListeningTimeseries,
  averageListenMs,
  finalizeListeningTimeseries,
  isListeningDayUnmeasured,
  sumCurrentProductListenedMs,
  sumSnapshotListenedMs,
  type AuthorListeningProducts,
  type AuthorListeningSummary,
  type AuthorListeningTimeseries,
} from "../src/lib/author-stats/listening";
import type {
  AuthorStatsProductRow,
  AuthorStatsSummary,
  AuthorStatsTimeseriesPoint,
} from "../src/lib/author-stats/types";

const VALID_FROM = "2026-09-26T00:00:00+03:00";

function summary(): AuthorStatsSummary {
  return {
    authorPageViews: 0,
    authorPageUniqueVisitors: 0,
    practiceViews: 0,
    practiceUniqueVisitors: 0,
    plays: 5,
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
    viewToSaveRate: null,
    viewToPurchaseRate: null,
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
    listenedMs: null,
    measuredListeners: null,
    measuredPlayStarts: null,
    averageListenPerListenerMs: null,
    averageListenPerStartMs: null,
    listeningTimeValidFrom: null,
    listeningTimePartial: false,
    listeningTimeUnmeasured: true,
  };
}

function point(date: string): AuthorStatsTimeseriesPoint {
  return {
    date,
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
    authorPageViews: 0,
    authorPageUniqueVisitors: 0,
    appreciationCount: 0,
    appreciationGrossMinor: 0,
    appreciationAuthorAccruedMinor: 0,
    listenedMs: null,
  };
}

function product(slug: string): AuthorStatsProductRow {
  return {
    productSlug: slug,
    title: slug,
    slug,
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
    listenedMs: null,
  };
}

function listeningSummary(
  overrides: Partial<AuthorListeningSummary> = {},
): AuthorListeningSummary {
  return {
    listenedMs: 7000,
    measuredListeners: 4,
    measuredPlayStarts: 4,
    listeningTimeValidFrom: VALID_FROM,
    listeningTimePartial: true,
    listeningTimeUnmeasured: false,
    ...overrides,
  };
}

function testAveragesUseMeasuredDenominators() {
  const historicalStarts = 5;
  const measuredStarts = 4;
  const listenedMs = 7000;
  assert.equal(averageListenMs(listenedMs, measuredStarts), 1750);
  assert.notEqual(averageListenMs(listenedMs, historicalStarts), 1750);
  assert.equal(averageListenMs(null, measuredStarts), null);
  assert.equal(averageListenMs(0, measuredStarts), null);
  assert.equal(averageListenMs(listenedMs, 0), null);

  const applied = applyListeningSummary(
    summary(),
    listeningSummary({ measuredListeners: 4, measuredPlayStarts: 4 }),
  );
  assert.equal(applied.plays, 5, "ordinary play KPI stays on the summary");
  assert.equal(applied.averageListenPerStartMs, 1750);
  assert.equal(applied.averageListenPerListenerMs, 1750);
  assert.equal(applied.listenedMs, 7000);

  const unmeasured = applyListeningSummary(
    summary(),
    listeningSummary({
      listenedMs: null,
      measuredListeners: null,
      measuredPlayStarts: null,
      listeningTimeUnmeasured: true,
      listeningTimePartial: false,
    }),
  );
  assert.equal(unmeasured.listenedMs, null);
  assert.equal(unmeasured.averageListenPerListenerMs, null);
  assert.equal(unmeasured.averageListenPerStartMs, null);
  assert.notEqual(unmeasured.listenedMs, 0);
}

function testTimeseriesBeforeValidFromIsUnmeasured() {
  assert.equal(isListeningDayUnmeasured("2026-09-25", VALID_FROM), true);
  assert.equal(isListeningDayUnmeasured("2026-09-26", VALID_FROM), false);

  const series: AuthorListeningTimeseries = {
    validFrom: VALID_FROM,
    unmeasured: false,
    points: [{ date: "2026-09-26", listenedMs: 7000 }],
  };
  const merged = applyListeningTimeseries(
    [point("2026-09-25"), point("2026-09-26"), point("2026-09-27")],
    series,
  );
  assert.equal(merged[0]?.listenedMs, null);
  assert.equal(merged[1]?.listenedMs, 7000);
  assert.equal(merged[2]?.listenedMs, 0);

  const allChart = finalizeListeningTimeseries(
    [point("2026-09-20"), { ...point("2026-09-26"), listenedMs: 7000 }],
    VALID_FROM,
  );
  assert.equal(allChart[0]?.listenedMs, null);
  assert.equal(allChart[1]?.listenedMs, 7000);
}

function testProductBreakdownAndDeletedPractice() {
  const rows = [
    { practiceId: "p1", productSlug: "current", listenedMs: 1000 },
    { practiceId: "p1", productSlug: "current", listenedMs: 2000 },
    { practiceId: "deleted", productSlug: "deleted", listenedMs: 4000 },
    { practiceId: "moved", productSlug: null, listenedMs: 7000 },
  ];
  assert.equal(sumCurrentProductListenedMs(rows), 7000);
  assert.equal(sumSnapshotListenedMs(rows), 14000);
  assert.equal(1000 + 2000, 3000, "anonymous and authenticated both stay in the current product");

  const listening: AuthorListeningProducts = {
    validFrom: VALID_FROM,
    unmeasured: false,
    rows,
  };
  const products = applyListeningProducts(
    [product("current"), product("deleted")],
    listening,
  );
  assert.equal(products[0]?.listenedMs, 3000);
  assert.equal(products[1]?.listenedMs, 4000);
  assert.equal(
    (products[0]?.listenedMs ?? 0) + (products[1]?.listenedMs ?? 0),
    sumCurrentProductListenedMs(rows),
  );

  const afterDelete = applyListeningProducts([product("current")], {
    ...listening,
    rows: rows.map((row) =>
      row.practiceId === "deleted" ? { ...row, productSlug: null } : row,
    ),
  });
  assert.equal(afterDelete[0]?.listenedMs, 3000);
  assert.equal(sumSnapshotListenedMs(rows), 14000);

  const hidden = applyListeningProducts([product("current")], {
    validFrom: VALID_FROM,
    unmeasured: true,
    rows: [],
  });
  assert.equal(hidden[0]?.listenedMs, null);
}

function testAuthorPayloadIsolation() {
  const authorA = applyListeningSummary(summary(), listeningSummary({ listenedMs: 14000 }));
  const authorB = applyListeningSummary(
    summary(),
    listeningSummary({
      listenedMs: 9000,
      measuredListeners: 1,
      measuredPlayStarts: 1,
    }),
  );
  assert.equal(authorA.listenedMs, 14000);
  assert.equal(authorB.listenedMs, 9000);
  assert.notEqual(authorB.listenedMs, authorA.listenedMs);
}

testAveragesUseMeasuredDenominators();
testTimeseriesBeforeValidFromIsUnmeasured();
testProductBreakdownAndDeletedPractice();
testAuthorPayloadIsolation();
console.log("author-stats-listening-unit: ok");
