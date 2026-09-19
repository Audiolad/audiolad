#!/usr/bin/env node
/**
 * Canonical GlobalAudioPlayer playback analytics — contract + listening-context
 * regression checks (H1 / H2 / H3 / inactivity gap / private_audio / confirmed play).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveGlobalPlaybackAnalyticsTarget } from "../src/components/analytics/GlobalPlaybackAnalytics.tsx";
import { LISTENING_SESSION_GAP_MS } from "../src/lib/analytics/constants.ts";
import {
  clearPendingConfirmedPlay,
  createListenTrackerContextState,
  createPendingConfirmedPlaysStore,
  expireListenTrackerContextIfInactive,
  getPendingConfirmedPlaysStore,
  hasPendingConfirmedPlayForTrack,
  isListeningContextInactive,
  listPendingConfirmedPlays,
  noteListenTrackerPlayingActivity,
  notePendingConfirmedPlay,
  resetListenTrackerContextState,
  resetPendingConfirmedPlaysStoreForTests,
  shouldAttemptPlayStartedEmit,
  shouldRecordPendingConfirmedPlay,
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
  const sequential = read("src/components/audio/useSequentialPlayer.ts");

  assert.match(provider, /<GlobalPlaybackAnalytics/);
  assert.equal((provider.match(/<GlobalPlaybackAnalytics/g) ?? []).length, 1);
  assert.doesNotMatch(listenShared, /<ListenAnalyticsTracker/);
  assert.doesNotMatch(audioPost, /<ListenAnalyticsTracker/);
  assert.match(tracker, /subscribeCachedAnalyticsSessionId/);
  assert.match(tracker, /notePendingConfirmedPlay/);
  assert.match(
    read("src/lib/analytics/pending-confirmed-plays-store.ts"),
    /globalPendingConfirmedPlaysStore/,
    "pending store is process-stable (survives engine remount)",
  );
  assert.match(
    read("src/components/audio/GlobalAudioPlayerProvider.tsx"),
    /key=\{\`\$\{getGlobalPlayerSessionKey\(session\)\}:\$\{playbackInstanceId\}\`\}/,
    "engine remount key still uses sessionKey:playbackInstanceId",
  );
  assert.match(tracker, /entry\.path/);
  assert.doesNotMatch(tracker, /clearPending:\s*true/);
  assert.match(
    read("src/lib/analytics/pending-confirmed-plays-store.ts"),
    /listeningContextId/,
  );

  assert.match(tracker, /shouldRecordPendingConfirmedPlay/);
  assert.match(
    read("src/lib/analytics/pending-confirmed-plays-store.ts"),
    /PendingConfirmedPlay/,
  );
  assert.match(contextHelper, /lastActivityAt/);
  assert.match(client, /export function subscribeCachedAnalyticsSessionId/);
  assert.match(tracker, /trackedTrackIdRef/);
  assert.match(globalAnalytics, /isPrivateAudioSession\(session\)/);
  assert.doesNotMatch(tracker, /isListeningSessionExpired/);

  // Manual A→B: clear playing before track index change; restore only via playing/adopted.
  const switchStart = sequential.indexOf("const switchToTrack = useCallback(");
  const switchEnd = sequential.indexOf("const applyUrlAndPlayNow", switchStart);
  // switchToTrack is after applyUrlAndPlayNow in file — find by marker
  const switchBlock = sequential.slice(
    sequential.indexOf("const switchToTrack = useCallback("),
    sequential.indexOf("}, [", sequential.indexOf("const switchToTrack = useCallback(")) + 200,
  );
  assert.match(
    switchBlock,
    /setPlayingState\(false\)/,
    "switchToTrack clears isPlaying before audioItemId change",
  );
  assert.match(
    switchBlock,
    /setCurrentTrackIndex\(nextIndex\)/,
    "track index still updates in switchToTrack",
  );
  assert.ok(
    switchBlock.indexOf("setPlayingState(false)") <
      switchBlock.indexOf("setCurrentTrackIndex(nextIndex)"),
    "isPlaying cleared before currentTrackIndex changes",
  );

  const applyBlock = sequential.slice(
    sequential.indexOf("const applyUrlAndPlayNow = useCallback("),
    sequential.indexOf("const switchToTrack = useCallback("),
  );
  assert.match(
    applyBlock,
    /setPlayingState\(true\)/,
    "adopted already-playing handoff sets confirmed playing (iOS/prefetch)",
  );
  assert.match(
    sequential,
    /handlePlaying[\s\S]*setPlayingState\(true\)/,
    "HTMLMediaElement playing remains the confirmed path",
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
  );
  assert.equal(
    resolveGlobalPlaybackAnalyticsTarget(
      { ...catalog, isAuthorPreview: true },
      "/practice/ann/breath",
    ),
    null,
  );
  assert.equal(
    resolveGlobalPlaybackAnalyticsTarget(
      {
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
      },
      "/elsewhere",
    ),
    null,
  );
}

/**
 * One tracker-instance consumer over a given pending store (production-equivalent:
 * remount = new local sticky state, same stable store).
 */
