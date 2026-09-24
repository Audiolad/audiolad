import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  captureMaxRecoveryPosition,
  clampMaxSeek,
  decideMaxSignedUrlRecovery,
  isStaleMaxAudioRequest,
  nextMaxTrackIndex,
  previousMaxTrackIndex,
  settleMaxResignFailure,
  shouldAcceptMaxAudioResponse,
  shouldAdvanceAfterMaxTrackEnd,
  shouldApplyMaxSeekRestore,
  shouldResetMaxRecoveryCycle,
  shouldResumeAfterMaxResign,
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
assert.doesNotMatch(source, /localStorage|sessionStorage/);
assert.doesNotMatch(source, /window\.location|openLink|\/listen\/|\/practice\//);
assert.match(home, /MAX_PLAYBACK_SESSION_PATH/);
assert.match(home, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(home, /playbackTicket: playback\.playbackTicket/);
const audioFetch = home.slice(home.indexOf("fetchAudio={async"));
assert.match(audioFetch, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(audioFetch, /playbackTicket: playback\.playbackTicket/);
assert.doesNotMatch(audioFetch, /initData/);
assert.doesNotMatch(audioFetch, /authorSlug:/);
assert.match(home, /Для прослушивания нужен доступ к продукту/);
assert.match(home, /max-w-\[280px\]/);
assert.doesNotMatch(home, /h-24\s+w-20/);

console.log("max-audio-player-unit: ok");
