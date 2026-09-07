#!/usr/bin/env node
/**
 * Signed URL TTL expiry recovery — behavioral + wiring checks.
 * No browser and no production TTL change.
 */
import assert from "node:assert/strict";

import {
  captureRecoveryPosition,
  createSignedUrlRecoveryState,
  decideMediaErrorRecovery,
  FORMAT_AUDIO_ERROR,
  LOAD_AUDIO_ERROR,
  MEDIA_ERR_NETWORK,
  MEDIA_ERR_SRC_NOT_SUPPORTED,
  reduceSignedUrlRecovery,
  settleSignedUrlRecoveryFailure,
  shouldApplySignedUrlRecovery,
} from "../src/lib/audio/signed-url-media-error-recovery";

function playableState() {
  const started = createSignedUrlRecoveryState({
    trackId: "track-a",
    src: "https://cdn.example/expired.mp3",
    sessionGeneration: 1,
    currentTime: 3650,
    userWantsPlayback: true,
  });
  const afterPlaying = reduceSignedUrlRecovery(started, { type: "playing" });
  return { ...afterPlaying, currentTime: 3650 };
}

function testCode4Policy() {
  const firstSrcCode4 = decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: true,
    currentTrackId: "track-a",
    mediaErrorCode: MEDIA_ERR_SRC_NOT_SUPPORTED,
    hadSuccessfulPlaying: false,
    recoveryUrlAttempted: false,
    foregroundRecoveryInFlight: false,
  });
  assert.equal(firstSrcCode4.action, "format_error");
  assert.equal(firstSrcCode4.errorMessage, FORMAT_AUDIO_ERROR);

  const expiredCode4 = decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: true,
    currentTrackId: "track-a",
    mediaErrorCode: MEDIA_ERR_SRC_NOT_SUPPORTED,
    hadSuccessfulPlaying: true,
    recoveryUrlAttempted: false,
    foregroundRecoveryInFlight: false,
  });
  assert.equal(expiredCode4.action, "resign");

  const expiredCode2 = decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: true,
    currentTrackId: "track-a",
    mediaErrorCode: MEDIA_ERR_NETWORK,
    hadSuccessfulPlaying: true,
    recoveryUrlAttempted: false,
    foregroundRecoveryInFlight: false,
  });
  assert.equal(expiredCode2.action, "resign");

  const secondCode4 = decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: true,
    currentTrackId: "track-a",
    mediaErrorCode: MEDIA_ERR_SRC_NOT_SUPPORTED,
    hadSuccessfulPlaying: true,
    recoveryUrlAttempted: true,
    foregroundRecoveryInFlight: false,
  });
  assert.equal(secondCode4.action, "format_error");

  const secondCode2 = decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: true,
    currentTrackId: "track-a",
    mediaErrorCode: MEDIA_ERR_NETWORK,
    hadSuccessfulPlaying: true,
    recoveryUrlAttempted: true,
    foregroundRecoveryInFlight: false,
  });
  assert.equal(secondCode2.action, "load_error");
  assert.equal(secondCode2.errorMessage, LOAD_AUDIO_ERROR);
}

function testPlayingResumeAt3650() {
  let state = playableState();
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  assert.equal(state.fetchCalls.length, 1);
  assert.equal(state.pendingStartPosition, 3650);
  assert.equal(state.userWantsPlayback, true);
  assert.equal(state.playerError, null);

  state = reduceSignedUrlRecovery(state, {
    type: "signed_url_ok",
    trackId: "track-a",
    url: "https://cdn.example/fresh.mp3",
    generation: 1,
  });
  assert.equal(state.src, "https://cdn.example/fresh.mp3");

  state = reduceSignedUrlRecovery(state, { type: "canplay", duration: 4281 });
  assert.equal(state.currentTime, 3650);
  assert.equal(state.pendingStartPosition, 0);
  assert.equal(state.playCalls, 1);
}