function createTrackerInstance(store) {
  const state = createListenTrackerContextState();
  return { state, store };
}

function flushAndEmit(instance, opts) {
  const { state, store } = instance;
  const {
    practiceId,
    trackId,
    path,
    sessionId,
    isPlaying,
    now,
    emits,
  } = opts;

  if (!sessionId) {
    if (
      shouldRecordPendingConfirmedPlay({
        trackId,
        isPlaying,
        playStarted: state.playStarted,
        sessionId,
      })
    ) {
      notePendingConfirmedPlay(
        state,
        { practiceId, trackId, path, now },
        store,
      );
    }
    return;
  }

  for (const entry of listPendingConfirmedPlays(store)) {
    clearPendingConfirmedPlay(entry, store);
    if (
      rememberContinuousListenPlayStarted(
        entry.practiceId,
        entry.trackId,
        entry.confirmedAt,
      )
    ) {
      emits.push({
        practiceId: entry.practiceId,
        trackId: entry.trackId,
        path: entry.path,
        listeningContextId: entry.listeningContextId,
        at: now,
        flushedByInstance: opts.instanceLabel ?? "?",
      });
    }
    if (entry.practiceId === practiceId && entry.trackId === trackId) {
      state.playStarted = true;
      state.listeningStartedAt = entry.listeningContextId;
    }
  }

  if (
    shouldAttemptPlayStartedEmit({
      trackId,
      practiceId,
      isPlaying,
      playStarted: state.playStarted,
      sessionId,
      hasPendingForCurrentTrack: hasPendingConfirmedPlayForTrack(
        practiceId,
        trackId,
        store,
      ),
    })
  ) {
    state.playStarted = true;
    if (!state.listeningStartedAt) state.listeningStartedAt = now;
    noteListenTrackerPlayingActivity(state, now);
    if (rememberContinuousListenPlayStarted(practiceId, trackId, now)) {
      emits.push({
        practiceId,
        trackId,
        path,
        listeningContextId: state.listeningStartedAt,
        at: now,
        flushedByInstance: opts.instanceLabel ?? "?",
      });
    }
  }
}

/**
 * Simulate steps. Optional remount: { kind:"remount" } discards local sticky
 * state and creates a fresh tracker instance over the SAME stable store.
 */
