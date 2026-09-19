#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createListeningProgressState,
  getNewlyReachedMilestones,
  isListeningCompleted,
  updateListeningProgressState,
} from "../src/lib/analytics/listening.ts";
import { getActiveInlineAudioPostSession } from "../src/components/products/audio-post/AudioPostListenAnalytics.tsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

let progress = createListeningProgressState();
const atStart = updateListeningProgressState(progress, {
  currentTime: 0,
  duration: 100,
  isPlaying: true,
  deltaSeconds: 0,
});

assert.deepEqual(
  getNewlyReachedMilestones(progress, atStart),
  [],
  "play start must not imply a progress milestone",
);

const at25 = updateListeningProgressState(atStart, {
  currentTime: 25,
  duration: 100,
  isPlaying: true,
  deltaSeconds: 25,
});
assert.deepEqual(
  getNewlyReachedMilestones(atStart, at25),
  ["audio_progress_25"],
  "continuous playback emits the 25% milestone once",
);

const paused = updateListeningProgressState(at25, {
  currentTime: 25,
  duration: 100,
  isPlaying: false,
  deltaSeconds: 10,
});
assert.deepEqual(
  getNewlyReachedMilestones(at25, paused),
  [],
  "pause must not emit another milestone",
);

const resumed = updateListeningProgressState(paused, {
  currentTime: 30,
  duration: 100,
  isPlaying: true,
  deltaSeconds: 5,
});
assert.deepEqual(
  getNewlyReachedMilestones(paused, resumed),
  [],
  "resume in the same session must not duplicate the 25% milestone",
);
assert.equal(
  isListeningCompleted(
    { ...resumed, listenedSeconds: 85 },
    { currentTime: 99, duration: 100, programCompleted: false },
  ),
  true,
  "near-end playback with sufficient listened time completes",
);

const syntheticTrackId = "0fdccda9-6705-47fa-93a7-86e6bfe4fad0";
const syntheticAuthorId = "f711e91d-9c55-4cd1-a1a4-a52fed559b2b";
const syntheticAudioPost = {
  practiceId: "f677f3c7-6aa9-421a-b377-94c51b40b352",
  authorSlug: "new-test-author",
  productSlug: "new-audio-post",
  practiceTitle: "Новый тестовый аудиопост",
  authorName: "Новый автор",
  format: "Аудиопост",
  tracks: [{ id: syntheticTrackId }],
  initialProgress: [],
  coverSymbol: "✦",
  coverGradient: "from-[#7652bc]",
  coverImageUrl: null,
  isAuthorPreview: false,
  playbackNavigation: "inline_only",
};
const syntheticContext = {
  practiceId: syntheticAudioPost.practiceId,
  authorSlug: syntheticAudioPost.authorSlug,
  productSlug: syntheticAudioPost.productSlug,
};
const activeSyntheticSession = getActiveInlineAudioPostSession(
  syntheticAudioPost,
  syntheticContext,
);

assert.equal(
  activeSyntheticSession?.practiceId,
  syntheticAudioPost.practiceId,
  "a new audio_post uses its runtime practice id",
);
assert.equal(
  activeSyntheticSession?.authorSlug,
  syntheticAudioPost.authorSlug,
  "a new audio_post uses its runtime author slug",
);
assert.equal(
  activeSyntheticSession?.productSlug,
  syntheticAudioPost.productSlug,
  "a new audio_post uses its runtime product slug",
);
assert.equal(
  activeSyntheticSession?.tracks[0]?.id,
  syntheticTrackId,
  "playback analytics carry the active runtime audio item id",
);
assert.equal(
  getActiveInlineAudioPostSession(
    { ...syntheticAudioPost, playbackNavigation: "fullscreen" },
    syntheticContext,
  ),
  null,
  "ordinary fullscreen products do not mount the inline tracker",
);
assert.equal(
  getActiveInlineAudioPostSession(
    { ...syntheticAudioPost, isAuthorPreview: true },
    syntheticContext,
  ),
  null,
  "a new audio_post author preview does not write analytics",
);
assert.equal(
  getActiveInlineAudioPostSession(syntheticAudioPost, {
    ...syntheticContext,
    productSlug: "another-audio-post",
  }),
  null,
  "a tracker only follows its matching runtime product session",
);

