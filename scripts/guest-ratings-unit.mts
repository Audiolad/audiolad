#!/usr/bin/env node
/**
 * Guest ratings (task f8f5908b): cookie, listen threshold, anti-abuse,
 * captcha, claim, aggregates, surfaces, rate limits, registered regression.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeGuestListenerSearch } from "../src/lib/admin/analytics-ratings-listeners";
import { evaluatePracticeRatingGate } from "../src/lib/ratings/eligibility";
import {
  aggregateGuestRatingRows,
  resolveDisplayedRatingAggregates,
} from "../src/lib/ratings/guest/aggregate";
import { verifyGuestCaptchaToken } from "../src/lib/ratings/guest/captcha";
import {
  planGuestRatingClaim,
  planGuestRatingUpdate,
  shouldClearGuestRatingCookie,
} from "../src/lib/ratings/guest/claim";
import {
  GUEST_RATING_ADMIN_NO_IP_SANCTION,
  formatGuestSessionAdminLabel,
} from "../src/lib/ratings/guest/copy";
import {
  guestRatingsCaptchaProvider,
  isGuestRatingsClaimCopyEnabled,
  isGuestRatingsCollectEnabled,
  isGuestRatingsIncludedInPublicAggregate,
  isGuestRatingsPublicEnabled,
  isGuestRatingsTestMode,
} from "../src/lib/ratings/guest/feature";
import {
  evaluateGuestListenTick,
  type GuestListenState,
} from "../src/lib/ratings/guest/listen-tick";
import { decideGuestRatingWrite } from "../src/lib/ratings/guest/policy";
import {
  guestRatingSegmentForProductKind,
  addGuestRatingSegmentStar,
  emptyGuestRatingSegmentTotals,
} from "../src/lib/ratings/guest/segments";
import {
  GUEST_RATING_COOKIE_NAME,
  GUEST_RATING_TEST_SESSION_SECRET,
  guestRatingCookieOptions,
  readGuestRatingCookieValue,
  resolveGuestRatingSessionSecret,
  signGuestRatingSession,
  verifyGuestRatingSession,
} from "../src/lib/ratings/guest/session";
import { shouldReportGuestRatingListen } from "../src/lib/ratings/guest/surfaces";
import {
  GUEST_CAPTCHA_FAILURE_VISIBLE_MS,
  GUEST_HOT_NETWORK_NEW_GUESTS,
  GUEST_LISTEN_HARD_LIMIT,
  GUEST_RATING_HARD_LIMIT,
  decideGuestCaptcha,
  isGuestHardRateLimited,
} from "../src/lib/ratings/guest/suspicion";
import {
  guestRatingListenThresholdMs,
  resolveGuestAccessibleTotalMs,
} from "../src/lib/ratings/guest/threshold";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guestId = "11111111-1111-4111-8111-111111111111";
const secret = "unit-session-secret";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function tick(
  state: GuestListenState | null,
  positionMs: number,
  nowMs: number,
  extra: Partial<Parameters<typeof evaluateGuestListenTick>[1]> = {},
) {
  return evaluateGuestListenTick(state, {
    audioItemId: "track-a",
    positionMs,
    nowMs,
    allowEligibility: true,
    itemDurationMs: null,
    accessibleTotalMs: 180_000,
    ...extra,
  });
}

function warmedCaptcha() {
  return decideGuestCaptcha({
    cookieAgeMs: 60_000,
    votesIn10Min: 0,
    votesIn60Min: 0,
    captchaFailures: 0,
    captchaFailureAgeMs: null,
    newGuestsOnNetwork24h: 1,
  });
}

function testFlagsDefaultOff() {
  const env = {};
  assert.equal(isGuestRatingsCollectEnabled(env), false);
  assert.equal(isGuestRatingsPublicEnabled(env), false);
  assert.equal(isGuestRatingsIncludedInPublicAggregate(env), false);
  assert.equal(isGuestRatingsClaimCopyEnabled(env), false);
  assert.equal(isGuestRatingsTestMode(env), false);
  assert.equal(
    isGuestRatingsCollectEnabled({ NODE_ENV: "test", GUEST_RATINGS_COLLECT_ENABLED: "1" }),
    true,
  );
  assert.equal(
    isGuestRatingsClaimCopyEnabled({ GUEST_RATINGS_CLAIM_COPY_ENABLED: "1" }),
    true,
  );
  assert.equal(
    isGuestRatingsCollectEnabled({
      NODE_ENV: "production",
      GUEST_RATINGS_COLLECT_ENABLED: "1",
    }),
    false,
  );
  assert.equal(
    isGuestRatingsCollectEnabled({
      NODE_ENV: "production",
      GUEST_RATINGS_COLLECT_ENABLED: "1",
      GUEST_RATINGS_SESSION_SECRET: "real-secret",
    }),
    true,
  );
  assert.equal(
    isGuestRatingsTestMode({ NODE_ENV: "production", GUEST_RATINGS_TEST_MODE: "1" }),
    false,
  );
  assert.equal(isGuestRatingsPublicEnabled({ GUEST_RATINGS_PUBLIC_ENABLED: "yes" }), true);
  assert.equal(
    isGuestRatingsIncludedInPublicAggregate({ GUEST_RATINGS_INCLUDE_IN_AGGREGATE: "on" }),
    true,
  );
  assert.equal(guestRatingsCaptchaProvider({}), "smartcaptcha");
  assert.equal(
    guestRatingsCaptchaProvider({ GUEST_RATINGS_CAPTCHA_PROVIDER: "turnstile" }),
    "turnstile",
  );
}

function testSignedCookie() {
  const now = Date.parse("2026-10-23T08:40:00.000Z");
  const token = signGuestRatingSession({ guestId, issuedAtMs: now }, secret);
  const session = verifyGuestRatingSession(token, secret, now + 1000);
  assert.equal(session?.guestId, guestId);
  assert.equal(verifyGuestRatingSession(token, "other-secret", now), null);
  assert.equal(verifyGuestRatingSession(`${token}x`, secret, now), null);
  assert.equal(
    verifyGuestRatingSession(token, secret, now + 401 * 24 * 60 * 60 * 1000),
    null,
  );
  assert.equal(verifyGuestRatingSession(token, secret, now - 10 * 60 * 1000), null);

  const header = `theme=light; ${GUEST_RATING_COOKIE_NAME}=${encodeURIComponent(token)}`;
  assert.equal(readGuestRatingCookieValue(header), token);
  const options = guestRatingCookieOptions(true);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.secure, true);
  assert.equal(options.name, "al_guest");

  assert.equal(resolveGuestRatingSessionSecret({}), null);
  assert.equal(
    resolveGuestRatingSessionSecret({ NODE_ENV: "test", GUEST_RATINGS_TEST_MODE: "1" }),
    GUEST_RATING_TEST_SESSION_SECRET,
  );
  assert.equal(
    resolveGuestRatingSessionSecret({
      NODE_ENV: "test",
      GUEST_RATINGS_TEST_MODE: "1",
      GUEST_RATINGS_SESSION_SECRET: "real",
    }),
    "real",
  );
  assert.equal(
    resolveGuestRatingSessionSecret({
      NODE_ENV: "production",
      GUEST_RATINGS_TEST_MODE: "1",
    }),
    null,
  );
  assert.equal(
    resolveGuestRatingSessionSecret({
      NODE_ENV: "production",
      GUEST_RATINGS_SESSION_SECRET: "real",
    }),
    "real",
  );
}

function testThreshold() {
  assert.equal(guestRatingListenThresholdMs(null), 30_000);
  assert.equal(guestRatingListenThresholdMs(0), 30_000);
  assert.equal(guestRatingListenThresholdMs(120_000), 30_000);
  assert.equal(guestRatingListenThresholdMs(30_000), 30_000);
  assert.equal(guestRatingListenThresholdMs(3_000), 3_000);
  assert.equal(guestRatingListenThresholdMs(6_000), 5_000);
  assert.equal(guestRatingListenThresholdMs(10_000), 8_000);
  assert.equal(
    resolveGuestAccessibleTotalMs({
      kind: "preview",
      previewDurationMs: 12_000,
      trackDurationMs: [180_000],
    }),
    12_000,
  );
  assert.equal(
    resolveGuestAccessibleTotalMs({
      kind: "full",
      previewDurationMs: 12_000,
      trackDurationMs: [20_000, null],
    }),
    null,
  );
  assert.equal(
    resolveGuestAccessibleTotalMs({
      kind: "full",
      previewDurationMs: null,
      trackDurationMs: [8_000, 9_000],
    }),
    17_000,
  );
}

function testListenAbuse() {
  let state = tick(null, 0, 0);
  assert.equal(state.acceptedMs, 0);
  assert.equal(state.ratingEligibleAt, null);

  state = tick(state, 5_000, 5_000);
  assert.equal(state.acceptedMs, 5_000);

  const rewound = tick(state, 1_000, 8_000);
  assert.equal(rewound.acceptedMs, 0);
  assert.equal(rewound.items[0]?.highWaterMs, 5_000);

  const replayed = tick(rewound, 5_000, 14_000);
  assert.equal(replayed.acceptedMs, 0);
  assert.equal(replayed.realListenedMs, 5_000);

  const gapped = tick(state, 9_000, 5_000 + 21_000);
  assert.equal(gapped.acceptedMs, 0);

  const sought = tick(tick(null, 0, 0), 25_000, 5_000);
  assert.equal(sought.acceptedMs, 0);

  const sped = tick(tick(null, 0, 0), 10_000, 1_000, { playbackRate: 8 });
  assert.equal(sped.acceptedMs, 1_500);

  let capped = tick(null, 0, 0, { itemDurationMs: 8_000, accessibleTotalMs: 8_000 });
  capped = tick(capped, 8_000, 8_000, { itemDurationMs: 8_000, accessibleTotalMs: 8_000 });
  assert.equal(capped.realListenedMs, 8_000);
  const pastItem = tick(capped, 12_000, 16_000, {
    itemDurationMs: 8_000,
    accessibleTotalMs: 8_000,
  });
  assert.equal(pastItem.acceptedMs, 0);

  const short = tick(tick(null, 0, 0, { accessibleTotalMs: 4_000, itemDurationMs: 4_000 }), 4_000, 4_000, {
    accessibleTotalMs: 4_000,
    itemDurationMs: 4_000,
  });
  assert.equal(short.realListenedMs, 4_000);
  assert.ok(short.ratingEligibleAt);

  let full = tick(null, 0, 0);
  full = tick(full, 15_000, 10_000);
  assert.equal(full.ratingEligibleAt, null);
  full = tick(full, 30_000, 20_000);
  assert.equal(full.realListenedMs, 30_000);
  assert.ok(full.ratingEligibleAt);
}

function testCaptchaAndSuspicion() {
  const none = warmedCaptcha();
  assert.deepEqual(none, { mode: "none", reason: null });
  assert.equal(
    decideGuestCaptcha({
      cookieAgeMs: 1_000,
      votesIn10Min: 0,
      votesIn60Min: 0,
      captchaFailures: 0,
      captchaFailureAgeMs: null,
      newGuestsOnNetwork24h: null,
    }).mode,
    "invisible",
  );
  assert.equal(
    decideGuestCaptcha({
      cookieAgeMs: 60_000,
      votesIn10Min: 0,
      votesIn60Min: 0,
      captchaFailures: 0,
      captchaFailureAgeMs: null,
      newGuestsOnNetwork24h: GUEST_HOT_NETWORK_NEW_GUESTS - 1,
    }).mode,
    "none",
  );
  const hot = decideGuestCaptcha({
    cookieAgeMs: 60_000,
    votesIn10Min: 0,
    votesIn60Min: 0,
    captchaFailures: 0,
    captchaFailureAgeMs: null,
    newGuestsOnNetwork24h: GUEST_HOT_NETWORK_NEW_GUESTS,
  });
  assert.equal(hot.mode, "invisible");
  assert.equal(hot.reason, "hot_network");
  assert.equal("deny" in hot, false);
  assert.equal(
    decideGuestCaptcha({
      cookieAgeMs: 60_000,
      votesIn10Min: 8,
      votesIn60Min: 8,
      captchaFailures: 0,
      captchaFailureAgeMs: null,
      newGuestsOnNetwork24h: 1,
    }).mode,
    "visible",
  );
  const retry = decideGuestCaptcha({
    cookieAgeMs: 60_000,
    votesIn10Min: 0,
    votesIn60Min: 0,
    captchaFailures: 1,
    captchaFailureAgeMs: 1_000,
    newGuestsOnNetwork24h: 1,
  });
  assert.equal(retry.mode, "visible");
  assert.equal(retry.reason, "captcha_retry");
  assert.equal(
    decideGuestCaptcha({
      cookieAgeMs: 60_000,
      votesIn10Min: 0,
      votesIn60Min: 0,
      captchaFailures: 1,
      captchaFailureAgeMs: GUEST_CAPTCHA_FAILURE_VISIBLE_MS + 1,
      newGuestsOnNetwork24h: 1,
    }).mode,
    "none",
  );
  assert.equal(
    decideGuestCaptcha({
      cookieAgeMs: 60_000,
      votesIn10Min: 0,
      votesIn60Min: 0,
      captchaFailures: 3,
      captchaFailureAgeMs: null,
      newGuestsOnNetwork24h: 1,
    }).mode,
    "none",
  );

  assert.equal(isGuestHardRateLimited(GUEST_RATING_HARD_LIMIT - 1, GUEST_RATING_HARD_LIMIT), false);
  assert.equal(isGuestHardRateLimited(GUEST_RATING_HARD_LIMIT, GUEST_RATING_HARD_LIMIT), true);
  assert.equal(isGuestHardRateLimited(GUEST_LISTEN_HARD_LIMIT, GUEST_LISTEN_HARD_LIMIT), true);
}

async function testCaptchaTokens() {
  const seen = new Set<string>();
  const consume = async (hash: string) => {
    if (seen.has(hash)) return "reused" as const;
    seen.add(hash);
    return "fresh" as const;
  };
  const off = await verifyGuestCaptchaToken({
    token: "test:pass",
    env: {},
    consumeToken: consume,
  });
  assert.deepEqual(off, { ok: false, reason: "invalid_token" });

  const refused = await verifyGuestCaptchaToken({
    token: "test:pass",
    env: { NODE_ENV: "production", GUEST_RATINGS_TEST_MODE: "1" },
    consumeToken: consume,
  });
  assert.deepEqual(refused, { ok: false, reason: "invalid_token" });
  assert.equal(seen.size, 0);

  const env = { NODE_ENV: "test", GUEST_RATINGS_TEST_MODE: "1" };
  const pass = await verifyGuestCaptchaToken({ token: "test:pass", env, consumeToken: consume });
  assert.equal(pass.ok, true);
  const reused = await verifyGuestCaptchaToken({
    token: "test:pass",
    env,
    consumeToken: consume,
  });
  assert.deepEqual(reused, { ok: false, reason: "invalid_token" });
  assert.deepEqual(
    await verifyGuestCaptchaToken({ token: "test:fail", env, consumeToken: consume }),
    { ok: false, reason: "invalid_token" },
  );
  assert.deepEqual(
    await verifyGuestCaptchaToken({ token: "test:outage", env, consumeToken: consume }),
    { ok: false, reason: "provider_unavailable" },
  );
  assert.deepEqual(
    await verifyGuestCaptchaToken({ token: "provider-token", env: {}, consumeToken: consume }),
    { ok: false, reason: "not_configured" },
  );

  const outage = await verifyGuestCaptchaToken({
    token: "provider-token",
    env: { YANDEX_SMARTCAPTCHA_SERVER_KEY: "server-key" },
    consumeToken: consume,
    fetchImpl: async () => {
      throw new Error("down");
    },
  });
  assert.deepEqual(outage, { ok: false, reason: "provider_unavailable" });

  const bad = await verifyGuestCaptchaToken({
    token: "provider-token-2",
    env: { YANDEX_SMARTCAPTCHA_SERVER_KEY: "server-key" },
    consumeToken: consume,
    fetchImpl: async () =>
      new Response(JSON.stringify({ status: "failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  assert.deepEqual(bad, { ok: false, reason: "invalid_token" });

  const ok = await verifyGuestCaptchaToken({
    token: "provider-token-3",
    env: {
      GUEST_RATINGS_CAPTCHA_PROVIDER: "turnstile",
      TURNSTILE_SECRET_KEY: "server-key",
    },
    consumeToken: consume,
    fetchImpl: async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  assert.deepEqual(ok, { ok: true, provider: "turnstile" });
}

function rejected(decision: ReturnType<typeof decideGuestRatingWrite>) {
  assert.equal(decision.ok, false);
  if (decision.ok) {
    throw new Error("expected a rejected guest rating");
  }
  return decision;
}

function testPolicy() {
  const base = {
    collectEnabled: true,
    sessionPresent: true,
    sessionSecretConfigured: true,
    starsValid: true,
    eligible: true,
    claimed: false,
    hardRateLimited: false,
    captcha: warmedCaptcha(),
    captchaResult: null,
  };
  assert.equal(rejected(decideGuestRatingWrite({ ...base, collectEnabled: false })).status, 401);
  assert.equal(
    rejected(decideGuestRatingWrite({ ...base, sessionSecretConfigured: false })).status,
    503,
  );
  assert.equal(rejected(decideGuestRatingWrite({ ...base, sessionPresent: false })).status, 403);
  assert.equal(
    rejected(decideGuestRatingWrite({ ...base, starsValid: false })).error,
    "invalid_stars",
  );
  assert.equal(rejected(decideGuestRatingWrite({ ...base, hardRateLimited: true })).status, 429);
  assert.equal(rejected(decideGuestRatingWrite({ ...base, claimed: true })).status, 409);
  assert.equal(
    rejected(decideGuestRatingWrite({ ...base, eligible: false })).error,
    "rating_not_eligible",
  );
  assert.deepEqual(decideGuestRatingWrite(base), { ok: true, verification: "listen" });

  const invisible = decideGuestCaptcha({
    cookieAgeMs: 1_000,
    votesIn10Min: 0,
    votesIn60Min: 0,
    captchaFailures: 0,
    captchaFailureAgeMs: null,
    newGuestsOnNetwork24h: null,
  });
  const required = decideGuestRatingWrite({ ...base, captcha: invisible });
  assert.equal(required.ok, false);
  if (!required.ok) {
    assert.equal(required.error, "captcha_required");
    assert.equal(required.captchaMode, "invisible");
  }
  const outage = decideGuestRatingWrite({
    ...base,
    captcha: invisible,
    captchaResult: { ok: false, reason: "provider_unavailable" },
  });
  assert.equal(outage.ok, false);
  if (!outage.ok) assert.equal(outage.status, 503);
  const passed = decideGuestRatingWrite({
    ...base,
    captcha: invisible,
    captchaResult: { ok: true, provider: "smartcaptcha" },
  });
  assert.deepEqual(passed, { ok: true, verification: "listen_captcha" });
}

function testClaimAggregateAndSegments() {
  assert.deepEqual(
    planGuestRatingClaim({
      collectEnabled: false,
      copyEnabled: false,
      guestStars: 4,
      accountStars: null,
    }),
    { action: "skip", reason: "collect_off" },
  );
  assert.deepEqual(
    planGuestRatingClaim({
      collectEnabled: false,
      copyEnabled: true,
      guestStars: 4,
      accountStars: null,
    }),
    { action: "skip", reason: "collect_off" },
  );
  assert.deepEqual(
    planGuestRatingClaim({
      collectEnabled: true,
      copyEnabled: false,
      guestStars: 4,
      accountStars: null,
    }),
    { action: "link_only" },
  );
  assert.deepEqual(
    planGuestRatingClaim({
      collectEnabled: true,
      copyEnabled: false,
      guestStars: 4,
      accountStars: 5,
    }),
    { action: "supersede_guest", reason: "account_vote" },
  );
  assert.deepEqual(
    planGuestRatingClaim({
      collectEnabled: true,
      copyEnabled: true,
      guestStars: 4,
      accountStars: null,
    }),
    { action: "copy_to_account", stars: 4 },
  );
  assert.deepEqual(
    planGuestRatingClaim({
      collectEnabled: true,
      copyEnabled: true,
      guestStars: 4,
      accountStars: 5,
    }),
    { action: "supersede_guest", reason: "account_vote" },
  );
  assert.equal(
    shouldClearGuestRatingCookie({ claimed: 0, superseded: 0, linked: 0 }),
    false,
  );
  assert.equal(
    shouldClearGuestRatingCookie({ claimed: 0, superseded: 0, linked: 1 }),
    true,
  );
  assert.deepEqual(planGuestRatingUpdate({ previousStars: null, nextStars: 5 }), {
    changed: true,
    event: "first",
  });
  assert.deepEqual(planGuestRatingUpdate({ previousStars: 5, nextStars: 5 }), {
    changed: false,
    event: null,
  });
  assert.deepEqual(planGuestRatingUpdate({ previousStars: 4, nextStars: 5 }), {
    changed: true,
    event: "changed",
  });

  const registered = { totalStars: 10, ratingCount: 2 };
  const guest = aggregateGuestRatingRows([
    { stars: 5 },
    { stars: 1, supersededAt: "2026-10-23T00:00:00.000Z" },
    { stars: 2, claimedByUserId: guestId },
    { stars: 3, excludedAt: "2026-10-23T00:00:00.000Z" },
  ]);
  assert.deepEqual(guest, { totalStars: 5, ratingCount: 1 });
  const hidden = resolveDisplayedRatingAggregates({
    registered,
    guest,
    includeInPublic: false,
    showGuestSeparately: false,
  });
  assert.deepEqual(hidden.aggregate, registered);
  assert.equal(hidden.guestAggregate, null);
  const separate = resolveDisplayedRatingAggregates({
    registered,
    guest,
    includeInPublic: false,
    showGuestSeparately: true,
  });
  assert.deepEqual(separate.aggregate, registered);
  assert.deepEqual(separate.guestAggregate, guest);
  const included = resolveDisplayedRatingAggregates({
    registered,
    guest,
    includeInPublic: true,
    showGuestSeparately: true,
  });
  assert.deepEqual(included.aggregate, { totalStars: 15, ratingCount: 3 });

  assert.equal(guestRatingSegmentForProductKind("music"), "music");
  assert.equal(guestRatingSegmentForProductKind("practice"), "practice");
  assert.equal(guestRatingSegmentForProductKind("audio_post"), "practice");
  const music = addGuestRatingSegmentStar(
    addGuestRatingSegmentStar(emptyGuestRatingSegmentTotals(), 5),
    3,
  );
  assert.equal(music.average, 4);
  const practice = addGuestRatingSegmentStar(emptyGuestRatingSegmentTotals(), 2);
  assert.equal(practice.ratingCount, 1);
  assert.notEqual(music.totalStars, practice.totalStars);
}

function testSurfacesAndRegisteredRegression() {
  for (const surface of ["web", "pwa", "max", "vk"] as const) {
    assert.equal(
      shouldReportGuestRatingListen({
        surface,
        collectEnabled: true,
        isAuthenticated: false,
        hasPlayableAudio: true,
      }),
      true,
    );
    assert.equal(
      shouldReportGuestRatingListen({
        surface,
        collectEnabled: true,
        isAuthenticated: true,
        hasPlayableAudio: true,
      }),
      false,
    );
  }
  assert.equal(
    shouldReportGuestRatingListen({
      surface: "web",
      collectEnabled: false,
      isAuthenticated: false,
      hasPlayableAudio: true,
    }),
    false,
  );

  const gate = evaluatePracticeRatingGate({
    userId: "author-user",
    access: { mode: "author_preview" },
    isCourse: false,
    productKind: "practice",
    ratingEligibleAt: "2026-10-23T00:00:30.000Z",
  });
  assert.deepEqual(gate, { ok: true });
  const eligibility = read("src/lib/ratings/eligibility.ts");
  assert.doesNotMatch(eligibility, /authorId|isAuthor|own product/i);
  const route = read("src/lib/ratings/route.ts");
  assert.match(route, /if \(!isGuestRatingsCollectEnabled\(\)\)/);
  assert.match(route, /error: "unauthorized"/);
  const readAggregate = read("src/lib/ratings/read.ts");
  assert.match(readAggregate, /isGuestRatingsIncludedInPublicAggregate/);
  assert.match(readAggregate, /return registered;/);

  const maxPlayer = read("src/components/max/MaxAudioPlayer.tsx");
  const listenClient = read("src/lib/ratings/guest/listen-client.ts");
  assert.match(maxPlayer, /reportGuestListenSample/);
  assert.match(maxPlayer, /guestListen/);
  assert.doesNotMatch(maxPlayer, /\/listen\/|\/practice\//);
  assert.match(listenClient, /readListenStatsClientAuthenticated\(\)/);
  assert.match(listenClient, /listen-stats/);
  const vk = read("src/lib/vk/product-view.ts");
  assert.match(vk, /guestCollect/);
  const stars = read("src/components/products/practice-page/PracticeRatingStars.tsx");
  assert.match(stars, /useGuestPracticeRating/);
  const ip = read("src/lib/http/trusted-client-ip.ts");
  assert.doesNotMatch(ip, /guest_practice|al_guest|GUEST_RATINGS/);
  const captchaClient = read("src/lib/ratings/guest/captcha-client.ts");
  assert.doesNotMatch(captchaClient, /test:pass/);
  const copy = read("src/lib/ratings/guest/copy.ts");
  assert.doesNotMatch(copy, /—/);
  assert.match(formatGuestSessionAdminLabel(guestId), /^Гость · ID сессии /);
  assert.match(GUEST_RATING_ADMIN_NO_IP_SANCTION, /не блокируется/);
  assert.equal(normalizeGuestListenerSearch("sergey@audiolad.ru"), null);
  assert.equal(normalizeGuestListenerSearch("Иван"), null);
  assert.equal(normalizeGuestListenerSearch(guestId), guestId);
}

function testSourceContracts() {
  const migration = read("supabase/migrations/20270113120000_guest_practice_ratings.sql");
  assert.match(migration, /UNIQUE \(guest_id, practice_id\)/);
  assert.doesNotMatch(migration, /INSERT INTO auth\.users/i);
  assert.doesNotMatch(migration, /DELETE FROM public\.practice_ratings/i);
  assert.doesNotMatch(migration, /DELETE FROM public\.guest_practice_ratings/i);
  assert.doesNotMatch(migration, /ALTER TABLE public\.practice_ratings/);
  const signup = read("src/app/(platform)/auth/sign-up/actions.ts");
  assert.match(signup, /claimGuestRatingsForUser/);
  assert.match(signup, /shouldClearGuestRatingCookie/);
  const signin = read("src/app/(platform)/auth/sign-in/page.tsx");
  assert.match(signin, /claimGuestRatingsAction/);
  const claimAction = read("src/app/(platform)/auth/claim-guest-ratings/actions.ts");
  assert.match(claimAction, /shouldClearGuestRatingCookie/);
  const claimServer = read("src/lib/ratings/guest/claim-server.ts");
  const collectGate = claimServer.indexOf("isGuestRatingsCollectEnabled");
  const claimRpc = claimServer.indexOf("claim_guest_practice_ratings");
  assert.ok(collectGate >= 0 && claimRpc > collectGate);
  assert.match(claimServer, /p_copy_to_account: isGuestRatingsClaimCopyEnabled/);
  const ratingServer = read("src/lib/ratings/guest/rating-server.ts");
  const captchaGate = ratingServer.indexOf('preliminary.error === "captcha_required"');
  const captchaVerify = ratingServer.indexOf("await verifyGuestCaptchaToken");
  assert.ok(captchaGate >= 0 && captchaVerify > captchaGate);
  assert.doesNotMatch(ratingServer, /captcha_failures \+ 1/);
  assert.match(ratingServer, /record_guest_captcha_failure/);
  assert.match(ratingServer, /reset_guest_captcha_failures/);
}

async function main() {
  testFlagsDefaultOff();
  testSignedCookie();
  testThreshold();
  testListenAbuse();
  testCaptchaAndSuspicion();
  await testCaptchaTokens();
  testPolicy();
  testClaimAggregateAndSegments();
  testSurfacesAndRegisteredRegression();
  testSourceContracts();
  console.log("guest-ratings-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