function testPausedDoesNotPlay() {
  let state = playableState();
  state = reduceSignedUrlRecovery(state, {
    type: "set_play_intent",
    wantsPlayback: false,
  });
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_SRC_NOT_SUPPORTED,
    currentTime: 3650,
  });
  state = reduceSignedUrlRecovery(state, {
    type: "signed_url_ok",
    trackId: "track-a",
    url: "https://cdn.example/fresh.mp3",
    generation: 1,
  });
  state = reduceSignedUrlRecovery(state, { type: "canplay", duration: 4281 });
  assert.equal(state.currentTime, 3650);
  assert.equal(state.playCalls, 0);
  assert.equal(state.userWantsPlayback, false);
}

function testSecondFailureNoLoop() {
  let state = playableState();
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  state = reduceSignedUrlRecovery(state, {
    type: "signed_url_fail",
    trackId: "track-a",
    generation: 1,
    status: 500,
  });
  assert.equal(state.src, null);
  assert.equal(state.isLoading, false);
  assert.equal(state.isUrlLoading, false);
  assert.equal(state.playerError, LOAD_AUDIO_ERROR);
  assert.equal(state.recoveryUrlAttempted, true);

  const fetches = state.fetchCalls.length;
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  assert.equal(state.fetchCalls.length, fetches);
  assert.equal(state.playerError, LOAD_AUDIO_ERROR);
}

function testSeekTargetPreserved() {
  let state = playableState();
  state = reduceSignedUrlRecovery(state, { type: "seek_target", position: 4000 });
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 12,
  });
  assert.equal(
    captureRecoveryPosition(4000, 12),
    4000,
    "pending seek wins over live currentTime",
  );
  assert.equal(state.pendingStartPosition, 4000);

  state = reduceSignedUrlRecovery(state, {
    type: "signed_url_ok",
    trackId: "track-a",
    url: "https://cdn.example/fresh.mp3",
    generation: 1,
  });
  state = reduceSignedUrlRecovery(state, { type: "canplay", duration: 4281 });
  assert.equal(state.currentTime, 4000);
}

function testTrackSwitchDropsInFlightRecovery() {
  let state = playableState();
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  state = reduceSignedUrlRecovery(state, {
    type: "track_switch",
    trackId: "track-b",
    startPosition: 0,
  });
  state = reduceSignedUrlRecovery(state, {
    type: "signed_url_ok",
    trackId: "track-a",
    url: "https://cdn.example/old-recovery.mp3",
    generation: 1,
  });
  assert.equal(state.trackId, "track-b");
  assert.notEqual(state.src, "https://cdn.example/old-recovery.mp3");
  assert.equal(state.pendingStartPosition, 0);
  assert.equal(state.currentTime, 0);
}

function testSessionGenerationDropsStaleRecovery() {
  let state = playableState();
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  state = reduceSignedUrlRecovery(state, {
    type: "session_generation",
    generation: 2,
  });
  assert.equal(
    shouldApplySignedUrlRecovery({
      recoveredTrackId: "track-a",
      recoveredGeneration: 1,
      currentTrackId: state.trackId,
      currentGeneration: state.sessionGeneration,
    }),
    false,
  );
  state = reduceSignedUrlRecovery(state, {
    type: "signed_url_ok",
    trackId: "track-a",
    url: "https://cdn.example/stale.mp3",
    generation: 1,
  });
  assert.notEqual(state.src, "https://cdn.example/stale.mp3");
  assert.equal(state.recoveryUrlAttempted, false);
}

