import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  captureMaxRecoveryPosition,
  clampMaxSeek,
  decideMaxSignedUrlRecovery,
  hasMaxAudioElementSource,
  isStaleMaxAudioRequest,
  maxTrackSwitchVisibleReset,
  nextMaxTrackIndex,
  previousMaxTrackIndex,
  settleMaxResignFailure,
  shouldAcceptMaxAudioResponse,
  isMaxBlobObjectUrl,
  isMaxPreviewPlaybackMode,
  shouldAdvanceAfterMaxPreviewEnd,
  shouldAdvanceAfterMaxTrackEnd,
  shouldClearMaxPreviewEndedAfterSeek,
  shouldReplayMaxPreviewFromStart,
  shouldRevokeMaxAudioObjectUrl,
  shouldShowMaxTrackNavigation,
  shouldApplyMaxSeekRestore,
  shouldDisableMaxPrimaryPlayWhilePreparing,
  shouldIgnoreMaxTeardownMediaError,
  shouldPlayMaxAppliedSource,
  shouldResetMaxRecoveryCycle,
  shouldResumeAfterMaxResign,
  shouldStartMaxPrimaryPlayFetch,
  skipMaxPlayback,
} from "../src/lib/max/max-audio-playback.ts";

assert.equal(clampMaxSeek(10, 8), 8);
assert.equal(clampMaxSeek(-3, 8), 0);
assert.equal(skipMaxPlayback(10, 15, 20), 20);
assert.equal(skipMaxPlayback(10, -15, 20), 0);
assert.equal(nextMaxTrackIndex(0, 3), 1);
assert.equal(nextMaxTrackIndex(2, 3), null);
assert.equal(previousMaxTrackIndex(0, 3), null);
assert.equal(previousMaxTrackIndex(1, 3), 0);
assert.equal(shouldAdvanceAfterMaxTrackEnd(0, 3), true);
assert.equal(shouldAdvanceAfterMaxTrackEnd(2, 3), false);
assert.equal(isMaxPreviewPlaybackMode("preview"), true);
assert.equal(shouldShowMaxTrackNavigation("preview"), false);
assert.equal(shouldAdvanceAfterMaxPreviewEnd("preview"), false);
assert.equal(
  shouldReplayMaxPreviewFromStart({
    playbackMode: "full",
    previewEnded: true,
    hasSource: true,
  }),
  false,
);
assert.equal(
  shouldClearMaxPreviewEndedAfterSeek({
    previewEnded: false,
    nextTime: 10,
    currentTime: 20,
    duration: 80,
  }),
  false,
);
assert.equal(shouldRevokeMaxAudioObjectUrl("blob:https://max.audiolad.ru/1"), true);
assert.equal(isMaxBlobObjectUrl("https://cdn.example/a.mp3"), false);
assert.equal(captureMaxRecoveryPosition(3650), 3650);
assert.equal(isStaleMaxAudioRequest(1, 2), true);
assert.equal(
  shouldAcceptMaxAudioResponse({ aborted: false, requestGeneration: 2, liveGeneration: 2 }),
  true,
);
assert.equal(
  shouldAcceptMaxAudioResponse({ aborted: false, requestGeneration: 1, liveGeneration: 2 }),
  false,
);
assert.equal(shouldResumeAfterMaxResign(false), false);
assert.equal(shouldResumeAfterMaxResign(true), true);
assert.equal(shouldResetMaxRecoveryCycle("playing"), true);
assert.equal(shouldResetMaxRecoveryCycle("play"), false);
assert.equal(shouldResetMaxRecoveryCycle("src"), false);
assert.equal(shouldResetMaxRecoveryCycle("fetch"), false);
assert.equal(
  shouldApplyMaxSeekRestore({
    listenerGeneration: 1,
    liveGeneration: 1,
    listenerTrackId: "a",
    liveTrackId: "a",
  }),
  true,
);
assert.equal(
  shouldApplyMaxSeekRestore({
    listenerGeneration: 1,
    liveGeneration: 2,
    listenerTrackId: "a",
    liveTrackId: "a",
  }),
  false,
);
assert.equal(
  shouldApplyMaxSeekRestore({
    listenerGeneration: 2,
    liveGeneration: 2,
    listenerTrackId: "a",
    liveTrackId: "b",
  }),
  false,
);

const resign = decideMaxSignedUrlRecovery({
  mediaErrorCode: 2,
  hadSuccessfulPlaying: true,
  recoveryUrlAttempted: false,
  currentTrackId: "track-1",
  hasSrc: true,
});
assert.equal(resign.action, "resign");

