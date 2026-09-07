#!/usr/bin/env node
/**
 * Signed URL TTL expiry recovery — behavioral + wiring checks.
 * No browser and no production TTL change.
 */
import assert from "node:assert/strict";

import {
  AUDIO_NOT_FOUND_ERROR,
  CATALOG_ACCESS_ERROR,
  captureRecoveryPosition,
  decideMediaErrorRecovery,
  failedSignedUrlLoadResult,
  FORMAT_AUDIO_ERROR,
  isAdoptedAudioAlreadyPlaying,
  LOAD_AUDIO_ERROR,
  MEDIA_ERR_ABORTED,
  MEDIA_ERR_DECODE,
  MEDIA_ERR_NETWORK,
  MEDIA_ERR_SRC_NOT_SUPPORTED,
  messageForSignedUrlLoadFailure,
  PRIVATE_ACCESS_ERROR,
  settleSignedUrlRecoveryFailure,
  shouldApplySignedUrlRecovery,
  visibleErrorForSignedUrlRecoveryFailure,
  visibleListenPlayerError,
  type SignedUrlSourceType,
} from "../src/lib/audio/signed-url-media-error-recovery";
import {
  createSignedUrlRecoveryState,
  reduceSignedUrlRecovery,
  visibleRecoveryError,
} from "./lib/signed-url-ttl-expiry-recovery-harness";

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

  const primaryCode2 = decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: true,
    currentTrackId: "track-a",
    mediaErrorCode: MEDIA_ERR_NETWORK,
    hadSuccessfulPlaying: false,
    recoveryUrlAttempted: false,
    foregroundRecoveryInFlight: false,
  });
  assert.equal(primaryCode2.action, "resign");
}

function recoveryDecision(code: number | null) {
  return decideMediaErrorRecovery({
    isHandlerCurrent: true,
    hasSrc: true,
    currentTrackId: "track-a",
    mediaErrorCode: code,
    hadSuccessfulPlaying: true,
    recoveryUrlAttempted: false,
    foregroundRecoveryInFlight: false,
  });
}

function testNonResignableMediaCodes() {
  for (const code of [MEDIA_ERR_ABORTED, MEDIA_ERR_DECODE, null, 0, 99] as const) {
    const decision = recoveryDecision(code);
    assert.equal(decision.action, "load_error", `code ${code} must not re-sign`);
    assert.equal(decision.errorMessage, LOAD_AUDIO_ERROR);

    let state = playableState();
    state = reduceSignedUrlRecovery(state, {
      type: "media_error",
      code,
      currentTime: 3650,
    });
    assert.equal(state.fetchCalls.length, 0, `code ${code} must not fetch`);
    assert.equal(state.playerError, LOAD_AUDIO_ERROR, `code ${code} final error`);
    assert.equal(state.recoveryUrlAttempted, false);
  }
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

  assert.equal(
    messageForSignedUrlLoadFailure({
      status: 403,
      sourceType: "private_audio",
    }),
    PRIVATE_ACCESS_ERROR,
  );
  assert.equal(
    messageForSignedUrlLoadFailure({ status: 403, sourceType: "catalog" }),
    CATALOG_ACCESS_ERROR,
  );
  assert.equal(
    messageForSignedUrlLoadFailure({ status: 404, sourceType: "catalog" }),
    AUDIO_NOT_FOUND_ERROR,
  );
  assert.equal(
    messageForSignedUrlLoadFailure({ status: 500, sourceType: "catalog" }),
    LOAD_AUDIO_ERROR,
  );

  const cases: Array<{
    status: number;
    sourceType: SignedUrlSourceType;
  }> = [
    { status: 403, sourceType: "private_audio" },
    { status: 403, sourceType: "catalog" },
    { status: 404, sourceType: "catalog" },
    { status: 500, sourceType: "catalog" },
  ];

  for (const { status, sourceType } of cases) {
    const label = `${sourceType} ${status}`;
    const result = failedSignedUrlLoadResult({ status, sourceType });
    const expected = messageForSignedUrlLoadFailure({ status, sourceType });
    const urlError = result.visibleError ?? expected;
    const playerError = visibleErrorForSignedUrlRecoveryFailure(result);

    assert.equal(result.visibleError, expected, `${label} factory visibleError`);
    assert.equal(playerError, expected, `${label} recovery uses loadSignedUrl text`);
    assert.equal(
      visibleListenPlayerError(playerError, urlError),
      expected,
      `${label} visible playerError ?? urlError must not be masked`,
    );
    assert.equal(
      visibleListenPlayerError(LOAD_AUDIO_ERROR, expected),
      LOAD_AUDIO_ERROR,
      "hook composition playerError ?? urlError lets a generic playerError win",
    );

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
      sourceType,
    });
    assert.equal(state.isLoading, false, `${label} must end loading`);
    assert.equal(state.isUrlLoading, false, `${label} must end url loading`);
    assert.equal(state.src, null, `${label} must not leave a half-state src`);
    assert.equal(visibleRecoveryError(state), expected, `${label} visible error`);
    assert.equal(state.recoveryUrlAttempted, true);

    const fetches = state.fetchCalls.length;
    state = reduceSignedUrlRecovery(state, { type: "foreground_resign_attempt" });
    state = reduceSignedUrlRecovery(state, {
      type: "media_error",
      code: MEDIA_ERR_NETWORK,
    });
    assert.equal(state.fetchCalls.length, fetches, `${label} must not auto-refresh again`);
  }
}

