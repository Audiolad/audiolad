#!/usr/bin/env node
/**
 * Canonical GlobalAudioPlayer playback analytics — contract + continuous-session
 * regression checks (H1 / H2 / H3). No DB, no network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveGlobalPlaybackAnalyticsTarget } from "../src/components/analytics/GlobalPlaybackAnalytics.tsx";
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
    /if \(!sessionId\)/,
    "H2: start is deferred until sessionId exists",
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
    tracker,
    /playStartedRef\.current = false/,
    "H3: track change clears sticky playStarted",
  );
  assert.match(
    tracker,
    /rememberContinuousListenPlayStarted/,
    "Repeat One stays deduped via continuous session",
  );
  assert.match(
    globalAnalytics,
    /session\.isAuthorPreview/,
    "author preview still skips analytics",
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
  assert.deepEqual(
    resolveGlobalPlaybackAnalyticsTarget(catalog, "/"),
    { practiceId: "prac-1", path: "/listen/ann/breath" },
    "fallback path uses listen URL when pathname is root",
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
    detailPath: "/cabinet/private/priv-1",
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
  assert.deepEqual(
    resolveGlobalPlaybackAnalyticsTarget(privateAudio, "/elsewhere"),
    { practiceId: "priv-1", path: "/cabinet/private/priv-1" },
    "private_audio uses detailPath + itemId",
  );
}

function testMultiTrackStartsAreIndependent() {
  resetContinuousListenSession();
  assert.equal(
    rememberContinuousListenPlayStarted("p", "A"),
    true,
    "first play of A emits start",
  );
  assert.equal(
    rememberContinuousListenPlayStarted("p", "B"),
    true,
    "auto-next / manual next to B emits a new start",
  );
  assert.equal(
    rememberContinuousListenPlayStarted("p", "A"),
    false,
    "returning to A in the same continuous session stays deduped",
  );
}

function testPauseResumeSameTrackNoSecondStart() {
  resetContinuousListenSession();
  assert.equal(rememberContinuousListenPlayStarted("p", "t1"), true);
  touchContinuousListenSessionActivity();
  assert.equal(
    rememberContinuousListenPlayStarted("p", "t1"),
    false,
    "pause/resume of the same track does not emit another start",
  );
}

function testRepeatOneLoopsDoNotEmitNewStart() {
  resetContinuousListenSession();
  assert.equal(rememberContinuousListenPlayStarted("p", "loop"), true);
  assert.equal(rememberContinuousListenCompleted("p", "loop"), true);
  for (let i = 0; i < 20; i += 1) {
    touchContinuousListenSessionActivity();
    assert.equal(
      rememberContinuousListenPlayStarted("p", "loop"),
      false,
      `Repeat One loop ${i + 1} must not emit a new start`,
    );
    assert.equal(
      rememberContinuousListenCompleted("p", "loop"),
      false,
      `Repeat One loop ${i + 1} must not emit a new completed`,
    );
  }
}

function testNoRetryOverloadInThisPr() {
  const tracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");
  const client = read("src/lib/analytics/client.ts");
  assert.doesNotMatch(
    tracker,
    /503|504|overloaded/,
    "this PR does not add 503/504/overload retry in the tracker",
  );
  // retry-queue may already exist historically; ensure we did not expand it here
  // by requiring the tracker itself stays free of overload retry wiring.
  void client;
}

testCanonicalMountContract();
testResolveTargetPaths();
testMultiTrackStartsAreIndependent();
testPauseResumeSameTrackNoSecondStart();
testRepeatOneLoopsDoNotEmitNewStart();
testNoRetryOverloadInThisPr();

console.log("playback-analytics-canonical-unit: ok");