const noLoop = decideMaxSignedUrlRecovery({
  mediaErrorCode: 2,
  hadSuccessfulPlaying: true,
  recoveryUrlAttempted: true,
  currentTrackId: "track-1",
  hasSrc: true,
});
assert.equal(noLoop.action, "load_error");
assert.equal(settleMaxResignFailure("failed").allowAnotherResign, false);

const afterPlayingReset = decideMaxSignedUrlRecovery({
  mediaErrorCode: 2,
  hadSuccessfulPlaying: true,
  recoveryUrlAttempted: shouldResetMaxRecoveryCycle("playing") ? false : true,
  currentTrackId: "track-1",
  hasSrc: true,
});
assert.equal(afterPlayingReset.action, "resign");

function fakeAudio(srcAttribute, currentSrc) {
  return {
    getAttribute: (name) => (name === "src" ? srcAttribute : null),
    currentSrc,
  };
}

assert.equal(hasMaxAudioElementSource(fakeAudio("https://cdn.example/a", "https://cdn.example/a")), true);
assert.equal(hasMaxAudioElementSource(fakeAudio(null, "")), false);
assert.equal(shouldIgnoreMaxTeardownMediaError(fakeAudio(null, "")), true);
assert.equal(shouldIgnoreMaxTeardownMediaError(fakeAudio("", "")), true);
assert.equal(shouldIgnoreMaxTeardownMediaError(fakeAudio("https://cdn.example/a", "")), false);
assert.equal(
  shouldPlayMaxAppliedSource({ requestedShouldPlay: true, liveIntendedPlaying: true }),
  true,
);
assert.equal(
  shouldPlayMaxAppliedSource({ requestedShouldPlay: true, liveIntendedPlaying: false }),
  false,
);
assert.equal(
  shouldPlayMaxAppliedSource({ requestedShouldPlay: false, liveIntendedPlaying: true }),
  false,
);
assert.deepEqual(maxTrackSwitchVisibleReset(), {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isPreparing: true,
});
assert.equal(shouldStartMaxPrimaryPlayFetch({ isPreparing: true, hasSource: false }), false);
assert.equal(shouldStartMaxPrimaryPlayFetch({ isPreparing: false, hasSource: false }), true);
assert.equal(shouldStartMaxPrimaryPlayFetch({ isPreparing: false, hasSource: true }), false);
assert.equal(shouldDisableMaxPrimaryPlayWhilePreparing(true), true);
assert.equal(shouldDisableMaxPrimaryPlayWhilePreparing(false), false);

const teardownIgnored = decideMaxSignedUrlRecovery({
  mediaErrorCode: 4,
  hadSuccessfulPlaying: true,
  recoveryUrlAttempted: false,
  currentTrackId: "track-b",
  hasSrc: hasMaxAudioElementSource(fakeAudio(null, "")),
});
assert.notEqual(teardownIgnored.action, "resign");

const hook = readFileSync(join(process.cwd(), "src/components/max/useMaxAudioPlayback.ts"), "utf8");
const player = readFileSync(join(process.cwd(), "src/components/max/MaxAudioPlayer.tsx"), "utf8");
const home = readFileSync(join(process.cwd(), "src/components/max/MaxAuthenticatedHome.tsx"), "utf8");
const source = `${hook}\n${player}\n${home}`;

