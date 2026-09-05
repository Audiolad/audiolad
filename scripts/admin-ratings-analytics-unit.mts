#!/usr/bin/env node
/**
 * Stage 3 admin Ratings analytics: summary fixtures, temporal A/B,
 * eligible conversion, product/author aggregates, journal pagination,
 * diagnostics wording, source contracts. Isolated SQL is the companion.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateAdminRatingsByAuthor,
  aggregateAdminRatingsByProduct,
  adminAverageStars,
  adminEligibleConversion,
  classifyAdminRatingEventKind,
  compareAdminRatingEventsDesc,
  isCreatedAtInAdminRatingsWindow,
  observeAdminRatingDiagnostics,
  paginateStable,
  parseAdminRatingsPeriod,
  summarizeAdminRatings,
  type AdminEligibleFact,
  type AdminRatingEventFact,
  type AdminRatingFact,
} from "../src/lib/admin/analytics-ratings.ts";
import {
  buildAdminAnalyticsSearchParams,
  parseAdminAnalyticsUrlState,
} from "../src/lib/admin/analytics-url-state.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const now = "2026-09-05T12:00:00.000Z";
const yesterday = "2026-09-04T12:00:00.000Z";
const yearAgo = "2025-09-05T12:00:00.000Z";
const window7d = { from: "2026-08-30T21:00:00.000Z", to: now };
const window30d = { from: "2026-08-07T21:00:00.000Z", to: now };
const allTime = { from: null, to: null };

function testSummaryFixture() {
  const ratings: AdminRatingFact[] = [
    {
      userId: "u1",
      practiceId: "p1",
      authorId: "a1",
      stars: 5,
      createdAt: yesterday,
    },
    {
      userId: "u2",
      practiceId: "p1",
      authorId: "a1",
      stars: 4,
      createdAt: yesterday,
    },
    {
      userId: "u3",
      practiceId: "p1",
      authorId: "a1",
      stars: 3,
      createdAt: yesterday,
    },
    {
      userId: "u4",
      practiceId: "p1",
      authorId: "a1",
      stars: 1,
      createdAt: yesterday,
      excludedAt: now,
    },
  ];

  const summary = summarizeAdminRatings({
    ratings,
    eligible: [],
    window: allTime,
  });

  assert.equal(summary.ratingCount, 3);
  assert.equal(summary.totalStars, 12);
  assert.equal(summary.average, 4);
  assert.equal(summary.uniqueRaters, 3);
  assert.equal(summary.excludedCount, 1);
  assert.equal(summary.activeCount, 3);
  assert.equal(adminAverageStars(0, 0), null);
}

function testTemporalAB() {
  const exampleA: AdminRatingFact = {
    userId: "u-a",
    practiceId: "p1",
    authorId: "a1",
    stars: 5,
    createdAt: yesterday,
  };
  const exampleB: AdminRatingFact = {
    userId: "u-b",
    practiceId: "p1",
    authorId: "a1",
    stars: 5,
    createdAt: yearAgo,
  };

  assert.equal(isCreatedAtInAdminRatingsWindow(exampleA.createdAt, window7d), true);
  assert.equal(isCreatedAtInAdminRatingsWindow(exampleA.createdAt, window30d), true);
  assert.equal(isCreatedAtInAdminRatingsWindow(exampleB.createdAt, window7d), false);
  assert.equal(isCreatedAtInAdminRatingsWindow(exampleB.createdAt, window30d), false);
  assert.equal(isCreatedAtInAdminRatingsWindow(exampleB.createdAt, allTime), true);

  const summary7d = summarizeAdminRatings({
    ratings: [exampleA, exampleB],
    eligible: [],
    window: window7d,
  });
  assert.equal(summary7d.ratingCount, 1);
  assert.equal(summary7d.totalStars, 5);

  const summaryAll = summarizeAdminRatings({
    ratings: [exampleA, exampleB],
    eligible: [],
    window: allTime,
  });
  assert.equal(summaryAll.ratingCount, 2);
  assert.equal(summaryAll.totalStars, 10);
}

function testEligibleConversionGrain() {
  const ratings: AdminRatingFact[] = [
    {
      userId: "u1",
      practiceId: "p1",
      authorId: "a1",
      stars: 5,
      createdAt: yesterday,
    },
  ];
  const eligible: AdminEligibleFact[] = [
    { userId: "u1", practiceId: "p1", ratingEligibleAt: yesterday },
    { userId: "u2", practiceId: "p1", ratingEligibleAt: yesterday },
    { userId: "u2", practiceId: "p2", ratingEligibleAt: yesterday },
  ];

  const summary = summarizeAdminRatings({
    ratings,
    eligible,
    window: allTime,
  });
  assert.equal(summary.eligibleListeners, 3);
  assert.equal(summary.ratedEligible, 1);
  assert.equal(summary.eligibleUnrated, 2);
  assert.equal(summary.conversion, 1 / 3);
  assert.equal(adminEligibleConversion(0, 0), null);
}

function testProductAggregateEditChangesSumNotCount() {
  const before: AdminRatingFact[] = [
    {
      userId: "u1",
      practiceId: "p1",
      authorId: "a1",
      stars: 4,
      createdAt: yearAgo,
    },
    {
      userId: "u2",
      practiceId: "p1",
      authorId: "a1",
      stars: 5,
      createdAt: yesterday,
    },
  ];
  const after = before.map((row) =>
    row.userId === "u1" ? { ...row, stars: 2 } : row,
  );

  const beforeAgg = aggregateAdminRatingsByProduct({
    ratings: before,
    eligible: [
      { userId: "u1", practiceId: "p1", ratingEligibleAt: yearAgo },
      { userId: "u2", practiceId: "p1", ratingEligibleAt: yesterday },
    ],
    window7d,
    window30d,
  });
  const afterAgg = aggregateAdminRatingsByProduct({
    ratings: after,
    eligible: [
      { userId: "u1", practiceId: "p1", ratingEligibleAt: yearAgo },
      { userId: "u2", practiceId: "p1", ratingEligibleAt: yesterday },
    ],
    window7d,
    window30d,
  });

  assert.equal(beforeAgg[0]?.ratingCount, 2);
  assert.equal(beforeAgg[0]?.totalStars, 9);
  assert.equal(afterAgg[0]?.ratingCount, 2, "edit must not change count");
  assert.equal(afterAgg[0]?.totalStars, 7, "edit changes sum");
  assert.equal(afterAgg[0]?.stars7d, 5);
  assert.equal(afterAgg[0]?.count7d, 1);
  assert.equal(afterAgg[0]?.conversion, 1);
}

function testAuthorMultiPractice() {
  const ratings: AdminRatingFact[] = [
    {
      userId: "u1",
      practiceId: "p1",
      authorId: "a1",
      stars: 5,
      createdAt: yesterday,
    },
    {
      userId: "u2",
      practiceId: "p2",
      authorId: "a1",
      stars: 3,
      createdAt: yearAgo,
    },
    {
      userId: "u3",
      practiceId: "p3",
      authorId: "a2",
      stars: 4,
      createdAt: yesterday,
    },
  ];
  const authors = aggregateAdminRatingsByAuthor({
    ratings,
    window7d,
    window30d,
  });
  const author1 = authors.find((row) => row.authorId === "a1");
  assert.equal(author1?.totalStars, 8);
  assert.equal(author1?.ratingCount, 2);
  assert.equal(author1?.uniqueRaters, 2);
  assert.equal(author1?.ratingBearingProducts, 2);
  assert.equal(author1?.stars7d, 5);
  assert.equal(author1?.count7d, 1);
}

function testJournalOrderAndPagination() {
  const events: AdminRatingEventFact[] = [
    {
      id: "e1",
      occurredAt: "2026-09-05T10:00:00.000Z",
      oldStars: null,
      newStars: 4,
      userId: "u1",
      practiceId: "p1",
    },
    {
      id: "e2",
      occurredAt: "2026-09-05T11:00:00.000Z",
      oldStars: 4,
      newStars: 5,
      userId: "u1",
      practiceId: "p1",
    },
    {
      id: "e3",
      occurredAt: "2026-09-05T11:00:00.000Z",
      oldStars: null,
      newStars: 3,
      userId: "u2",
      practiceId: "p1",
    },
  ];

  assert.equal(classifyAdminRatingEventKind(null), "first");
  assert.equal(classifyAdminRatingEventKind(4), "changed");

  const sorted = [...events].sort(compareAdminRatingEventsDesc);
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["e3", "e2", "e1"],
    "newest first, id DESC on ties",
  );

  const page1 = paginateStable(sorted, 2, 0);
  const page2 = paginateStable(sorted, 2, 2);
  assert.deepEqual(page1.map((row) => row.id), ["e3", "e2"]);
  assert.deepEqual(page2.map((row) => row.id), ["e1"]);
  const overlap = page1.filter((row) => page2.some((other) => other.id === row.id));
  assert.equal(overlap.length, 0, "no pagination dupes");
}

function testDiagnosticsNeutralWording() {
  const nowMs = Date.parse(now);
  const observations = observeAdminRatingDiagnostics({
    nowMs,
    ratings: Array.from({ length: 8 }, (_, index) => ({
      userId: `u${index}`,
      practiceId: "p1",
      authorId: "a1",
      stars: 5,
      createdAt: now,
      voteIpHmac: "v1:same-ip",
      deviceIdHmac: "v1:same-dev",
    })),
  });

  assert.ok(observations.some((item) => item.kind === "burst_new_ratings"));
  assert.ok(observations.some((item) => item.kind === "shared_ip_signal"));
  assert.ok(observations.some((item) => item.kind === "shared_device_signal"));
  const text = JSON.stringify(observations);
  assert.doesNotMatch(text, /fraud|фрод|мошен/i);
  assert.match(text, /совпадающий IP-сигнал/i);
  assert.match(text, /совпадающий device-сигнал/i);
  assert.match(text, /Повышенная активность/);
  assert.doesNotMatch(text, /v1:same-ip|v1:same-dev/);
}

function testUrlState() {
  const parsed = parseAdminAnalyticsUrlState(
    new URLSearchParams(
      "view=ratings&ratingsPeriod=7d&ratingsTab=journal&ratingsQ=сон",
    ),
  );
  assert.equal(parsed.view, "ratings");
  assert.equal(parsed.ratingsPeriod, "7d");
  assert.equal(parsed.ratingsTab, "journal");
  assert.equal(parsed.ratingsQ, "сон");
  assert.equal(parsed.ratingsProductsSort, "total_stars");
  assert.equal(parseAdminRatingsPeriod("nope"), "all");

  const built = buildAdminAnalyticsSearchParams(parsed);
  assert.equal(built.get("view"), "ratings");
  assert.equal(built.get("ratingsPeriod"), "7d");
  assert.equal(built.get("ratingsTab"), "journal");
}

function testSourceContracts() {
  const migration = read(
    "supabase/migrations/20260922120000_admin_ratings_analytics.sql",
  );
  const stage2 = read("supabase/migrations/20260921120000_practice_ratings.sql");
  const stage1 = read(
    "supabase/migrations/20260920120000_practice_listen_stats.sql",
  );
  const workbench = read("src/components/admin/AdminAnalyticsWorkbench.tsx");
  const panel = read("src/components/admin/AdminRatingsPanel.tsx");
  const url = read("src/lib/admin/analytics-url-state.ts");
  const queries = read("src/lib/admin/analytics-ratings-queries.ts");
  const guard = read("src/lib/admin/analytics-ratings-route-guard.ts");
  const summaryRoute = read(
    "src/app/api/admin/analytics/ratings/summary/route.ts",
  );
  const eventsRoute = read("src/app/api/admin/analytics/ratings/events/route.ts");
  const stars = read(
    "src/components/products/practice-page/PracticeRatingStars.tsx",
  );
  const starClick = read("src/lib/ratings/star-click.ts");
  const hmac = read("src/lib/ratings/signal-hmac.ts");
  const write = read("src/lib/ratings/write.ts");
  const eligibility = read("src/lib/ratings/eligibility.ts");
  const feature = read("src/lib/ratings/feature.ts");
  const listenStats = read("src/lib/listen/listen-stats-route.ts");
  const progress = read(
    "src/app/api/listen/product/[slug]/[productSlug]/progress/route.ts",
  );
  const catalog = read("src/lib/catalog/search.ts");
  const database = read("docs/DATABASE.md");

  assert.match(migration, /admin_ratings_summary/);
  assert.match(migration, /admin_ratings_products/);
  assert.match(migration, /admin_ratings_authors/);
  assert.match(migration, /admin_ratings_events/);
  assert.match(migration, /admin_ratings_diagnostics/);
  assert.match(migration, /created_at[\s\S]*FIRST rating timestamp/);
  assert.match(migration, /Example A: created yesterday, now stars=5/);
  assert.match(migration, /Example B: created a year ago, edited today/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/);
  assert.match(
    migration,
    /jsonb_agg\(row_json ORDER BY occurred_at DESC, id DESC\)/,
  );
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_ratings_summary/);
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.admin_ratings_summary[\s\S]*TO authenticated/,
  );
  assert.doesNotMatch(migration, /CREATE TABLE.*author_ratings/);
  assert.doesNotMatch(migration, /фрод|fraud/i);
  assert.match(migration, /'auto_exclude', false/);
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION public\.set_practice_rating/,
  );

  assert.doesNotMatch(stage2, /admin_ratings_/);
  assert.doesNotMatch(stage1, /admin_ratings_|practice_ratings/);

  assert.match(workbench, /id: "ratings"/);
  assert.match(workbench, /AdminRatingsPanel/);
  assert.match(panel, /Оценки/);
  assert.match(panel, /ADMIN_RATINGS_PREVIEW_UX_BACKLOG/);
  assert.match(panel, /ratingsJournalPracticeId/);
  assert.match(panel, /ratingsJournalAuthorId/);
  assert.doesNotMatch(panel, /from "@\/lib\/admin\/analytics-ratings-queries"/);
  assert.doesNotMatch(panel, /type="button"[^>]*>\s*(Исключить|Вернуть)/);
  assert.doesNotMatch(panel, /fraud|фрод/i);

  assert.match(url, /value === "ratings"/);
  assert.match(queries, /createServiceRoleClient/);
  assert.match(guard, /analytics\.view/);
  assert.match(summaryRoute, /requireRatingsAnalyticsViewActor/);
  assert.match(eventsRoute, /requireRatingsAnalyticsViewActor/);

  assert.match(starClick, /Не удалось сохранить оценку/);
  assert.match(stars, /resolvePracticeRatingStarClick/);
  assert.match(hmac, /RATINGS_SIGNAL_HMAC_SECRET/);
  assert.match(write, /set_practice_rating/);
  assert.doesNotMatch(eligibility, /admin_ratings_/);
  assert.match(feature, /RATINGS_UI_ENABLED/);
  assert.doesNotMatch(listenStats, /admin_ratings_|practice_ratings/);
  assert.doesNotMatch(progress, /admin_ratings_|practice_ratings/);
  assert.doesNotMatch(catalog, /admin_ratings_/);

  assert.match(database, /Admin Ratings analytics \(Stage 3\)/);
  assert.match(database, /время первой оценки/);
  assert.match(database, /Не удалось сохранить оценку/);
}

testSummaryFixture();
testTemporalAB();
testEligibleConversionGrain();
testProductAggregateEditChangesSumNotCount();
testAuthorMultiPractice();
testJournalOrderAndPagination();
testDiagnosticsNeutralWording();
testUrlState();
testSourceContracts();

console.log("admin-ratings-analytics-unit: ok");