function simulateConfirmedPlayPipeline(steps, options = {}) {
  resetContinuousListenSession();
  resetPendingConfirmedPlaysStoreForTests();
  const store = options.store ?? getPendingConfirmedPlaysStore();
  if (options.store) {
    // isolated store for remount tests — also wipe global to avoid bleed
    resetPendingConfirmedPlaysStoreForTests();
  } else {
    store.clearAll();
  }

  let instance = createTrackerInstance(store);
  let instanceLabel = "A";
  const emits = [];
  let practiceId = "p";
  let trackId = "A";
  let path = "/practice/author/a";
  let sessionId = null;
  let isPlaying = false;

  for (const step of steps) {
    const now = step.at;

    if (step.kind === "remount") {
      // Production: GlobalPlayerEngine key change unmounts tracker A, mounts B.
      instance = createTrackerInstance(store);
      instanceLabel = step.instanceLabel ?? "B";
      if (step.practiceId) practiceId = step.practiceId;
      if (step.trackId) trackId = step.trackId;
      if (step.path) path = step.path;
      if ("isPlaying" in step) isPlaying = step.isPlaying;
      continue;
    }

    if (step.practiceId) practiceId = step.practiceId;
    if (step.path) path = step.path;
    if (step.trackId && step.trackId !== trackId) {
      resetListenTrackerContextState(instance.state);
      trackId = step.trackId;
    }
    if ("sessionId" in step) sessionId = step.sessionId;
    if ("isPlaying" in step) isPlaying = step.isPlaying;

    if (step.programCompleted) {
      resetListenTrackerContextState(instance.state);
    }

    if (step.kind === "playing_tick" && isPlaying) {
      noteListenTrackerPlayingActivity(instance.state, now);
      touchContinuousListenSessionActivity(now);
    }

    if (step.kind === "edge" || step.kind === "playing_tick") {
      expireListenTrackerContextIfInactive(
        instance.state,
        now,
        LISTENING_SESSION_GAP_MS,
      );
      flushAndEmit(instance, {
        practiceId,
        trackId,
        path,
        sessionId,
        isPlaying,
        now,
        emits,
        instanceLabel,
      });
    }
  }

  return { emits, store, instance };
}

function testH2PendingConfirmedPlaySurvivesPauseBeforeSession() {
  const t0 = 10_000_000;
  const { emits } = simulateConfirmedPlayPipeline([
    { kind: "edge", at: t0, trackId: "A", sessionId: null, isPlaying: true },
    { kind: "playing_tick", at: t0 + 200, isPlaying: true },
    { kind: "edge", at: t0 + 800, isPlaying: false },
    { kind: "edge", at: t0 + 1200, sessionId: "sess-1", isPlaying: false },
  ]);
  assert.deepEqual(emits.map((e) => e.trackId), ["A"]);
}

function testCompletedBeforeSession() {
  const t0 = 11_000_000;
  const { emits } = simulateConfirmedPlayPipeline([
    {
      kind: "edge",
      at: t0,
      trackId: "A",
      path: "/practice/author/a",
      sessionId: null,
      isPlaying: true,
    },
    { kind: "playing_tick", at: t0 + 100, isPlaying: true },
    { kind: "edge", at: t0 + 500, isPlaying: false, programCompleted: true },
    { kind: "edge", at: t0 + 900, sessionId: "sess-complete", isPlaying: false },
  ]);
  assert.equal(emits.length, 1);
  assert.equal(emits[0].trackId, "A");
  assert.equal(emits[0].path, "/practice/author/a");
  console.log("regression completed-before-session: ok");
}

function testOriginalPathPreserved() {
  const t0 = 12_000_000;
  const { emits } = simulateConfirmedPlayPipeline([
    {
      kind: "edge",
      at: t0,
      trackId: "A-track",
      practiceId: "A",
      path: "/practice/author/a",
      sessionId: null,
      isPlaying: true,
    },
    { kind: "edge", at: t0 + 200, isPlaying: false },
    {
      kind: "edge",
      at: t0 + 400,
      trackId: "B-track",
      practiceId: "B",
      path: "/practice/author/b",
      isPlaying: false,
    },
    {
      kind: "edge",
      at: t0 + 800,
      sessionId: "sess-path",
      isPlaying: false,
      path: "/practice/author/b",
    },
  ]);
  assert.equal(emits.length, 1);
  assert.equal(emits[0].practiceId, "A");
  assert.equal(emits[0].trackId, "A-track");
  assert.equal(emits[0].path, "/practice/author/a");
  console.log("regression original-path-preserved: ok");
}

