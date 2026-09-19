#!/usr/bin/env node
/**
 * Canonical GlobalAudioPlayer playback analytics — contract + listening-context
 * regression checks (H1 / H2 / H3 / inactivity gap / private_audio). No DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveGlobalPlaybackAnalyticsTarget } from "../src/components/analytics/GlobalPlaybackAnalytics.tsx";
import { LISTENING_SESSION_GAP_MS } from "../src/lib/analytics/constants.ts";
import {
  createListenTrackerContextState,
  expireListenTrackerContextIfInactive,
  isListeningContextInactive,
  noteListenTrackerPlayingActivity,
  resetListenTrackerContextState,
  shouldAttemptPlayStartedEmit,
} from "../src/lib/analytics/listen-tracker-context.ts";
import {
  rememberContinuousListenCompleted,
  rememberContinuousListenPlayStarted,
  resetContinuousListenSession,
  touchContinuousListenSessionActivity,
} from "../src/lib/listen/repeat-analytics.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function testCanonicalMountContract() {
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  const listenShared = read("src/components/audio/listen-player-shared.tsx");
  const audioPost = read(
    "src/components/products/audio-post/AudioPostListenAnalytics.tsx",
  );
  const tracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");
  const client = read("src/lib/analytics/client.ts");
  const globalAnalytics = read(
    "src/components/analytics/GlobalPlaybackAnalytics.tsx",
  );
  const contextHelper = read("src/lib/analytics/listen-tracker-context.ts");

  assert.match(
    provider,
    /<GlobalPlaybackAnalytics/,
    "H1: GlobalPlayerEngine mounts canonical GlobalPlaybackAnalytics",
  );
  assert.equal(
    (provider.match(/<GlobalPlaybackAnalytics/g) ?? []).length,
    1,
    "H1: exactly one canonical analytics mount in the global player",
  );
  assert.doesNotMatch(
    listenShared,
    /<ListenAnalyticsTracker/,
    "H1: /listen fullscreen must not double-emit via local tracker",
  );
  assert.doesNotMatch(
    audioPost,
    /<ListenAnalyticsTracker/,
    "H1: audio_post must not double-emit via local tracker",
  );
  assert.match(
    tracker,
    /subscribeCachedAnalyticsSessionId/,
    "H2: tracker subscribes to analytics session cache",
  );
  assert.match(
    tracker,
    /expireListenTrackerContextIfInactive/,
    "inactivity gap uses last playing activity, not listen age",
  );
  assert.match(
    client,
    /export function subscribeCachedAnalyticsSessionId/,
    "H2: client exposes session-cache subscription",
  );
  assert.match(
    tracker,
    /trackedTrackIdRef/,
    "H3: tracker tracks previous audioItemId for A→B reset",
  );
  assert.match(
    contextHelper,
    /lastActivityAt/,
    "listening context tracks last playing activity",
  );
  assert.match(
    globalAnalytics,
    /isPrivateAudioSession\(session\)/,
    "private_audio is explicitly gated",
  );
  assert.match(
    globalAnalytics,
    /return null/,
    "private_audio resolve returns null (excluded from platform KPI)",
  );
  assert.doesNotMatch(
    tracker,
    /isListeningSessionExpired/,
    "tracker no longer expires by age-since-start",
  );
}

function testResolveTargetPaths() {
  const catalog = {
    practiceId: "prac-1",
    authorSlug: "ann",
    productSlug: "breath",
    practiceTitle: "t",
    authorName: "a",
    format: null,
    tracks: [],
    initialProgress: [],
    coverSymbol: "✦",
    coverGradient: "from-a",
    coverImageUrl: null,
    isAuthorPreview: false,
  };

  assert.deepEqual(
    resolveGlobalPlaybackAnalyticsTarget(catalog, "/practice/ann/breath"),
    { practiceId: "prac-1", path: "/practice/ann/breath" },
    "/practice play attributes to the live practice path",
  );
  assert.deepEqual(
    resolveGlobalPlaybackAnalyticsTarget(catalog, "/listen/ann/breath"),
    { practiceId: "prac-1", path: "/listen/ann/breath" },
    "/listen play attributes to the listen path",
  );
  assert.equal(
    resolveGlobalPlaybackAnalyticsTarget(
      { ...catalog, isAuthorPreview: true },
      "/practice/ann/breath",
    ),
    null,
    "author preview emits nothing",
  );

  const privateAudio = {
    sourceType: "private_audio",
    itemId: "priv-1",
    detailPath: "/my-library/private-audio/priv-1",
    authorText: null,
    practiceTitle: "t",
    authorName: "a",
    format: null,
    tracks: [],
    initialProgress: [],
    coverSymbol: "✦",
    coverGradient: "from-a",
    coverImageUrl: null,
    isAuthorPreview: false,
  };
  assert.equal(
    resolveGlobalPlaybackAnalyticsTarget(privateAudio, "/elsewhere"),
    null,
    "private_audio is excluded so itemId cannot become a null practice_id KPI event",
  );
}

/**
 * Simulate tracker-state decisions the React component makes around play_started.
 * Returns how many times an emit would be attempted after continuous dedupe.
 */
