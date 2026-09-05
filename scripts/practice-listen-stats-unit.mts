#!/usr/bin/env node
/**
 * Stage 1 practice_listen_stats: MEDIA-TIME eligibility, access matrix,
 * source contracts. No database. Isolated SQL lives in the companion script.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canAccrueListenStats,
  canBecomeRatingEligible,
  isCourseListenStatsFollowUp,
} from "../src/lib/listen/listen-stats-access";
import {
  LISTEN_STATS_HEARTBEAT_MS,
  LISTEN_STATS_MAX_PLAYBACK_RATE,
  LISTEN_STATS_MAX_TICK_MS,
  LISTEN_STATS_SEEK_JUMP_MS,
  LISTEN_STATS_WALL_CLOCK_SLACK_MS,
  RATING_ELIGIBILITY_LISTEN_MS,
} from "../src/lib/listen/listen-stats-constants";
import {
  evaluateListenStatsTick,
  toListenStatsOwnState,
  type ListenStatsTickResult,
  type ListenStatsTickState,
} from "../src/lib/listen/listen-stats";
import {
  buildListenStatsHeartbeatBody,
  shouldReportListenStatsHeartbeat,
} from "../src/lib/listen/listen-stats-client";
import { resolveListenApiDecision } from "../src/lib/listen/preview-access";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function asState(result: ListenStatsTickResult): ListenStatsTickState {
  return {
    realListenedMs: result.realListenedMs,
    ratingEligibleAt: result.ratingEligibleAt,
    lastAudioItemId: result.lastAudioItemId,
    lastPositionMs: result.lastPositionMs,
    lastReportedAt: result.lastReportedAt,
    createdAt: result.createdAt,
  };
}

function playTicks(input: {
  startMs?: number;
  ticks: Array<{ positionMs: number; nowMs: number; audioItemId?: string }>;
  allowEligibility?: boolean;
  playbackRate?: number;
  audioItemId?: string;
}): ListenStatsTickResult {
  const audioItemId = input.audioItemId ?? "track-a";
  let state: ListenStatsTickState | null = null;
  let last: ListenStatsTickResult | null = null;
  const startMs = input.startMs ?? 0;

  last = evaluateListenStatsTick(null, {
    audioItemId,
    positionMs: startMs,
    nowMs: 0,
    allowEligibility: input.allowEligibility !== false,
    playbackRate: input.playbackRate ?? 1,
  });
  state = asState(last);

  for (const tick of input.ticks) {
    last = evaluateListenStatsTick(state, {
      audioItemId: tick.audioItemId ?? audioItemId,
      positionMs: tick.positionMs,
      nowMs: tick.nowMs,
      allowEligibility: input.allowEligibility !== false,
      playbackRate: input.playbackRate ?? 1,
    });
    state = asState(last);
  }

  assert.ok(last);
  return last;
}

function testConstants() {
  assert.equal(RATING_ELIGIBILITY_LISTEN_MS, 30_000);
  assert.equal(LISTEN_STATS_HEARTBEAT_MS, 5_000);
  assert.equal(LISTEN_STATS_MAX_PLAYBACK_RATE, 1.5);
  assert.equal(LISTEN_STATS_WALL_CLOCK_SLACK_MS, 0);
  assert.ok(LISTEN_STATS_SEEK_JUMP_MS > LISTEN_STATS_MAX_TICK_MS);

  const constants = read("src/lib/listen/listen-stats-constants.ts");
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const migration = read(
    "supabase/migrations/20260920120000_practice_listen_stats.sql",
  );
  assert.match(constants, /export const RATING_ELIGIBILITY_LISTEN_MS = 30_000/);
  assert.match(constants, /export const LISTEN_STATS_MAX_PLAYBACK_RATE = 1\.5/);
  assert.match(constants, /export const LISTEN_STATS_WALL_CLOCK_SLACK_MS = 0/);
  assert.doesNotMatch(constants, /LISTEN_STATS_BOOTSTRAP_MS/);
  assert.match(player, /const PLAYBACK_RATES = \[0\.75, 1, 1\.25, 1\.5\]/);
  assert.match(migration, /v_total >= 30000/);
  assert.match(migration, /v_delta <= 20000/);
  assert.match(migration, /LEAST\(v_accepted, 15000\)/);
  assert.match(migration, /v_max_rate numeric := 1\.5/);
  assert.match(migration, /v_lifetime_cap := FLOOR\(v_life_elapsed \* 1\.5\)/);
  assert.match(migration, /v_wall_cap := FLOOR\(v_elapsed \* v_max_rate\)/);
  assert.doesNotMatch(migration, /v_life_elapsed \* 2 \+ 8000/);
  assert.doesNotMatch(migration, /v_rate > 2/);
  assert.doesNotMatch(migration, /v_slack := 2000/);
  assert.doesNotMatch(migration, /practice_ratings|practice_rating_events/);
  assert.doesNotMatch(
    read("supabase/migrations/20260919120000_harden_practice_audio_progress_rls.sql"),
    /practice_listen_stats|real_listened_ms|rating_eligible/,
  );
}

function testAccumulateAcrossSessionsAndTracks() {
  const firstVisit = playTicks({
    ticks: [
      { positionMs: 5_000, nowMs: 5_000 },
      { positionMs: 10_000, nowMs: 10_000 },
      { positionMs: 15_000, nowMs: 15_000 },
    ],
  });
  assert.equal(firstVisit.realListenedMs, 15_000);
  assert.equal(firstVisit.ratingEligibleAt, null);

  const nextDay = evaluateListenStatsTick(
    {
      ...asState(firstVisit),
      lastReportedAt: new Date(firstVisit.lastReportedAt).toISOString(),
    },
    {
      audioItemId: "track-b",
      positionMs: 2_000,
      nowMs: 86_400_000,
      allowEligibility: true,
      playbackRate: 1,
    },
  );
  assert.equal(nextDay.acceptedMs, 0, "track change is +0 baseline");
  assert.equal(nextDay.realListenedMs, 15_000);

  const continueB = evaluateListenStatsTick(asState(nextDay), {
    audioItemId: "track-b",
    positionMs: 17_000,
    nowMs: 86_415_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  assert.equal(continueB.acceptedMs, 15_000);
  assert.equal(continueB.realListenedMs, 30_000);
  assert.ok(continueB.ratingEligibleAt, "eligible at ≥30s across sessions/tracks");

  const afterEligible = evaluateListenStatsTick(asState(continueB), {
    audioItemId: "track-b",
    positionMs: 22_000,
    nowMs: 86_420_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  assert.equal(afterEligible.realListenedMs, 35_000, "keep accumulating after 30s");
  assert.equal(afterEligible.ratingEligibleAt, continueB.ratingEligibleAt);
}

function testSeekPauseRewind() {
  const baseline = playTicks({
    ticks: [{ positionMs: 8_000, nowMs: 8_000 }],
  });
  assert.equal(baseline.realListenedMs, 8_000);

  const seek = evaluateListenStatsTick(asState(baseline), {
    audioItemId: "track-a",
    positionMs: 8_000 + LISTEN_STATS_SEEK_JUMP_MS + 1_000,
    nowMs: 9_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  assert.equal(seek.acceptedMs, 0, "seek jump +0");
  assert.equal(seek.realListenedMs, 8_000);
  assert.equal(seek.lastPositionMs, 8_000 + LISTEN_STATS_SEEK_JUMP_MS + 1_000);

  const afterSeek = evaluateListenStatsTick(asState(seek), {
    audioItemId: "track-a",
    positionMs: seek.lastPositionMs + 5_000,
    nowMs: 14_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  assert.equal(afterSeek.acceptedMs, 5_000, "continue after seek baseline");

  const paused = evaluateListenStatsTick(asState(afterSeek), {
    audioItemId: "track-a",
    positionMs: afterSeek.lastPositionMs,
    nowMs: 20_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  assert.equal(paused.acceptedMs, 0, "pause / frozen currentTime +0");
  assert.equal(paused.realListenedMs, afterSeek.realListenedMs);

  const rewind = evaluateListenStatsTick(asState(paused), {
    audioItemId: "track-a",
    positionMs: 3_000,
    nowMs: 21_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  assert.equal(rewind.acceptedMs, 0, "rewind jump +0");
  assert.equal(rewind.lastPositionMs, 3_000);

  const relisten = evaluateListenStatsTick(asState(rewind), {
    audioItemId: "track-a",
    positionMs: 8_000,
    nowMs: 26_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  assert.equal(relisten.acceptedMs, 5_000, "honest re-listen of same segment may count");
}

function testMediaTimeRates() {
  const atRate = (rate: number, mediaPerWallMs: number, walls: number) => {
    const ticks = [];
    for (let index = 1; index <= walls; index += 1) {
      ticks.push({
        positionMs: Math.round(index * mediaPerWallMs),
        nowMs: index * 5_000,
      });
    }
    return playTicks({ playbackRate: rate, ticks });
  };

  const oneX = atRate(1, 5_000, 6);
  assert.equal(oneX.realListenedMs, 30_000);
  assert.ok(oneX.ratingEligibleAt, "1.0× eligible at 30s media / 30s wall");

  const onePointFive = atRate(1.5, 7_500, 4);
  assert.equal(onePointFive.realListenedMs, 30_000);
  assert.ok(
    onePointFive.ratingEligibleAt,
    "1.5× eligible at 30s media / ~20s wall",
  );

  const threeQuarter = atRate(0.75, 3_750, 8);
  assert.equal(threeQuarter.realListenedMs, 30_000);
  assert.ok(
    threeQuarter.ratingEligibleAt,
    "0.75× eligible at 30s media / ~40s wall",
  );
}

function testAdversarialInflation() {
  const lifetimeCap = (wallMs: number) =>
    Math.floor(wallMs * LISTEN_STATS_MAX_PLAYBACK_RATE);

  for (const forgedRate of [2, 10, 100]) {
    const early = playTicks({
      playbackRate: forgedRate,
      ticks: [
        { positionMs: 7_500, nowMs: 5_000 },
        { positionMs: 15_000, nowMs: 10_000 },
      ],
    });
    assert.equal(
      early.realListenedMs,
      lifetimeCap(10_000),
      `forged rate ${forgedRate} at 10s wall must equal 1.5× budget`,
    );
    assert.equal(early.ratingEligibleAt, null);

    const forged = playTicks({
      playbackRate: forgedRate,
      ticks: [
        { positionMs: 7_500, nowMs: 5_000 },
        { positionMs: 15_000, nowMs: 10_000 },
        { positionMs: 22_500, nowMs: 15_000 },
        { positionMs: 30_000, nowMs: 20_000 },
      ],
    });
    assert.equal(forged.realListenedMs, 30_000);
    assert.ok(forged.ratingEligibleAt);
    assert.ok(
      forged.realListenedMs <= lifetimeCap(20_000),
      `forged rate ${forgedRate} must stay ≤ 1.5× wall`,
    );
  }

  const spamBeforeEligible = [];
  for (let index = 1; index <= 7; index += 1) {
    spamBeforeEligible.push({
      positionMs: index * 19_999,
      nowMs: index * 2_500,
    });
  }
  const spam = playTicks({ playbackRate: 100, ticks: spamBeforeEligible });
  assert.equal(
    spam.realListenedMs,
    lifetimeCap(17_500),
    "2.5s spam with forged forward positions cannot beat lifetime 1.5×",
  );
  assert.equal(spam.ratingEligibleAt, null, "spam at 17.5s wall is not eligible");

  const spamAtFloor = playTicks({
    playbackRate: 100,
    ticks: [
      ...spamBeforeEligible,
      { positionMs: 8 * 19_999, nowMs: 20_000 },
    ],
  });
  assert.equal(spamAtFloor.realListenedMs, lifetimeCap(20_000));
  assert.ok(
    spamAtFloor.ratingEligibleAt,
    "earliest spam eligibility is 20s wall, not sooner via slack",
  );

  const huge = playTicks({
    playbackRate: 100,
    ticks: [
      { positionMs: 60_000, nowMs: 1_000 },
      { positionMs: 120_000, nowMs: 2_000 },
    ],
  });
  assert.equal(huge.acceptedMs, 0, "huge forged seek is +0");
  assert.equal(huge.realListenedMs, 0);
  assert.equal(huge.ratingEligibleAt, null);

  const firstShot30 = evaluateListenStatsTick(null, {
    audioItemId: "track-a",
    positionMs: 30_000,
    nowMs: 0,
    allowEligibility: true,
    playbackRate: 100,
  });
  assert.equal(firstShot30.acceptedMs, 0);
  assert.equal(firstShot30.realListenedMs, 0);
  assert.equal(firstShot30.ratingEligibleAt, null);

  const firstShot60 = evaluateListenStatsTick(null, {
    audioItemId: "track-a",
    positionMs: 60_000,
    nowMs: 0,
    allowEligibility: true,
    playbackRate: 100,
  });
  assert.equal(firstShot60.acceptedMs, 0);
  assert.equal(firstShot60.realListenedMs, 0);
  assert.equal(firstShot60.ratingEligibleAt, null);

  const justUnder = playTicks({
    playbackRate: 100,
    ticks: [{ positionMs: 19_999, nowMs: 19_999 }],
  });
  assert.ok(
    justUnder.realListenedMs <= lifetimeCap(19_999),
    "cannot reach 30000 accepted media before 20000ms wall",
  );
  assert.ok(justUnder.realListenedMs < RATING_ELIGIBILITY_LISTEN_MS);
  assert.equal(justUnder.ratingEligibleAt, null);

  const earliest = playTicks({
    playbackRate: 1.5,
    ticks: [
      { positionMs: 7_500, nowMs: 5_000 },
      { positionMs: 15_000, nowMs: 10_000 },
      { positionMs: 22_500, nowMs: 15_000 },
      { positionMs: 30_000, nowMs: 20_000 },
    ],
  });
  assert.equal(earliest.realListenedMs, 30_000);
  assert.ok(earliest.ratingEligibleAt, "honest 1.5× becomes eligible at 20s wall");

  const tooEarlyAtMaxRate = playTicks({
    playbackRate: 1.5,
    ticks: [
      { positionMs: 7_500, nowMs: 5_000 },
      { positionMs: 15_000, nowMs: 10_000 },
      { positionMs: 22_500, nowMs: 15_000 },
      { positionMs: 29_999, nowMs: 19_999 },
    ],
  });
  assert.ok(tooEarlyAtMaxRate.realListenedMs < 30_000);
  assert.equal(tooEarlyAtMaxRate.ratingEligibleAt, null);
}

function testRaceNoDoubleNoLoss() {
  const baseline = playTicks({
    ticks: [{ positionMs: 10_000, nowMs: 10_000 }],
  });

  const first = evaluateListenStatsTick(asState(baseline), {
    audioItemId: "track-a",
    positionMs: 15_000,
    nowMs: 15_000,
    allowEligibility: true,
    playbackRate: 1,
  });
  const second = evaluateListenStatsTick(asState(first), {
    audioItemId: "track-a",
    positionMs: 16_000,
    nowMs: 15_100,
    allowEligibility: true,
    playbackRate: 1,
  });

  assert.equal(first.acceptedMs, 5_000);
  assert.ok(second.acceptedMs <= 1_000, "serialized second tick cannot double the 5s");
  assert.equal(second.realListenedMs, first.realListenedMs + second.acceptedMs);
  assert.ok(second.realListenedMs >= 15_000, "no loss of the first accepted 5s");
  assert.ok(second.realListenedMs < 21_000, "no artificial double of overlapping ticks");
}

function testAccessMatrix() {
  const preview = resolveListenApiDecision({
    purpose: "listen_stats",
    isCourse: false,
    courseAllowed: false,
    canListen: false,
    accessReason: "payment_required",
    catalogPreviewEligible: true,
    listenAccess: null,
  });
  assert.equal(preview.ok, false, "preview never accrues");
  assert.equal(
    canAccrueListenStats({
      userId: "user",
      access: { mode: "catalog_preview" },
      isCourse: false,
      productKind: "practice",
    }),
    false,
  );

  for (const reason of ["free", "purchased", "granted", "admin", "guest_promo"] as const) {
    const decision = resolveListenApiDecision({
      purpose: "listen_stats",
      isCourse: false,
      courseAllowed: false,
      canListen: true,
      accessReason: reason,
      catalogPreviewEligible: true,
      listenAccess: { mode: "entitled" },
    });
    assert.equal(decision.ok, true, `${reason} listen-stats allowed`);
    assert.equal(
      canAccrueListenStats({
        userId: "user",
        access: { mode: "entitled" },
        isCourse: false,
        productKind: "practice",
      }),
      true,
      `${reason} accrues`,
    );
    assert.equal(canBecomeRatingEligible({ mode: "entitled" }), true);
  }

  for (const kind of ["practice", "music", "audio_post"] as const) {
    assert.equal(
      canAccrueListenStats({
        userId: "user",
        access: { mode: "entitled" },
        isCourse: false,
        productKind: kind,
      }),
      true,
      `${kind} is a stage-1 listenable`,
    );
  }

  assert.equal(
    canAccrueListenStats({
      userId: "author",
      access: { mode: "author_preview" },
      isCourse: false,
      productKind: "practice",
    }),
    true,
    "author may accrue media-time",
  );
  assert.equal(
    canBecomeRatingEligible({ mode: "author_preview" }),
    false,
    "author owner is not rating-eligible",
  );

  const authorTick = playTicks({
    allowEligibility: false,
    ticks: [
      { positionMs: 10_000, nowMs: 10_000 },
      { positionMs: 20_000, nowMs: 20_000 },
      { positionMs: 30_000, nowMs: 30_000 },
    ],
  });
  assert.equal(authorTick.realListenedMs, 30_000);
  assert.equal(authorTick.ratingEligibleAt, null, "author never gets eligible_at");

  assert.equal(
    canAccrueListenStats({
      userId: null,
      access: { mode: "entitled" },
      isCourse: false,
      productKind: "practice",
    }),
    false,
    "anonymous cannot accrue",
  );

  assert.equal(
    canAccrueListenStats({
      userId: "user",
      access: { mode: "entitled" },
      isCourse: true,
      productKind: "practice",
    }),
    false,
    "course is stage-1 follow-up",
  );
  assert.equal(isCourseListenStatsFollowUp("course", "practice"), true);

  assert.equal(
    shouldReportListenStatsHeartbeat({
      isPrivateAudio: false,
      isPreviewMode: true,
      guestProgressMode: false,
      audioItemId: "track-a",
    }),
    false,
    "player skips preview heartbeat",
  );
  assert.equal(
    shouldReportListenStatsHeartbeat({
      isPrivateAudio: false,
      isPreviewMode: false,
      guestProgressMode: true,
      audioItemId: "track-a",
    }),
    false,
    "anonymous guest progress does not heartbeat",
  );
}

function testOwnStateShape() {
  assert.deepEqual(
    toListenStatsOwnState({ realListenedMs: 12_000, ratingEligibleAt: null }),
    {
      realListenedMs: 12_000,
      ratingEligible: false,
      ratingEligibleAt: null,
    },
  );
  assert.deepEqual(
    toListenStatsOwnState({
      realListenedMs: 30_000,
      ratingEligibleAt: "2026-09-20T00:00:00.000Z",
    }),
    {
      realListenedMs: 30_000,
      ratingEligible: true,
      ratingEligibleAt: "2026-09-20T00:00:00.000Z",
    },
  );
}

function testClientBodyDoesNotTrustDeltaAlone() {
  const body = buildListenStatsHeartbeatBody({
    audioItemId: "track-a",
    positionMs: 12_500.9,
    priorPositionMs: 7_000,
    playbackRate: 1.5,
  });
  assert.equal(body.audio_item_id, "track-a");
  assert.equal(body.position_ms, 12_500);
  assert.equal(body.prior_position_ms, 7_000);
  assert.equal(body.media_delta_ms, 5_500);
  assert.equal(body.playback_rate, 1.5);
  assert.equal("user_id" in body, false);
  assert.equal("practice_id" in body, false);
}

function testSourceContracts() {
  const migration = read(
    "supabase/migrations/20260920120000_practice_listen_stats.sql",
  );
  const progressHarden = read(
    "supabase/migrations/20260919120000_harden_practice_audio_progress_rls.sql",
  );
  const progressWrite = read("src/lib/listen/progress-write.ts");
  const progressRoute = read(
    "src/app/api/listen/product/[slug]/[productSlug]/progress/route.ts",
  );
  const listenStatsRoute = read("src/lib/listen/listen-stats-route.ts");
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const clipProduct = read(
    "src/app/api/listen/product/[slug]/[productSlug]/audio/[audioId]/clip/route.ts",
  );
  const clipServe = read("src/lib/listen/serve-preview-clip-response.ts");
  const previewAccess = read("src/lib/listen/preview-access.ts");
  const pageShared = read("src/lib/listen/page-shared.tsx");
  const sessionLoad = read("src/lib/listen/load-session-payload.ts");
  const database = read("docs/DATABASE.md");
  const preflight = read("src/lib/admin/test-user-reset/preflight.ts");
  const resetProgress = read("src/lib/listen/progress.ts");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.practice_listen_stats/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.practice_listen_stats TO authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.practice_listen_stats FROM authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.apply_practice_listen_stats_heartbeat/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.apply_practice_listen_stats_heartbeat/);
  assert.match(migration, /TO service_role/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);

  assert.doesNotMatch(progressHarden, /practice_listen_stats/);
  assert.doesNotMatch(progressWrite, /practice_listen_stats/);
  assert.doesNotMatch(progressRoute, /practice_listen_stats/);
  assert.doesNotMatch(resetProgress, /practice_listen_stats/);
  assert.match(resetProgress, /from\("practice_audio_progress"\)/);

  assert.match(listenStatsRoute, /purpose:\s*"listen_stats"/);
  assert.match(listenStatsRoute, /canAccrueListenStats/);
  assert.match(listenStatsRoute, /applyOwnPracticeListenStatsHeartbeat/);
  assert.doesNotMatch(listenStatsRoute, /body\.user_id/);
  assert.doesNotMatch(listenStatsRoute, /practice_ratings/);

  assert.match(player, /listen-stats/);
  assert.match(player, /LISTEN_STATS_HEARTBEAT_MS/);
  assert.match(player, /isPreviewModeRef\.current/);
  assert.doesNotMatch(player, /practice_listen_stats/);
  assert.doesNotMatch(player, /real_listened_ms/);

  assert.match(clipProduct, /serveListenPreviewClip/);
  assert.match(clipServe, /preview_audio/);
  assert.doesNotMatch(clipServe, /listen_stats|practice_listen_stats/);
  assert.match(previewAccess, /listen_stats/);
  assert.match(previewAccess, /or listen-stats accrual/);

  assert.match(pageShared, /getOwnPracticeListenStats/);
  assert.match(sessionLoad, /getOwnPracticeListenStats/);
  assert.match(sessionLoad, /listenStats/);
  assert.match(database, /practice_listen_stats \(trusted MEDIA-TIME/);
  assert.match(database, /practice_audio_progress \(resume cursor\)/);
  assert.match(database, /real_listened_ms <= floor\(\(now - created_at\) \* 1\.5\)/);
  assert.match(database, /Client `playback_rate` — только телеметрия/);
  assert.match(preflight, /"practice_listen_stats"/);

  const catalogPlayback = read("src/lib/catalog/catalog-playback-contract.ts");
  const playlistPreview = read("src/lib/playlists/public-content.ts");
  assert.match(catalogPlayback, /preview/);
  assert.match(playlistPreview, /preview/);
}

testConstants();
testAccumulateAcrossSessionsAndTracks();
testSeekPauseRewind();
testMediaTimeRates();
testAdversarialInflation();
testRaceNoDoubleNoLoss();
testAccessMatrix();
testOwnStateShape();
testClientBodyDoesNotTrustDeltaAlone();
testSourceContracts();

console.log("practice-listen-stats-unit: ok");