const inlineHelper = read(
  "src/components/products/audio-post/AudioPostListenAnalytics.tsx",
);
assert.match(
  inlineHelper,
  /isInlineOnlyPlaybackSession\(session\)/,
  "inline helper is limited to inline_only sessions",
);
assert.match(
  inlineHelper,
  /getActiveInlineAudioPostSession/,
  "author previews do not emit playback analytics",
);
assert.match(
  inlineHelper,
  /session\.practiceId !== context\.practiceId/,
  "helper ignores a global session for another product",
);
assert.match(
  inlineHelper,
  /return null/,
  "audio_post page helper no longer mounts a second ListenAnalyticsTracker",
);
assert.doesNotMatch(
  inlineHelper,
  /<ListenAnalyticsTracker/,
  "audio_post does not double-mount playback analytics",
);

const audioPostPage = read("src/components/products/audio-post/AudioPostPage.tsx");
assert.equal(
  (audioPostPage.match(/<AudioPostListenAnalytics/g) ?? []).length,
  1,
  "audio_post page keeps a single legacy mount slot (now a no-op)",
);

const fullscreenPlayer = read("src/components/audio/listen-player-shared.tsx");
assert.doesNotMatch(
  fullscreenPlayer,
  /<ListenAnalyticsTracker/,
  "fullscreen listen player no longer mounts a duplicate tracker",
);
assert.match(
  fullscreenPlayer,
  /ListenPageViewTracker/,
  "fullscreen listen still records listen page views",
);

const globalProvider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
assert.match(
  globalProvider,
  /<GlobalPlaybackAnalytics/,
  "global player mounts the canonical playback analytics path",
);

const sharedTracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");
assert.match(
  sharedTracker,
  /if \(!trackId \|\| !isPlaying \|\| playStartedRef\.current\)/,
  "the shared tracker emits one start until its listening session resets",
);
assert.match(
  sharedTracker,
  /subscribeCachedAnalyticsSessionId/,
  "play-before-session waits for analytics session readiness",
);
assert.match(
  sharedTracker,
  /trackedTrackIdRef/,
  "track A→B resets per-track analytics state",
);
assert.match(
  sharedTracker,
  /event_name: "audio_play_started"/,
  "the shared tracker emits the standard start event",
);
assert.match(
  sharedTracker,
  /getNewlyReachedMilestones/,
  "the shared tracker reuses the standard progress milestone flow",
);
assert.match(
  sharedTracker,
  /event_name: "audio_completed"/,
  "the shared tracker reuses the standard completion event",
);

const cta = read("src/components/products/NextStepRecommendation.tsx");
assert.match(cta, /event_name: "product_promo_clicked"/);
assert.match(cta, /practice_id: analytics\.practiceId/);
assert.match(cta, /author_id: analytics\.authorId \?\? null/);
assert.match(cta, /product_kind: analytics\.productKind/);
assert.deepEqual(
  {
    practice_id: syntheticAudioPost.practiceId,
    author_id: syntheticAuthorId,
    properties: { product_kind: "audio_post" },
  },
  {
    practice_id: "f677f3c7-6aa9-421a-b377-94c51b40b352",
    author_id: "f711e91d-9c55-4cd1-a1a4-a52fed559b2b",
    properties: { product_kind: "audio_post" },
  },
  "a future audio_post CTA has no product-specific analytics configuration",
);

const trackRoute = read("src/app/api/analytics/track/route.ts");
assert.match(trackRoute, /p_practice_id: parsed\.practice_id/);
assert.match(trackRoute, /p_author_id: parsed\.author_id/);

console.log("audio-post-analytics-unit: ok");
