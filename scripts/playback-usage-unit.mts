#!/usr/bin/env node
/**
 * Trusted playback usage: MEDIA-TIME acceptance, listening context, idempotent
 * client payload, admin formatting, and SQL/source contracts.
 * No database. Live SQL apply is a deploy step and is not run here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LISTENING_SESSION_GAP_MS } from "../src/lib/analytics/constants";
import {
  nextPlaybackUsageSampleSeq,
  publishAnalyticsListeningKey,
  resetPlaybackListeningContextForTests,
  resolvePlaybackUsageListeningKey,
} from "../src/lib/analytics/listening-context-store";
import {
  effectiveListeningFrom,
  formatAverageListening,
  formatListeningDuration,
  formatListeningTimeNotice,
  listenedMsToChartMinutes,
  listeningAverageLabels,
} from "../src/lib/admin/format-listening-time";
import {
  buildListenStatsHeartbeatBody,
  createPlaybackUsageEventId,
  shouldReportListenStatsHeartbeat,
  shouldReportPlaybackUsageHeartbeat,
} from "../src/lib/listen/listen-stats-client";
import {
  applyPlaybackUsageSample,
  evaluatePlaybackUsageTick,
  PLAYBACK_USAGE_IMPOSSIBLE_ABS_MS,
  PLAYBACK_USAGE_MAX_RATE,
  type PlaybackUsageContextState,
  type PlaybackUsagePhase,
  type PlaybackUsageState,
  type PlaybackUsageTickResult,
} from "../src/lib/listen/playback-usage";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

type Sample = {
  positionMs: number;
  nowMs: number;
  phase?: PlaybackUsagePhase;
  audioItemId?: string;
  clientMediaDeltaMs?: number | null;
};

function asState(result: PlaybackUsageTickResult): PlaybackUsageState {
  return {
    audioItemId: result.audioItemId,
    lastPositionMs: result.lastPositionMs,
    lastReportedAtMs: result.lastReportedAtMs,
    createdAtMs: result.createdAtMs,
    acceptedListenedMs: result.acceptedListenedMs,
  };
}

function play(samples: Sample[], audioItemId = "track-a"): {
  acceptedMs: number;
  reasons: Array<string | null>;
} {
  let state: PlaybackUsageState | null = null;
  const reasons: Array<string | null> = [];
  let acceptedMs = 0;

  for (const sample of samples) {
    const result = evaluatePlaybackUsageTick(state, {
      audioItemId: sample.audioItemId ?? audioItemId,
      positionMs: sample.positionMs,
      nowMs: sample.nowMs,
      phase: sample.phase ?? "advance",
      clientMediaDeltaMs: sample.clientMediaDeltaMs,
    });
    acceptedMs += result.acceptedMs;
    reasons.push(result.rejectedReason);
    state = asState(result);
  }

  return { acceptedMs, reasons };
}

function ticks(fromMs: number, toMs: number, stepMs: number): Sample[] {
  const samples: Sample[] = [];
  for (let cursor = fromMs; cursor <= toMs; cursor += stepMs) {
    samples.push({ positionMs: cursor, nowMs: cursor });
  }
  return samples;
}

type ControlledRow = {
  scenario: string;
  manuallyPlayedMs: number;
  recordedMs: number;
  deltaMs: number;
  expectedTechnicalError: string;
};

const controlled: ControlledRow[] = [];

function expectRecorded(input: {
  scenario: string;
  manuallyPlayedMs: number;
  samples: Sample[];
  expectedMs: number;
  expectedTechnicalError: string;
}) {
  const result = play(input.samples);
  assert.equal(
    result.acceptedMs,
    input.expectedMs,
    `${input.scenario}: recorded ${result.acceptedMs}, expected ${input.expectedMs}`,
  );
  controlled.push({
    scenario: input.scenario,
    manuallyPlayedMs: input.manuallyPlayedMs,
    recordedMs: result.acceptedMs,
    deltaMs: result.acceptedMs - input.manuallyPlayedMs,
    expectedTechnicalError: input.expectedTechnicalError,
  });
  return result;
}

function testAcceptance() {
  assert.equal(PLAYBACK_USAGE_MAX_RATE, 1.5);
  assert.equal(PLAYBACK_USAGE_IMPOSSIBLE_ABS_MS, 2_000);

  expectRecorded({
    scenario: "continuous 30s at 1x, 5s heartbeats",
    manuallyPlayedMs: 30_000,
    samples: ticks(0, 30_000, 5_000),
    expectedMs: 30_000,
    expectedTechnicalError:
      "0 when the first sample is position 0. The opening sample is a +0 baseline; the next tick credits that interval.",
  });

  expectRecorded({
    scenario: "continuous play whose first sample is already at 800ms",
    manuallyPlayedMs: 30_000,
    samples: ticks(800, 30_800, 5_000),
    expectedMs: 30_000,
    expectedTechnicalError:
      "The prefix before the first heartbeat is not credited (here 800ms). The player flushes once when playback starts, so this prefix is typically under 1s.",
  });

  expectRecorded({
    scenario: "play 5s then pause at 7.2s",
    manuallyPlayedMs: 7_200,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 5_000, nowMs: 5_000 },
      { positionMs: 7_200, nowMs: 7_200, phase: "pause" },
    ],
    expectedMs: 7_200,
    expectedTechnicalError:
      "0. Pause finalizes the honest tail. A lost pause flush under-counts by at most about one 5s interval.",
  });

  expectRecorded({
    scenario: "pause then resume inside the same context",
    manuallyPlayedMs: 12_000,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 5_000, nowMs: 5_000 },
      { positionMs: 7_000, nowMs: 7_000, phase: "pause" },
      { positionMs: 7_000, nowMs: 8_000, phase: "advance" },
      { positionMs: 12_000, nowMs: 13_000 },
    ],
    expectedMs: 12_000,
    expectedTechnicalError: "0. Frozen currentTime during pause is +0 and is not double-counted on resume.",
  });

  expectRecorded({
    scenario: "seek forward after 30s",
    manuallyPlayedMs: 30_000,
    samples: [
      ...ticks(0, 30_000, 5_000),
      { positionMs: 90_000, nowMs: 30_100, phase: "seek" },
    ],
    expectedMs: 30_000,
    expectedTechnicalError: "0 relative to honest listening. The seek jump is +0 and becomes the new baseline.",
  });

  expectRecorded({
    scenario: "0–30s, seek back to 10s, re-listen 10s",
    manuallyPlayedMs: 40_000,
    samples: [
      ...ticks(0, 30_000, 5_000),
      { positionMs: 10_000, nowMs: 30_050, phase: "seek" },
      { positionMs: 15_000, nowMs: 35_050 },
      { positionMs: 20_000, nowMs: 40_050 },
    ],
    expectedMs: 40_000,
    expectedTechnicalError:
      "0. Re-played media after seek-back counts again. 30s + 10s = 40s.",
  });

  expectRecorded({
    scenario: "track change after 10s, then 5s of the next item",
    manuallyPlayedMs: 15_000,
    samples: [
      ...ticks(0, 10_000, 5_000),
      { positionMs: 0, nowMs: 10_020, phase: "track_change", audioItemId: "track-b" },
      { positionMs: 5_000, nowMs: 15_020, audioItemId: "track-b" },
    ],
    expectedMs: 15_000,
    expectedTechnicalError: "0. Track change is +0. The new item starts from its own baseline.",
  });

  expectRecorded({
    scenario: "ended flush credits the tail",
    manuallyPlayedMs: 8_000,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 5_000, nowMs: 5_000 },
      { positionMs: 8_000, nowMs: 8_000, phase: "ended" },
    ],
    expectedMs: 8_000,
    expectedTechnicalError: "0 when the ended flush arrives. A dropped ended event leaves at most the last open interval.",
  });

  const impossible = expectRecorded({
    scenario: "120s position jump inside a 5s tick",
    manuallyPlayedMs: 0,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 120_000, nowMs: 5_000 },
    ],
    expectedMs: 0,
    expectedTechnicalError:
      "Impossible catch-up is rejected (+0) and the new position becomes the baseline. It is not capped into listened time.",
  });
  assert.deepEqual(impossible.reasons, ["baseline", "impossible"]);

  expectRecorded({
    scenario: "claimed 2x advance on a 5s tick",
    manuallyPlayedMs: 10_000,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 10_000, nowMs: 5_000 },
    ],
    expectedMs: 7_500,
    expectedTechnicalError:
      "Recorded time is capped at wall × 1.5 (7500ms). Client playback_rate cannot raise that cap. Delta −2500ms is the security ceiling, not a clock error.",
  });

  expectRecorded({
    scenario: "0.5x for 10s",
    manuallyPlayedMs: 5_000,
    samples: ticks(0, 10_000, 5_000).map((sample, index) =>
      index === 0 ? sample : { ...sample, positionMs: sample.positionMs / 2 },
    ),
    expectedMs: 5_000,
    expectedTechnicalError: "0. Slower than 1x is credited from currentTime, not from wall-clock.",
  });

  expectRecorded({
    scenario: "1.5x for 10s",
    manuallyPlayedMs: 15_000,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 7_500, nowMs: 5_000 },
      { positionMs: 15_000, nowMs: 10_000 },
    ],
    expectedMs: 15_000,
    expectedTechnicalError: "0. Legal platform speed 1.5× is accepted in full.",
  });

  expectRecorded({
    scenario: "lock-screen 10min at 1x, one late heartbeat",
    manuallyPlayedMs: 600_000,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 600_000, nowMs: 600_000 },
    ],
    expectedMs: 600_000,
    expectedTechnicalError:
      "0 when currentTime, the same context, and wall×1.5 agree. Wall-clock is only the ceiling. The rating path still zeros a gap over 20s; this usage path does not.",
  });

  expectRecorded({
    scenario: "fake 2h catch-up after 10min wall",
    manuallyPlayedMs: 0,
    samples: [
      { positionMs: 0, nowMs: 0 },
      { positionMs: 7_200_000, nowMs: 600_000 },
    ],
    expectedMs: 0,
    expectedTechnicalError: "Rejected. A jump beyond wall×1.5+2s and twice the wall cap is not listening time.",
  });

  const tightened = play([
    { positionMs: 0, nowMs: 0 },
    { positionMs: 5_000, nowMs: 5_000, clientMediaDeltaMs: 1_000 },
  ]);
  assert.equal(tightened.acceptedMs, 1_000);

  const notRaised = play([
    { positionMs: 0, nowMs: 0 },
    { positionMs: 1_000, nowMs: 5_000, clientMediaDeltaMs: 9_000 },
  ]);
  assert.equal(notRaised.acceptedMs, 1_000);

  const resume = play([
    { positionMs: 45_000, nowMs: 0 },
    { positionMs: 50_000, nowMs: 5_000 },
  ]);
  assert.equal(resume.acceptedMs, 5_000);
  assert.equal(resume.reasons[0], "baseline");

  const negative = play([
    { positionMs: 0, nowMs: 0 },
    { positionMs: 4_000, nowMs: 5_000 },
    { positionMs: 1_000, nowMs: 6_000 },
  ]);
  assert.equal(negative.acceptedMs, 4_000);
  assert.equal(negative.reasons[2], "non_positive");
}

function testListeningContext() {
  resetPlaybackListeningContextForTests();
  assert.equal(LISTENING_SESSION_GAP_MS, 5 * 60 * 1000);

  const practiceId = "practice-1";
  const audioItemId = "audio-1";
  publishAnalyticsListeningKey({
    practiceId,
    audioItemId,
    startedAt: 1_000,
    listeningKey: `${practiceId}:${audioItemId}:1000`,
  });

  const adopted = resolvePlaybackUsageListeningKey({
    practiceId,
    audioItemId,
    now: 2_000,
    isPlaying: true,
  });
  assert.equal(adopted, `${practiceId}:${audioItemId}:1000`);

  const stillPlaying = resolvePlaybackUsageListeningKey({
    practiceId,
    audioItemId,
    now: 2_000 + 20 * 60 * 1000,
    isPlaying: true,
  });
  assert.equal(stillPlaying, adopted);

  const afterShortPause = resolvePlaybackUsageListeningKey({
    practiceId,
    audioItemId,
    now: 2_000 + 20 * 60 * 1000 + 60_000,
    isPlaying: false,
  });
  assert.equal(afterShortPause, adopted);

  const afterLongPause = resolvePlaybackUsageListeningKey({
    practiceId,
    audioItemId,
    now: 2_000 + 20 * 60 * 1000 + LISTENING_SESSION_GAP_MS + 1,
    isPlaying: false,
  });
  assert.notEqual(afterLongPause, adopted);
  assert.match(afterLongPause, /^practice-1:audio-1:\d+$/);

  const otherTrack = resolvePlaybackUsageListeningKey({
    practiceId,
    audioItemId: "audio-2",
    now: 3_000,
    isPlaying: true,
  });
  assert.match(otherTrack, /^practice-1:audio-2:\d+$/);
  assert.notEqual(otherTrack, adopted);

  resetPlaybackListeningContextForTests();
  publishAnalyticsListeningKey({
    practiceId: "other",
    audioItemId,
    startedAt: 1_000,
    listeningKey: `other:${audioItemId}:1000`,
  });
  const fresh = resolvePlaybackUsageListeningKey({
    practiceId,
    audioItemId,
    now: 1_500,
    isPlaying: true,
  });
  assert.equal(fresh, `${practiceId}:${audioItemId}:1500`);
  resetPlaybackListeningContextForTests();
}

function testClientPayload() {
  assert.equal(
    shouldReportPlaybackUsageHeartbeat({
      isPrivateAudio: false,
      audioItemId: "11111111-1111-4111-8111-111111111111",
    }),
    true,
  );
  assert.equal(
    shouldReportPlaybackUsageHeartbeat({
      isPrivateAudio: true,
      audioItemId: "11111111-1111-4111-8111-111111111111",
    }),
    false,
  );
  assert.equal(
    shouldReportPlaybackUsageHeartbeat({
      isPrivateAudio: false,
      audioItemId: "legacy-1",
    }),
    false,
  );
  assert.equal(
    shouldReportListenStatsHeartbeat({
      isPrivateAudio: false,
      isPreviewMode: true,
      guestProgressMode: false,
      audioItemId: "11111111-1111-4111-8111-111111111111",
      isAuthenticated: false,
    }),
    false,
  );
  assert.equal(
    shouldReportListenStatsHeartbeat({
      isPrivateAudio: false,
      isPreviewMode: false,
      guestProgressMode: true,
      audioItemId: "11111111-1111-4111-8111-111111111111",
      isAuthenticated: false,
    }),
    false,
  );

  const eventId = createPlaybackUsageEventId();
  assert.match(
    eventId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  const practiceId = "22222222-2222-4222-8222-222222222222";
  const audioItemId = "33333333-3333-4333-8333-333333333333";
  const sessionId = "44444444-4444-4444-8444-444444444444";
  resetPlaybackListeningContextForTests();
  const body = buildListenStatsHeartbeatBody({
    audioItemId,
    positionMs: 5_000.9,
    priorPositionMs: 0,
    playbackRate: 1.5,
    practiceId,
    phase: "advance",
    clientEventId: eventId,
    listeningKey: `${practiceId}:${audioItemId}:10`,
    sampleSeq: 3,
    sessionId,
    isPlaying: true,
  });
  const retry = buildListenStatsHeartbeatBody({
    audioItemId,
    positionMs: 5_000.9,
    priorPositionMs: 0,
    playbackRate: 1.5,
    practiceId,
    phase: "advance",
    clientEventId: eventId,
    listeningKey: `${practiceId}:${audioItemId}:10`,
    sampleSeq: 3,
    sessionId,
    isPlaying: true,
  });
  assert.equal(body.client_event_id, eventId);
  assert.equal(body.sample_seq, 3);
  assert.deepEqual(body, retry);
  assert.equal(body.listening_key, `${practiceId}:${audioItemId}:10`);
  assert.equal(body.playback_phase, "advance");
  assert.equal(body.analytics_session_id, sessionId);
  assert.equal(body.position_ms, 5_000);
  assert.equal(body.media_delta_ms, 5_000);

  const legacy = buildListenStatsHeartbeatBody({
    audioItemId,
    positionMs: 1_000,
    priorPositionMs: 0,
  });
  assert.equal("client_event_id" in legacy, false);
  assert.equal("listening_key" in legacy, false);
  assert.equal("playback_phase" in legacy, false);

  const withoutSeq = buildListenStatsHeartbeatBody({
    audioItemId,
    positionMs: 1_000,
    practiceId,
    clientEventId: eventId,
    phase: "pause",
  });
  assert.equal("sample_seq" in withoutSeq, false);
  assert.equal("client_event_id" in withoutSeq, false);

  resetPlaybackListeningContextForTests();
  const key = `${practiceId}:${audioItemId}:10`;
  assert.equal(nextPlaybackUsageSampleSeq(key), 1);
  assert.equal(nextPlaybackUsageSampleSeq(key), 2);
  assert.equal(nextPlaybackUsageSampleSeq(`${practiceId}:${audioItemId}:11`), 1);
  resetPlaybackListeningContextForTests();

  const client = read("src/lib/listen/listen-stats-client.ts");
  assert.match(client, /const clientEventId = createPlaybackUsageEventId\(\)/);
  assert.match(client, /return postListenStats\(url, payload, false\)/);
  assert.match(client, /Same client_event_id on the single retry/);
  assert.match(client, /nextPlaybackUsageSampleSeq\(listeningKey\)/);
}

function deliver(
  state: PlaybackUsageContextState | null,
  facts: Map<string, number>,
  input: {
    clientEventId: string;
    sampleSeq: number;
    positionMs: number;
    nowMs: number;
    phase?: PlaybackUsagePhase;
    audioItemId?: string;
  },
) {
  const result = applyPlaybackUsageSample(state, facts, {
    audioItemId: input.audioItemId ?? "track-a",
    positionMs: input.positionMs,
    nowMs: input.nowMs,
    phase: input.phase ?? "advance",
    sampleSeq: input.sampleSeq,
    clientEventId: input.clientEventId,
  });
  if (result.storeFact) {
    facts.set(input.clientEventId, result.acceptedMs);
  }
  return result;
}

function factSum(facts: Map<string, number>): number {
  let total = 0;
  for (const value of facts.values()) {
    total += value;
  }
  return total;
}

function testOutOfOrder() {
  const facts = new Map<string, number>();
  let state: PlaybackUsageContextState | null = null;

  const seq2 = deliver(state, facts, {
    clientEventId: "event-2",
    sampleSeq: 2,
    positionMs: 15_000,
    nowMs: 0,
  });
  assert.equal(seq2.acceptedMs, 0);
  assert.equal(seq2.storeFact, false);
  assert.equal(seq2.state?.lastPositionMs, 15_000);
  assert.equal(seq2.state?.lastSampleSeq, 2);
  state = seq2.state;

  const late = deliver(state, facts, {
    clientEventId: "event-1",
    sampleSeq: 1,
    positionMs: 10_000,
    nowMs: 1_000,
  });
  assert.equal(late.stale, true);
  assert.equal(late.acceptedMs, 0);
  assert.equal(late.storeFact, false);
  assert.equal(late.state, state);
  assert.equal(late.state?.lastPositionMs, 15_000);
  assert.equal(late.state?.lastReportedAtMs, 0);
  assert.equal(late.state?.audioItemId, "track-a");
  assert.equal(late.state?.acceptedListenedMs, 0);
  assert.equal(late.state?.lastSampleSeq, 2);

  const seq3 = deliver(state, facts, {
    clientEventId: "event-3",
    sampleSeq: 3,
    positionMs: 20_000,
    nowMs: 5_000,
  });
  assert.equal(seq3.acceptedMs, 5_000);
  assert.equal(seq3.storeFact, true);
  state = seq3.state;
  assert.equal(factSum(facts), 5_000);

  const retry = deliver(state, facts, {
    clientEventId: "event-3",
    sampleSeq: 3,
    positionMs: 20_000,
    nowMs: 5_000,
  });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.acceptedMs, 5_000);
  assert.equal(retry.storeFact, false);
  assert.equal(factSum(facts), 5_000);

  for (const phase of ["seek", "pause", "ended", "track_change"] as const) {
    const before = state;
    const sample = deliver(state, facts, {
      clientEventId: `event-${phase}`,
      sampleSeq: (state?.lastSampleSeq ?? 0) + 1,
      positionMs: phase === "track_change" ? 0 : 20_000,
      nowMs: 6_000,
      phase,
      audioItemId: phase === "track_change" ? "track-b" : "track-a",
    });
    assert.equal(sample.stale, false);
    assert.equal(sample.storeFact, false);
    assert.equal(sample.state?.lastSampleSeq, (before?.lastSampleSeq ?? 0) + 1);
    state = sample.state;
  }
  assert.equal(factSum(facts), 5_000);
}

function testFormatting() {
  assert.equal(formatListeningDuration(142 * 3_600_000 + 37 * 60_000), "142 ч 37 мин");
  assert.equal(formatListeningDuration(21 * 60_000 + 12_000), "21 мин 12 сек");
  assert.equal(formatListeningDuration(6 * 60_000 + 43_000), "6 мин 43 сек");
  assert.equal(formatAverageListening(1_272_000, 1), "21 мин 12 сек");
  assert.equal(formatAverageListening(403_000, 1), "6 мин 43 сек");
  assert.equal(formatAverageListening(30_000, 0), "—");
  assert.equal(formatAverageListening(0, 4), "—");
  assert.equal(listenedMsToChartMinutes(120_000), 2);
  const notice = formatListeningTimeNotice("2026-11-26T09:00:00.000Z");
  assert.match(notice, /^Время прослушивания собирается с /);
  assert.match(notice, /26/);
  assert.match(notice, /ноября/);
  assert.match(notice, /2026/);

  const validFrom = "2026-09-01T00:00:00.000Z";
  assert.equal(effectiveListeningFrom("2026-01-01T00:00:00.000Z", validFrom), validFrom);
  assert.equal(effectiveListeningFrom(null, validFrom), validFrom);
  assert.equal(
    effectiveListeningFrom("2026-10-01T00:00:00.000Z", validFrom),
    "2026-10-01T00:00:00.000Z",
  );
  const measured = listeningAverageLabels(10_000, 1, 2);
  const fullPeriod = listeningAverageLabels(10_000, 4, 8);
  assert.equal(measured.perListener, formatListeningDuration(10_000));
  assert.equal(measured.perStart, formatListeningDuration(5_000));
  assert.notEqual(measured.perListener, fullPeriod.perListener);
  assert.notEqual(measured.perStart, fullPeriod.perStart);
  assert.equal(listeningAverageLabels(null, 4, 8).perListener, "—");
}

function testSourceContracts() {
  const migration = read("supabase/migrations/20261127120000_playback_usage_facts.sql");
  const rating = read("supabase/migrations/20260920120000_practice_listen_stats.sql");
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const route = read("src/lib/listen/listen-stats-route.ts");
  const queries = read("src/lib/admin/analytics-queries.ts");
  const funnel = read("src/components/admin/AdminAnalyticsFunnelPanel.tsx");
  const chart = read("src/components/admin/AdminAnalyticsTimeseriesChart.tsx");
  const breakdown = read("src/components/admin/AdminAnalyticsBreakdownPanel.tsx");
  const dictionary = read("src/lib/admin/analytics-metrics-dictionary.ts");
  const tracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.playback_usage_facts/);
  assert.match(migration, /UNIQUE \(client_event_id\)/);
  assert.match(migration, /p_sample_seq <= v_row\.last_sample_seq/);
  assert.match(migration, /IF v_accepted > 0 THEN/);
  assert.match(migration, /CHECK \(listened_ms > 0\)/);
  assert.match(migration, /last_sample_seq bigint NOT NULL DEFAULT 0/);
  const factsDdl = migration.slice(
    migration.indexOf("CREATE TABLE IF NOT EXISTS public.playback_usage_facts"),
    migration.indexOf("COMMENT ON TABLE public.playback_usage_facts"),
  );
  assert.doesNotMatch(factsDdl, /ON DELETE CASCADE/);
  assert.doesNotMatch(factsDdl, /REFERENCES public\.practices/);
  assert.doesNotMatch(factsDdl, /REFERENCES public\.audio_items/);
  assert.doesNotMatch(factsDdl, /REFERENCES public\.authors/);
  assert.match(factsDdl, /ON DELETE SET NULL/);
  assert.match(factsDdl, /practice_id uuid NOT NULL/);
  assert.match(factsDdl, /author_id_snapshot uuid NULL/);
  assert.match(migration, /listening_time_valid_from timestamptz NOT NULL/);
  assert.match(migration, /v_wall_cap := FLOOR\(v_elapsed_ms \* 1\.5\)/);
  assert.match(migration, /v_candidate > v_wall_cap \+ 2000 AND v_candidate > v_wall_cap \* 2/);
  assert.match(migration, /business_account_id uuid NULL/);
  assert.match(migration, /venue_id uuid NULL/);
  assert.match(migration, /royalty_eligible_ms bigint NULL/);
  assert.match(migration, /billing_period_start date NULL/);
  assert.match(migration, /author_id_snapshot uuid NULL/);
  assert.match(migration, /WHEN unique_violation THEN/);
  assert.match(migration, /GRANT ALL ON TABLE public\.playback_usage_facts TO service_role/);
  assert.match(migration, /LEFT JOIN public\.practices AS pr ON pr\.id = f\.practice_id/);
  assert.match(migration, /coalesce\(f\.author_id_snapshot, pr\.author_id\)/);
  assert.equal(
    migration.includes("\n  JOIN public.practices AS pr ON pr.id = f.practice_id"),
    false,
  );
  assert.match(migration, /measured_listeners/);
  assert.match(migration, /measured_play_starts/);
  assert.match(migration, /v_effective_from := v_valid_from/);
  assert.match(migration, /Удалённая практика/);
  assert.match(migration, /WHEN 'listened_ms' THEN ps\.listened_ms::numeric/);
  assert.match(migration, /audiolad:platform-analytics:p2/);
  assert.doesNotMatch(migration, /UPDATE public\.practice_listen_stats/);
  assert.doesNotMatch(migration, /apply_practice_listen_stats_heartbeat/);
  assert.doesNotMatch(migration, /royalty_eligible_ms\s*=/);
  assert.match(rating, /v_delta <= 20000/);
  assert.match(rating, /v_total >= 30000/);

  assert.match(player, /LISTEN_STATS_HEARTBEAT_MS/);
  assert.match(player, /addEventListener\("seeking", handleSeeking\)/);
  assert.match(player, /addEventListener\("seeked", handleSeeked\)/);
  assert.match(player, /phase: "pause"/);
  assert.match(player, /phase: "ended"/);
  assert.match(player, /phase: "seek"/);
  assert.match(player, /visibilityState === "hidden"/);
  assert.match(player, /pagehide/);
  assert.match(player, /shouldReportListenStatsHeartbeat/);
  assert.match(player, /shouldReportPlaybackUsageHeartbeat/);
  const seekingAt = player.indexOf("const handleSeeking");
  const flagAt = player.indexOf("usageSeekingRef.current = true", seekingAt);
  const honestFlushAt = player.indexOf('phase: "advance"', seekingAt);
  assert.ok(seekingAt > 0 && honestFlushAt > seekingAt && flagAt > honestFlushAt);

  assert.match(route, /canAccrueListenStats/);
  assert.match(route, /ratingEligible: false/);
  assert.match(route, /status: 401/);
  assert.match(route, /applyPlaybackUsageHeartbeat/);
  assert.match(route, /applyOwnPracticeListenStatsHeartbeat/);
  assert.match(tracker, /publishAnalyticsListeningKey/);

  assert.match(funnel, /Время прослушивания/);
  assert.match(funnel, /Среднее время на слушателя/);
  assert.match(funnel, /Среднее время на запуск/);
  assert.match(chart, /Время прослушивания/);
  assert.match(chart, /formatListeningDuration/);
  assert.match(chart, /minutes == null/);
  assert.match(breakdown, /Топ практик по времени прослушивания/);
  assert.match(breakdown, /listened_ms/);
  assert.match(queries, /measured_listeners/);
  assert.match(queries, /measured_play_starts/);
  assert.match(queries, /listeningAverageLabels/);
  assert.doesNotMatch(queries, /presentListeningTime\(\s*[^,]+,\s*overviewBase\.listeners/);
  assert.match(queries, /admin_analytics_listening_time/);
  assert.match(queries, /admin_analytics_listening_time_timeseries/);
  assert.match(queries, /rawMs == null \? null : asNonNegativeInt\(rawMs\)/);
  assert.match(dictionary, /listening_time/);
  assert.match(dictionary, /avg_listen_per_listener/);
  assert.match(dictionary, /avg_listen_per_start/);
  assert.doesNotMatch(dictionary, /average listen share|доля прослушивания/i);
}

function printControlledTable() {
  const header = "scenario | manually played ms | system recorded ms | delta ms";
  console.log(header);
  for (const row of controlled) {
    console.log(
      `${row.scenario} | ${row.manuallyPlayedMs} | ${row.recordedMs} | ${row.deltaMs}`,
    );
  }
}

testAcceptance();
testListeningContext();
testClientPayload();
testOutOfOrder();
testFormatting();
testSourceContracts();
printControlledTable();
console.log("playback-usage-unit: ok");