function simulatePlayStartedAttempts(steps) {
  resetContinuousListenSession();
  const state = createListenTrackerContextState();
  const practiceId = "p";
  const trackId = "t1";
  let emits = 0;

  for (const step of steps) {
    const now = step.at;

    if (step.kind === "playing_tick") {
      noteListenTrackerPlayingActivity(state, now);
      touchContinuousListenSessionActivity(now);
      continue;
    }

    if (step.kind === "pause_or_resume_edge") {
      expireListenTrackerContextIfInactive(
        state,
        now,
        LISTENING_SESSION_GAP_MS,
      );

      if (
        !shouldAttemptPlayStartedEmit({
          trackId,
          isPlaying: step.isPlaying,
          playStarted: state.playStarted,
          sessionId: "sess",
        })
      ) {
        continue;
      }

      state.playStarted = true;
      if (!state.listeningStartedAt) {
        state.listeningStartedAt = now;
      }
      noteListenTrackerPlayingActivity(state, now);

      if (rememberContinuousListenPlayStarted(practiceId, trackId, now)) {
        emits += 1;
      }
    }
  }

  return { emits, state };
}

function testLongPlayShortPauseResumeNoSecondStart() {
  const t0 = 1_000_000;
  const steps = [
    { kind: "pause_or_resume_edge", at: t0, isPlaying: true },
  ];

  // >5 minutes of active listening (activity ticks every minute).
  for (let minute = 1; minute <= 6; minute += 1) {
    steps.push({
      kind: "playing_tick",
      at: t0 + minute * 60_000,
    });
  }

  const pauseAt = t0 + 6 * 60_000 + 1_000;
  steps.push({ kind: "pause_or_resume_edge", at: pauseAt, isPlaying: false });

  const resumeAt = pauseAt + 2_000;
  steps.push({ kind: "pause_or_resume_edge", at: resumeAt, isPlaying: true });

  const { emits, state } = simulatePlayStartedAttempts(steps);

  assert.equal(
    emits,
    1,
    "Play → >5min active listen → short pause → resume must not emit a second start",
  );
  assert.equal(state.playStarted, true, "same listening context stays sticky");
  assert.equal(
    isListeningContextInactive(state.lastActivityAt, resumeAt, LISTENING_SESSION_GAP_MS),
    false,
    "2s pause after long play is not an inactivity gap",
  );
}