function testPendingSurvivesEngineRemountBeforeSession() {
  const store = createPendingConfirmedPlaysStore();
  const t0 = 12_500_000;
  const { emits } = simulateConfirmedPlayPipeline(
    [
      // Engine instance A
      {
        kind: "edge",
        at: t0,
        practiceId: "A",
        trackId: "A-track",
        path: "/practice/author/a",
        sessionId: null,
        isPlaying: true,
      },
      { kind: "playing_tick", at: t0 + 100, isPlaying: true },
      { kind: "edge", at: t0 + 200, isPlaying: false },
      // GlobalPlayerEngine remount (session key / playbackInstanceId) — local state gone
      {
        kind: "remount",
        at: t0 + 300,
        practiceId: "B",
        trackId: "B-track",
        path: "/practice/author/b",
        isPlaying: false,
        instanceLabel: "B",
      },
      // Session arrives on the NEW instance — must flush pending A from stable store
      {
        kind: "edge",
        at: t0 + 500,
        sessionId: "sess-remount",
        isPlaying: false,
        path: "/practice/author/b",
      },
    ],
    { store },
  );

  assert.equal(emits.length, 1, "pending A survives actual engine remount");
  assert.equal(emits[0].practiceId, "A");
  assert.equal(emits[0].trackId, "A-track");
  assert.equal(emits[0].path, "/practice/author/a");
  assert.equal(emits[0].flushedByInstance, "B");
  console.log("regression pending-survives-engine-remount: ok");
}

function testPendingSurvivesPlaylistQueueCrossProductRemount() {
  const store = createPendingConfirmedPlaysStore();
  const t0 = 12_700_000;
  const { emits } = simulateConfirmedPlayPipeline(
    [
      {
        kind: "edge",
        at: t0,
        practiceId: "queue-A",
        trackId: "qa-1",
        path: "/listen/author/product-a",
        sessionId: null,
        isPlaying: true,
      },
      { kind: "edge", at: t0 + 150, isPlaying: false },
      // Playlist queue cross-product advance remounts engine
      {
        kind: "remount",
        at: t0 + 200,
        practiceId: "queue-B",
        trackId: "qb-1",
        path: "/listen/author/product-b",
        isPlaying: false,
        instanceLabel: "queue-B",
      },
      {
        kind: "edge",
        at: t0 + 400,
        sessionId: "sess-queue",
        isPlaying: false,
      },
    ],
    { store },
  );

  assert.equal(emits.length, 1);
  assert.equal(emits[0].practiceId, "queue-A");
  assert.equal(emits[0].trackId, "qa-1");
  assert.equal(emits[0].path, "/listen/author/product-a");
  console.log("regression pending-survives-playlist-queue-remount: ok");
}

function testSameTrackTwoContextsBeforeSession() {
  const t0 = 13_000_000;
  const { emits } = simulateConfirmedPlayPipeline([
    {
      kind: "edge",
      at: t0,
      trackId: "A",
      path: "/practice/author/a",
      sessionId: null,
      isPlaying: true,
    },
    { kind: "playing_tick", at: t0 + 1_000, isPlaying: true },
    { kind: "edge", at: t0 + 2_000, isPlaying: false },
    {
      kind: "edge",
      at: t0 + 2_000 + LISTENING_SESSION_GAP_MS + 1_000,
      isPlaying: true,
      sessionId: null,
    },
    {
      kind: "playing_tick",
      at: t0 + 2_000 + LISTENING_SESSION_GAP_MS + 2_000,
      isPlaying: true,
    },
    {
      kind: "edge",
      at: t0 + 2_000 + LISTENING_SESSION_GAP_MS + 3_000,
      isPlaying: false,
    },
    {
      kind: "edge",
      at: t0 + 2_000 + LISTENING_SESSION_GAP_MS + 4_000,
      sessionId: "sess-two",
      isPlaying: false,
    },
  ]);
  assert.equal(emits.length, 2);
  assert.notEqual(emits[0].listeningContextId, emits[1].listeningContextId);
  console.log("regression same-track-two-contexts-before-session: ok");
}