assert.doesNotMatch(hook, /useEffect\(\(\) => \{[\s\S]*audio\.play\(/);
assert.match(player, /isPlaying \? pause : play/);
assert.match(player, /skipBy\(-15\)/);
assert.match(player, /skipBy\(15\)/);
assert.match(player, /type="range"/);
assert.match(player, /previousTrack/);
assert.match(player, /nextTrack/);
assert.match(player, /selectTrack/);
assert.match(player, /disabled=\{!canGoPrevious\}/);
assert.match(player, /disabled=\{!canGoNext\}/);
assert.match(player, /shouldDisableMaxPrimaryPlayWhilePreparing\(isPreparing\)/);
assert.match(hook, /AbortController/);
assert.match(hook, /shouldAcceptMaxAudioResponse/);
assert.match(hook, /decideMaxSignedUrlRecovery/);
assert.match(hook, /captureMaxRecoveryPosition/);
assert.match(hook, /shouldResumeAfterMaxResign/);
assert.match(hook, /shouldResetMaxRecoveryCycle\("playing"\)/);
assert.match(hook, /addEventListener\("playing"/);
assert.match(hook, /shouldApplyMaxSeekRestore/);
assert.match(hook, /removeEventListener\("loadedmetadata"/);
assert.match(hook, /generationRef\.current \+= 1/);
assert.match(hook, /nextMaxTrackIndex\(trackIndex, tracks\.length\)/);
assert.match(hook, /Сессия прослушивания устарела/);

const loadTrackFn = hook.slice(hook.indexOf("const loadTrack"), hook.indexOf("const play ="));
assert.match(loadTrackFn, /stopRequests\(\)/);
assert.match(loadTrackFn, /clearSeekRestore\(\)/);
assert.match(loadTrackFn, /generationRef\.current \+= 1/);
assert.match(loadTrackFn, /clearCurrentMediaSource\(\)/);
assert.match(loadTrackFn, /maxTrackSwitchVisibleReset\(\)/);
assert.match(loadTrackFn, /setIsPlaying\(visible\.isPlaying\)/);
assert.match(loadTrackFn, /setCurrentTime\(visible\.currentTime\)/);
assert.match(loadTrackFn, /visible\.duration/);
assert.match(loadTrackFn, /setDuration\(/);
assert.doesNotMatch(loadTrackFn, /intendedPlayingRef\.current = false/);
assert.ok(loadTrackFn.indexOf("clearCurrentMediaSource()") < loadTrackFn.indexOf("fetchAudio"));

const clearSource = hook.slice(
  hook.indexOf("const clearCurrentMediaSource"),
  hook.indexOf("const invalidatePlayback"),
);
assert.match(clearSource, /audio\.pause\(\)/);
assert.match(clearSource, /removeAttribute\("src"\)/);
assert.match(clearSource, /audio\.load\(\)/);
assert.doesNotMatch(clearSource, /intendedPlayingRef\.current = false/);

const onErrorFn = hook.slice(hook.indexOf("const onError"), hook.indexOf("audio.addEventListener(\"timeupdate\""));
assert.match(onErrorFn, /shouldIgnoreMaxTeardownMediaError\(audio\)/);
assert.ok(
  onErrorFn.indexOf("shouldIgnoreMaxTeardownMediaError(audio)") <
    onErrorFn.indexOf("decideMaxSignedUrlRecovery"),
);
assert.match(hook, /shouldPlayMaxAppliedSource\(\{\s*requestedShouldPlay: input\.shouldPlay/);
assert.match(
  hook,
  /shouldPlay: shouldPlayMaxAppliedSource\(\{\s*requestedShouldPlay: capturedShouldPlay,\s*liveIntendedPlaying: intendedPlayingRef\.current/,
);
assert.match(hook, /shouldStartMaxPrimaryPlayFetch/);
assert.match(hook, /intendedPlayingRef\.current = true;\s*void loadTrack\(next, true\)/);
assert.doesNotMatch(source, /localStorage|sessionStorage/);
assert.doesNotMatch(source, /window\.location|openLink|\/listen\/|\/practice\//);
assert.match(home, /MAX_PLAYBACK_SESSION_PATH/);
assert.match(home, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(home, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(home, /playbackTicket: playback\.playbackTicket/);
const audioFetch = home.slice(home.indexOf("fetchAudio={async"));
assert.match(audioFetch, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(audioFetch, /playbackTicket: playback\.playbackTicket/);
assert.doesNotMatch(audioFetch, /initData/);
assert.doesNotMatch(audioFetch, /authorSlug:/);
assert.match(home, /Для прослушивания нужен доступ к продукту/);
assert.match(home, /max-w-\[280px\]/);
assert.doesNotMatch(home, /h-24\s+w-20/);
const readyHome = home.slice(home.indexOf('{detail.status === "ready" ?'));
assert.ok(
  readyHome.indexOf("<MaxAudioPlayer") < readyHome.indexOf("detail.product.description"),
  "detail description stays after MaxAudioPlayer",
);
assert.ok(
  readyHome.indexOf("detail.product.statsLabel") < readyHome.indexOf("<MaxAudioPlayer"),
  "stats stay before MaxAudioPlayer",
);
assert.match(home, /!selected\.isFree/);
const catalogSearch = readFileSync(join(process.cwd(), "src/components/max/MaxCatalogSearch.tsx"), "utf8");
assert.match(catalogSearch, /!product\.isFree/);

console.log("max-audio-player-unit: ok");
