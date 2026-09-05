#!/usr/bin/env node
/**
 * Stage 2 practice_ratings: eligibility gate, stars bounds, HMAC,
 * aggregate, API/UI source contracts. Isolated SQL lives in the companion.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveListenApiDecision } from "../src/lib/listen/preview-access";
import { RATING_ELIGIBILITY_LISTEN_MS } from "../src/lib/listen/listen-stats-constants";
import { aggregateActivePracticeRatings } from "../src/lib/ratings/aggregate";
import { readAnonymousIdFromRequest } from "../src/lib/ratings/anonymous-id";
import {
  evaluatePracticeRatingGate,
  isActiveRatingEligibleAt,
} from "../src/lib/ratings/eligibility";
import { isRatingsUiEnabled } from "../src/lib/ratings/feature";
import { hmacRatingSignal } from "../src/lib/ratings/signal-hmac";
import { parsePracticeRatingStars } from "../src/lib/ratings/stars";
import {
  buildPracticeRatingApiPath,
  buildPracticeRatingPutBody,
  RATING_NOT_ELIGIBLE_COPY,
  RATING_THANKS_COPY,
} from "../src/lib/ratings/client";
import { getTrustedClientIp } from "../src/lib/http/trusted-client-ip";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function entitledGate(
  overrides: Partial<Parameters<typeof evaluatePracticeRatingGate>[0]> = {},
) {
  return evaluatePracticeRatingGate({
    userId: "user-a",
    access: { mode: "entitled" },
    isCourse: false,
    productKind: "practice",
    isAuthorOwner: false,
    ratingEligibleAt: "2026-09-05T00:00:30.000Z",
    ...overrides,
  });
}

function testStarsBounds() {
  assert.equal(parsePracticeRatingStars(1), 1);
  assert.equal(parsePracticeRatingStars(5), 5);
  assert.equal(parsePracticeRatingStars(4), 4);
  assert.equal(parsePracticeRatingStars(0), null);
  assert.equal(parsePracticeRatingStars(6), null);
  assert.equal(parsePracticeRatingStars(-1), null);
  assert.equal(parsePracticeRatingStars("4"), null);
  assert.equal(parsePracticeRatingStars(null), null);
  assert.equal(parsePracticeRatingStars(undefined), null);
  assert.equal(parsePracticeRatingStars(4.5), null);
  assert.equal(parsePracticeRatingStars(NaN), null);
}

function testEligibilityReusesStage1() {
  assert.equal(RATING_ELIGIBILITY_LISTEN_MS, 30_000);
  assert.equal(isActiveRatingEligibleAt(null), false);
  assert.equal(isActiveRatingEligibleAt(""), false);
  assert.equal(isActiveRatingEligibleAt("2026-09-05T00:00:30.000Z"), true);

  assert.deepEqual(
    entitledGate({ ratingEligibleAt: null }),
    { ok: false, status: 403, error: "rating_not_eligible" },
    "null eligible rejected even if client would claim 29999ms",
  );
  assert.deepEqual(
    entitledGate({
      ratingEligibleAt: null,
    }),
    { ok: false, status: 403, error: "rating_not_eligible" },
  );
  assert.equal(entitledGate().ok, true, "eligible accepted");

  assert.deepEqual(entitledGate({ userId: null }), {
    ok: false,
    status: 401,
    error: "unauthorized",
  });

  assert.deepEqual(
    entitledGate({
      isAuthorOwner: true,
      ratingEligibleAt: "2026-09-05T00:00:30.000Z",
    }),
    { ok: false, status: 403, error: "author_cannot_rate_own_product" },
  );
  assert.deepEqual(
    entitledGate({
      access: { mode: "author_preview" },
      isAuthorOwner: false,
      ratingEligibleAt: "2026-09-05T00:00:30.000Z",
    }),
    { ok: false, status: 403, error: "author_cannot_rate_own_product" },
  );

  assert.deepEqual(
    entitledGate({
      access: { mode: "catalog_preview" },
      ratingEligibleAt: "2026-09-05T00:00:30.000Z",
    }),
    { ok: false, status: 403, error: "rating_not_eligible" },
    "preview cannot rate even with a historical eligible stamp",
  );

  assert.deepEqual(
    entitledGate({ isCourse: true }),
    { ok: false, status: 403, error: "rating_not_eligible" },
  );

  for (const kind of ["practice", "music", "audio_post"] as const) {
    assert.equal(entitledGate({ productKind: kind }).ok, true, `${kind} can rate`);
  }
}

function testAccessDecisionPreviewDenied() {
  const preview = resolveListenApiDecision({
    purpose: "rating",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(preview.ok, false, "preview never opens rating API");

  const entitled = resolveListenApiDecision({
    purpose: "rating",
    isCourse: false,
    courseAllowed: false,
    canListen: true,
    accessReason: "free",
    catalogPreviewEligible: true,
    listenAccess: { mode: "entitled" },
  });
  assert.equal(entitled.ok, true, "entitled rating access allowed");
}

function testFeatureFlag() {
  assert.equal(isRatingsUiEnabled({}), false);
  assert.equal(isRatingsUiEnabled({ RATINGS_UI_ENABLED: "true" }), true);
  assert.equal(isRatingsUiEnabled({ RATINGS_UI_ENABLED: "1" }), true);
  assert.equal(isRatingsUiEnabled({ RATINGS_UI_ENABLED: "yes" }), true);
  assert.equal(isRatingsUiEnabled({ RATINGS_UI_ENABLED: "on" }), true);
  assert.equal(isRatingsUiEnabled({ RATINGS_UI_ENABLED: "false" }), false);
  assert.equal(isRatingsUiEnabled({ RATINGS_UI_ENABLED: "0" }), false);
}

function testHmacAndTrustedIp() {
  const env = { RATINGS_SIGNAL_HMAC_SECRET: "unit-secret" };
  const hashed = hmacRatingSignal("ip", "203.0.113.9", env);
  assert.match(hashed ?? "", /^v1:[0-9a-f]{64}$/);
  assert.doesNotMatch(hashed ?? "", /203\.0\.113\.9/);
  assert.equal(hmacRatingSignal("ip", "unknown", env), null);
  assert.equal(hmacRatingSignal("device", "", env), null);
  assert.equal(
    hmacRatingSignal("ip", "203.0.113.9", env),
    hmacRatingSignal("ip", "203.0.113.9", env),
  );
  assert.notEqual(
    hmacRatingSignal("ip", "203.0.113.9", env),
    hmacRatingSignal("device", "203.0.113.9", env),
  );

  const spoofed = new Request("https://audiolad.ru/api", {
    headers: {
      "x-forwarded-for": "198.51.100.1, 203.0.113.9",
      "x-real-ip": "203.0.113.9",
    },
  });
  assert.equal(getTrustedClientIp(spoofed), "203.0.113.9");
  assert.notEqual(getTrustedClientIp(spoofed), "198.51.100.1");

  const fromBody = readAnonymousIdFromRequest(spoofed, "anon-from-body");
  assert.equal(fromBody, "anon-from-body");
  const fromCookie = readAnonymousIdFromRequest(
    new Request("https://audiolad.ru/api", {
      headers: { cookie: "audiolad_anonymous_id=anon-cookie-1" },
    }),
  );
  assert.equal(fromCookie, "anon-cookie-1");
}

function testAggregateNoDoubleCount() {
  assert.deepEqual(
    aggregateActivePracticeRatings([
      { stars: 5 },
      { stars: 3 },
      { stars: 4 },
    ]),
    { totalStars: 12, ratingCount: 3 },
  );
  assert.deepEqual(
    aggregateActivePracticeRatings([
      { stars: 2 },
      { stars: 3 },
      { stars: 4 },
    ]),
    { totalStars: 9, ratingCount: 3 },
    "A 5→2 replaces the active 5; no double count",
  );
  assert.deepEqual(
    aggregateActivePracticeRatings([
      { stars: 5 },
      { stars: 3, excludedAt: "2026-09-05T00:00:00.000Z" },
      { stars: 4 },
    ]),
    { totalStars: 9, ratingCount: 2 },
  );
}

function testClientContracts() {
  assert.equal(
    buildPracticeRatingApiPath("anna", "morning"),
    "/api/listen/product/anna/morning/rating",
  );
  assert.equal(
    RATING_NOT_ELIGIBLE_COPY,
    "Послушайте аудио хотя бы 30 секунд, чтобы поставить оценку.",
  );
  assert.doesNotMatch(RATING_NOT_ELIGIBLE_COPY, /практик/i);
  assert.equal(RATING_THANKS_COPY, "Спасибо! Ваша оценка учтена.");

  const body = buildPracticeRatingPutBody(4);
  assert.equal(body.stars, 4);
  assert.equal("user_id" in body, false);
  assert.equal("practice_id" in body, false);
  assert.equal("ratingEligible" in body, false);
  assert.equal("realListenedMs" in body, false);
}

function testSourceContracts() {
  const migration = read("supabase/migrations/20260921120000_practice_ratings.sql");
  const listenStatsMigration = read(
    "supabase/migrations/20260920120000_practice_listen_stats.sql",
  );
  const route = read("src/lib/ratings/route.ts");
  const write = read("src/lib/ratings/write.ts");
  const eligibility = read("src/lib/ratings/eligibility.ts");
  const hmac = read("src/lib/ratings/signal-hmac.ts");
  const ui = read(
    "src/components/products/practice-page/PracticeRatingStars.tsx",
  );
  const pdp = read(
    "src/components/products/practice-page/PracticePageContent.tsx",
  );
  const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const productRoute = read(
    "src/app/api/listen/product/[slug]/[productSlug]/rating/route.ts",
  );
  const legacyRoute = read("src/app/api/listen/legacy/[slug]/rating/route.ts");
  const database = read("docs/DATABASE.md");
  const previewAccess = read("src/lib/listen/preview-access.ts");
  const feature = read("src/lib/ratings/feature.ts");
  const listenStatsRoute = read("src/lib/listen/listen-stats-route.ts");
  const progressRoute = read(
    "src/app/api/listen/product/[slug]/[productSlug]/progress/route.ts",
  );
  const clipServe = read("src/lib/listen/serve-preview-clip-response.ts");
  const player = read("src/components/audio/useSequentialPlayer.ts");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_ratings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_rating_events/);
  assert.match(migration, /set_practice_rating/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_practice_rating/);
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
  assert.match(migration, /created_at is the first rating time/i);

  assert.doesNotMatch(listenStatsMigration, /practice_ratings|practice_rating_events/);

  assert.match(route, /purpose:\s*"rating"/);
  assert.match(route, /evaluatePracticeRatingGate/);
  assert.match(route, /getOwnPracticeRatingEligibleAt/);
  assert.match(route, /hmacRatingSignal\("ip", getTrustedClientIp/);
  assert.match(route, /error: "unauthorized"/);
  assert.match(route, /error: "invalid_stars"/);
  assert.match(write, /set_practice_rating/);
  assert.doesNotMatch(route, /body\.user_id/);
  assert.doesNotMatch(route, /body\.ratingEligible/);
  assert.doesNotMatch(route, /body\.realListenedMs/);
  assert.doesNotMatch(eligibility, /real_listened_ms|realListenedMs/);

  assert.match(hmac, /createHmac/);
  assert.match(hmac, /RATINGS_SIGNAL_HMAC_SECRET/);
  assert.doesNotMatch(hmac, /console\.(log|info|debug).*SECRET/);

  assert.match(productRoute, /handlePracticeRatingGet/);
  assert.match(productRoute, /handlePracticeRatingPut/);
  assert.match(legacyRoute, /handlePracticeRatingGet/);
  assert.match(previewAccess, /"rating"/);

  assert.match(feature, /RATINGS_UI_ENABLED/);
  assert.match(page, /isRatingsUiEnabled/);
  assert.match(pdp, /PracticeRatingStars/);
  assert.match(pdp, /ratingsUiEnabled/);
  assert.match(audioPost, /PracticeRatingStars/);
  assert.match(ui, /RATING_NOT_ELIGIBLE_COPY/);
  assert.match(ui, /RATING_THANKS_COPY/);
  assert.match(ui, /buildAuthRouteHref\("\/auth\/sign-in"/);
  assert.match(ui, /putOwnPracticeRating/);
  assert.doesNotMatch(ui, /window\.alert|confirm\(/);
  assert.doesNotMatch(ui, /modal|dialog|popup/i);

  assert.match(database, /practice_audio_progress \(resume cursor\)/);
  assert.match(database, /practice_listen_stats \(trusted MEDIA-TIME/);
  assert.match(database, /practice_ratings \(current active rating\)/);
  assert.match(database, /practice_rating_events \(immutable audit/);
  assert.match(database, /время первой оценки/);
  assert.match(database, /totalStars/);
  assert.match(database, /ratingCount/);

  assert.match(listenStatsRoute, /purpose:\s*"listen_stats"/);
  assert.doesNotMatch(listenStatsRoute, /practice_ratings|set_practice_rating/);
  assert.doesNotMatch(progressRoute, /practice_ratings|set_practice_rating/);
  assert.doesNotMatch(clipServe, /practice_ratings|set_practice_rating/);
  assert.doesNotMatch(player, /practice_ratings|\/rating/);
}

testStarsBounds();
testEligibilityReusesStage1();
testAccessDecisionPreviewDenied();
testFeatureFlag();
testHmacAndTrustedIp();
testAggregateNoDoubleCount();
testClientContracts();
testSourceContracts();

console.log("practice-ratings-unit: ok");