function testH2PendingANotAttributedToB() {
  const t0 = 20_000_000;
  const { emits } = simulateConfirmedPlayPipeline([
    { kind: "edge", at: t0, trackId: "A", sessionId: null, isPlaying: true },
    { kind: "edge", at: t0 + 300, isPlaying: false },
    { kind: "edge", at: t0 + 400, trackId: "B", isPlaying: false },
    { kind: "edge", at: t0 + 900, sessionId: "sess-2", isPlaying: false },
  ]);
  assert.deepEqual(emits.map((e) => e.trackId), ["A"]);
}

function testManualSwitchClearsPlayingBeforeStartB() {
  // Model: after switch, isPlaying must be false until confirmed playing B.
  const t0 = 30_000_000;
  const failB = simulateConfirmedPlayPipeline([
    { kind: "edge", at: t0, trackId: "A", sessionId: "sess", isPlaying: true },
    // Switch: playing cleared, track B, load/play FAIL → stays not playing
    { kind: "edge", at: t0 + 100, trackId: "B", isPlaying: false },
  ]);
  assert.deepEqual(
    failB.emits.map((e) => e.trackId),
    ["A"],
    "manual Next B with play FAIL → start B = 0",
  );

  const okB = simulateConfirmedPlayPipeline([
    { kind: "edge", at: t0, trackId: "A", sessionId: "sess", isPlaying: true },
    { kind: "edge", at: t0 + 100, trackId: "B", isPlaying: false },
    // Confirmed playing B
    { kind: "edge", at: t0 + 250, trackId: "B", isPlaying: true },
  ]);
  assert.deepEqual(
    okB.emits.map((e) => e.trackId),
    ["A", "B"],
    "manual Next B with confirmed playing → start B = 1",
  );

  const selectC = simulateConfirmedPlayPipeline([
    { kind: "edge", at: t0, trackId: "A", sessionId: "sess", isPlaying: true },
    { kind: "edge", at: t0 + 100, trackId: "C", isPlaying: false },
    { kind: "edge", at: t0 + 200, trackId: "C", isPlaying: true },
  ]);
  assert.deepEqual(
    selectC.emits.map((e) => e.trackId),
    ["A", "C"],
    "manual Select C with confirmed playing → start C = 1",
  );
}

function testAutoNextStillEmitsForNewTrack() {
  const t0 = 40_000_000;
  const { emits } = simulateConfirmedPlayPipeline([
    { kind: "edge", at: t0, trackId: "A", sessionId: "sess", isPlaying: true },
    // auto-next: brief not-playing then confirmed playing B
    { kind: "edge", at: t0 + 50, trackId: "B", isPlaying: false },
    { kind: "edge", at: t0 + 80, trackId: "B", isPlaying: true },
  ]);
  assert.deepEqual(emits.map((e) => e.trackId), ["A", "B"]);
}

function testAdoptedHandoffStillCountsAsConfirmedPlaying() {
  // Source contract: applyUrlAndPlayNow sets playing true when already playing.
  const sequential = read("src/components/audio/useSequentialPlayer.ts");
  const applyBlock = sequential.slice(
    sequential.indexOf("const applyUrlAndPlayNow = useCallback("),
    sequential.indexOf("const switchToTrack = useCallback("),
  );
  assert.match(applyBlock, /isAdoptedAudioAlreadyPlaying/);
  assert.match(applyBlock, /setPlayingState\(true\)/);
}

function testLongPlayShortPauseResumeNoSecondStart() {
  const t0 = 1_000_000;
  const steps = [
    { kind: "edge", at: t0, trackId: "t1", sessionId: "sess", isPlaying: true },
  ];
  for (let minute = 1; minute <= 6; minute += 1) {
    steps.push({ kind: "playing_tick", at: t0 + minute * 60_000, isPlaying: true });
  }
  steps.push({ kind: "edge", at: t0 + 6 * 60_000 + 1_000, isPlaying: false });
  steps.push({ kind: "edge", at: t0 + 6 * 60_000 + 3_000, isPlaying: true });
  const { emits, instance } = simulateConfirmedPlayPipeline(steps);
  assert.equal(emits.length, 1);
  assert.equal(instance.state.playStarted, true);
  assert.equal(
    isListeningContextInactive(
      instance.state.lastActivityAt,
      t0 + 6 * 60_000 + 3_000,
      LISTENING_SESSION_GAP_MS,
    ),
    false,
  );
}