function testLongPauseOpensNewListeningContext() {
  const t0 = 2_000_000;
  const steps = [
    { kind: "pause_or_resume_edge", at: t0, isPlaying: true },
    { kind: "playing_tick", at: t0 + 10_000 },
    { kind: "pause_or_resume_edge", at: t0 + 11_000, isPlaying: false },
    // Pause longer than LISTENING_SESSION_GAP_MS → new listening context.
    {
      kind: "pause_or_resume_edge",
      at: t0 + 11_000 + LISTENING_SESSION_GAP_MS + 1_000,
      isPlaying: true,
    },
  ];

  const { emits } = simulatePlayStartedAttempts(steps);

  assert.equal(
    emits,
    2,
    "Pause longer than the inactivity gap is a new listening context → new start allowed",
  );
}

function testAgeSinceStartAloneDoesNotExpire() {
  const state = createListenTrackerContextState();
  const startedAt = 3_000_000;
  state.playStarted = true;
  state.listeningStartedAt = startedAt;
  // Activity was recent (1s ago) even though listen started > gap ago.
  state.lastActivityAt = startedAt + LISTENING_SESSION_GAP_MS + 60_000;

  const now = state.lastActivityAt + 1_000;
  const expired = expireListenTrackerContextIfInactive(
    state,
    now,
    LISTENING_SESSION_GAP_MS,
  );

  assert.equal(
    expired,
    false,
    "age since first start must not expire a still-active listening context",
  );
  assert.equal(state.playStarted, true);
}

function testMultiTrackStartsAreIndependent() {
  resetContinuousListenSession();
  assert.equal(rememberContinuousListenPlayStarted("p", "A"), true);
  assert.equal(rememberContinuousListenPlayStarted("p", "B"), true);
  assert.equal(rememberContinuousListenPlayStarted("p", "A"), false);
}

function testPauseResumeSameTrackNoSecondStart() {
  resetContinuousListenSession();
  assert.equal(rememberContinuousListenPlayStarted("p", "t1"), true);
  touchContinuousListenSessionActivity();
  assert.equal(rememberContinuousListenPlayStarted("p", "t1"), false);
}

function testRepeatOneLoopsDoNotEmitNewStart() {
  resetContinuousListenSession();
  assert.equal(rememberContinuousListenPlayStarted("p", "loop"), true);
  assert.equal(rememberContinuousListenCompleted("p", "loop"), true);
  for (let i = 0; i < 20; i += 1) {
    touchContinuousListenSessionActivity();
    assert.equal(rememberContinuousListenPlayStarted("p", "loop"), false);
    assert.equal(rememberContinuousListenCompleted("p", "loop"), false);
  }
}

function testTrackChangeResetsLocalContext() {
  const state = createListenTrackerContextState();
  state.playStarted = true;
  state.listeningStartedAt = 100;
  state.listeningSessionKey = "p:A:100";
  state.lastActivityAt = 150;
  resetListenTrackerContextState(state);
  assert.equal(state.playStarted, false);
  assert.equal(state.lastActivityAt, null);
}

function testNoRetryOverloadInThisPr() {
  const tracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");
  assert.doesNotMatch(tracker, /503|504|overloaded/);
}

function testCiWiring() {
  const pkg = JSON.parse(read("package.json"));
  const p2 = pkg.scripts["test:platform-analytics-p2"] ?? "";
  assert.match(
    p2,
    /playback-analytics-canonical-unit/,
    "canonical playback unit must run via test:platform-analytics-p2 (PR CI)",
  );
  const workflow = read(".github/workflows/pr-repository-validation.yml");
  assert.match(
    workflow,
    /test:platform-analytics-p2/,
    "PR Repository Validation already invokes platform-analytics-p2",
  );
}

testCanonicalMountContract();
testResolveTargetPaths();
testLongPlayShortPauseResumeNoSecondStart();
testLongPauseOpensNewListeningContext();
testAgeSinceStartAloneDoesNotExpire();
testMultiTrackStartsAreIndependent();
testPauseResumeSameTrackNoSecondStart();
testRepeatOneLoopsDoNotEmitNewStart();
testTrackChangeResetsLocalContext();
testNoRetryOverloadInThisPr();
testCiWiring();

console.log("playback-analytics-canonical-unit: ok");