function testForegroundDoesNotDoubleFetch() {
  let state = playableState();
  state = reduceSignedUrlRecovery(state, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  assert.equal(state.fetchCalls.length, 1);
  state = reduceSignedUrlRecovery(state, { type: "foreground_recovery_start" });
  state = reduceSignedUrlRecovery(state, { type: "foreground_resign_attempt" });
  assert.equal(state.fetchCalls.length, 1);

  let concurrent = playableState();
  concurrent = reduceSignedUrlRecovery(concurrent, {
    type: "foreground_recovery_start",
  });
  concurrent = reduceSignedUrlRecovery(concurrent, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  assert.equal(concurrent.fetchCalls.length, 0);
}

function testCode2AndCode4ChosenPolicy() {
  let code2 = playableState();
  code2 = reduceSignedUrlRecovery(code2, {
    type: "media_error",
    code: MEDIA_ERR_NETWORK,
    currentTime: 3650,
  });
  assert.equal(code2.fetchCalls.length, 1);

  let code4 = playableState();
  code4 = reduceSignedUrlRecovery(code4, {
    type: "media_error",
    code: MEDIA_ERR_SRC_NOT_SUPPORTED,
    currentTime: 3650,
  });
  assert.equal(code4.fetchCalls.length, 1);

  let firstFormat = createSignedUrlRecoveryState({
    hadSuccessfulPlaying: false,
    src: "https://cdn.example/bad.mp3",
  });
  firstFormat = reduceSignedUrlRecovery(firstFormat, {
    type: "media_error",
    code: MEDIA_ERR_SRC_NOT_SUPPORTED,
  });
  assert.equal(firstFormat.fetchCalls.length, 0);
  assert.equal(firstFormat.playerError, FORMAT_AUDIO_ERROR);

  code4 = reduceSignedUrlRecovery(code4, {
    type: "signed_url_ok",
    trackId: "track-a",
    url: "https://cdn.example/fresh.mp3",
    generation: 1,
  });
  code4 = reduceSignedUrlRecovery(code4, {
    type: "media_error",
    code: MEDIA_ERR_SRC_NOT_SUPPORTED,
  });
  assert.equal(code4.fetchCalls.length, 1);
  assert.equal(code4.playerError, FORMAT_AUDIO_ERROR);
}

function testLoadSignedUrlFailureSettles() {
  const failed = settleSignedUrlRecoveryFailure({
    ok: false,
    reason: "failed",
  });
  assert.equal(failed.hangLoading, false);
  assert.equal(failed.showError, true);
  assert.equal(failed.allowAnotherResign, false);

  const stale = settleSignedUrlRecoveryFailure({
    ok: false,
    reason: "stale",
  });
  assert.equal(stale.showError, false);
  assert.equal(stale.allowAnotherResign, false);

  for (const [status, message] of [
    [403, "Доступ к прослушиванию не открыт."],
    [404, "Аудиофайл не найден."],
    [500, LOAD_AUDIO_ERROR],
  ] as const) {
    let state = playableState();
    state = reduceSignedUrlRecovery(state, {
      type: "media_error",
      code: MEDIA_ERR_NETWORK,
      currentTime: 3650,
    });
    state = reduceSignedUrlRecovery(state, {
      type: "signed_url_fail",
      trackId: "track-a",
      generation: 1,
      status,
    });
    assert.equal(state.isLoading, false, `${status} must end loading`);
    assert.equal(state.isUrlLoading, false, `${status} must end url loading`);
    assert.equal(state.src, null, `${status} must not leave a half-state src`);
    assert.equal(state.playerError, message, `${status} shows a clear error`);
    assert.equal(state.recoveryUrlAttempted, true);

    const fetches = state.fetchCalls.length;
    state = reduceSignedUrlRecovery(state, { type: "foreground_resign_attempt" });
    state = reduceSignedUrlRecovery(state, {
      type: "media_error",
      code: MEDIA_ERR_NETWORK,
    });
    assert.equal(state.fetchCalls.length, fetches, `${status} must not auto-refresh again`);
  }
}

function main() {
  testCode4Policy();
  testPlayingResumeAt3650();
  testPausedDoesNotPlay();
  testSecondFailureNoLoop();
  testSeekTargetPreserved();
  testTrackSwitchDropsInFlightRecovery();
  testSessionGenerationDropsStaleRecovery();
  testForegroundDoesNotDoubleFetch();
  testCode2AndCode4ChosenPolicy();
  testLoadSignedUrlFailureSettles();
  console.log("signed-url-ttl-expiry-recovery-unit: ok");
}

main();