function testLongPauseOpensNewListeningContext() {
  const t0 = 2_000_000;
  const { emits } = simulateConfirmedPlayPipeline([
    { kind: "edge", at: t0, trackId: "t1", sessionId: "sess", isPlaying: true },
    { kind: "playing_tick", at: t0 + 10_000, isPlaying: true },
    { kind: "edge", at: t0 + 11_000, isPlaying: false },
    {
      kind: "edge",
      at: t0 + 11_000 + LISTENING_SESSION_GAP_MS + 1_000,
      isPlaying: true,
    },
  ]);
  assert.equal(emits.length, 2);
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

function testTrackChangeResetsLocalContextKeepsPending() {
  resetPendingConfirmedPlaysStoreForTests();
  const store = getPendingConfirmedPlaysStore();
  const state = createListenTrackerContextState();
  notePendingConfirmedPlay(
    state,
    { practiceId: "p", trackId: "A", path: "/practice/author/a", now: 100 },
    store,
  );
  state.playStarted = true;
  resetListenTrackerContextState(state);
  assert.equal(state.playStarted, false);
  assert.equal(listPendingConfirmedPlays(store).length, 1);
  assert.equal(listPendingConfirmedPlays(store)[0].trackId, "A");
  assert.equal(listPendingConfirmedPlays(store)[0].path, "/practice/author/a");
}

function testShortPauseResumeDoesNotDuplicatePending() {
  resetPendingConfirmedPlaysStoreForTests();
  const store = getPendingConfirmedPlaysStore();
  const state = createListenTrackerContextState();
  notePendingConfirmedPlay(
    state,
    { practiceId: "p", trackId: "A", path: "/p/a", now: 1000 },
    store,
  );
  noteListenTrackerPlayingActivity(state, 1500);
  notePendingConfirmedPlay(
    state,
    { practiceId: "p", trackId: "A", path: "/p/a", now: 2000 },
    store,
  );
  assert.equal(listPendingConfirmedPlays(store).length, 1);
}

function testNoRetryOverloadInThisPr() {
  const tracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");
  assert.doesNotMatch(tracker, /503|504|overloaded/);
}

function testCiWiring() {
  const pkg = JSON.parse(read("package.json"));
  assert.match(
    pkg.scripts["test:platform-analytics-p2"] ?? "",
    /playback-analytics-canonical-unit/,
  );
  const workflow = read(".github/workflows/pr-repository-validation.yml");
  assert.match(workflow, /test:platform-analytics-p2/);
}

testCanonicalMountContract();
testResolveTargetPaths();
testH2PendingConfirmedPlaySurvivesPauseBeforeSession();
testCompletedBeforeSession();
testOriginalPathPreserved();
testPendingSurvivesEngineRemountBeforeSession();
testPendingSurvivesPlaylistQueueCrossProductRemount();
testSameTrackTwoContextsBeforeSession();
testH2PendingANotAttributedToB();
testManualSwitchClearsPlayingBeforeStartB();
testAutoNextStillEmitsForNewTrack();
testAdoptedHandoffStillCountsAsConfirmedPlaying();
testLongPlayShortPauseResumeNoSecondStart();
testLongPauseOpensNewListeningContext();
testMultiTrackStartsAreIndependent();
testPauseResumeSameTrackNoSecondStart();
testRepeatOneLoopsDoNotEmitNewStart();
testTrackChangeResetsLocalContextKeepsPending();
testShortPauseResumeDoesNotDuplicatePending();
testNoRetryOverloadInThisPr();
testCiWiring();

console.log("playback-analytics-canonical-unit: ok");