function testAdoptAlreadyPlayingCode4Resigns() {
  assert.equal(
    isAdoptedAudioAlreadyPlaying({ paused: false, ended: false }),
    true,
  );
  assert.equal(
    isAdoptedAudioAlreadyPlaying({ paused: true, ended: false }),
    false,
  );
  assert.equal(
    isAdoptedAudioAlreadyPlaying({ paused: false, ended: true }),
    false,
  );

  for (const kind of ["handoff", "prefetch"] as const) {
    let state = createSignedUrlRecoveryState({
      trackId: "old-track",
      src: "https://cdn.example/old.mp3",
      hadSuccessfulPlaying: true,
      sessionGeneration: 1,
    });
    state = reduceSignedUrlRecovery(state, {
      type: "adopt_playing_src",
      kind,
      trackId: "track-b",
      url: "https://cdn.example/expired-handoff.mp3",
      paused: false,
      ended: false,
    });
    assert.equal(state.hadSuccessfulPlaying, true, `${kind} keeps playing`);
    assert.equal(state.trackId, "track-b");
    assert.equal(state.recoveryUrlAttempted, false);

    state = reduceSignedUrlRecovery(state, {
      type: "media_error",
      code: MEDIA_ERR_SRC_NOT_SUPPORTED,
      currentTime: 12,
    });
    assert.equal(state.fetchCalls.length, 1, `${kind} code 4 re-signs`);
    assert.equal(state.playerError, null, `${kind} must not format_error`);
  }
}

function testPrimaryLoadCode4StillFormatError() {
  let pausedHandoff = createSignedUrlRecoveryState({
    hadSuccessfulPlaying: false,
    src: null,
  });
  pausedHandoff = reduceSignedUrlRecovery(pausedHandoff, {
    type: "adopt_playing_src",
    kind: "handoff",
    trackId: "track-b",
    url: "https://cdn.example/fresh.mp3",
    paused: true,
    ended: false,
  });
  assert.equal(pausedHandoff.hadSuccessfulPlaying, false);
  pausedHandoff = reduceSignedUrlRecovery(pausedHandoff, {
    type: "media_error",
    code: MEDIA_ERR_SRC_NOT_SUPPORTED,
  });
  assert.equal(pausedHandoff.fetchCalls.length, 0);
  assert.equal(pausedHandoff.playerError, FORMAT_AUDIO_ERROR);

  let primary = createSignedUrlRecoveryState({
    hadSuccessfulPlaying: false,
    src: "https://cdn.example/bad.mp3",
  });
  primary = reduceSignedUrlRecovery(primary, {
    type: "media_error",
    code: MEDIA_ERR_SRC_NOT_SUPPORTED,
  });
  assert.equal(primary.fetchCalls.length, 0);
  assert.equal(primary.playerError, FORMAT_AUDIO_ERROR);
}

function main() {
  testCode4Policy();
  testNonResignableMediaCodes();
  testPlayingResumeAt3650();
  testPausedDoesNotPlay();
  testSecondFailureNoLoop();
  testSeekTargetPreserved();
  testTrackSwitchDropsInFlightRecovery();
  testSessionGenerationDropsStaleRecovery();
  testForegroundDoesNotDoubleFetch();
  testCode2AndCode4ChosenPolicy();
  testLoadSignedUrlFailureSettles();
  testAdoptAlreadyPlayingCode4Resigns();
  testPrimaryLoadCode4StillFormatError();
  console.log("signed-url-ttl-expiry-recovery-unit: ok");
}

main();
