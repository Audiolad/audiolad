#!/usr/bin/env node
/**
 * Signed URL TTL expiry recovery — source-level unit checks.
 * No browser required. Does not bump production TTL.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert(start >= 0, `missing start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(end > start, `missing end after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

function readPlayer() {
  return readSource("src/components/audio/useSequentialPlayer.ts");
}

function readHandleError(player = readPlayer()) {
  return sliceBetween(
    player,
    "const handleError = () => {",
    'audio.addEventListener("loadedmetadata"',
  );
}

function testNormalPlaybackUnchanged() {
  const player = readPlayer();
  const handleError = readHandleError(player);
  const handleCanPlay = sliceBetween(
    player,
    "const handleCanPlay = () => {",
    "const handleStalled = () => {",
  );
  const handlePlaying = sliceBetween(
    player,
    "const handlePlaying = () => {",
    "const handlePause = () => {",
  );
  const trackLoad = sliceBetween(
    player,
    "useEffect(() => {\n    if (!currentTrack?.id) {",
    "const applySrcToAudioElement = useCallback(",
  );

  assert(
    trackLoad.includes("void loadSignedUrl(trackId)"),
    "initial / track / generation load still uses loadSignedUrl",
  );
  assert(
    handleCanPlay.includes("applyStartPosition()"),
    "canplay still applies pending start position",
  );
  assert(
    handleCanPlay.includes("wasPlayingBeforeSwitchRef.current"),
    "canplay still resumes play after a source switch",
  );
  assert(
    handlePlaying.includes('debugSnapshot("audio-event", "playing")'),
    "successful playing path is unchanged",
  );
  assert(
    !handleCanPlay.includes("media-error-recovery"),
    "happy-path canplay does not run media-error re-sign",
  );
  assert(
    handleError.includes("refresh-signed-url"),
    "re-sign is confined to the media-error handler",
  );
}

function testMediaErrorResignsOnceViaExistingLoader() {
  const player = readPlayer();
  const handleError = readHandleError(player);
  const loadSignedUrl = sliceBetween(
    player,
    "const loadSignedUrl = useCallback(",
    "useEffect(() => {\n    loadSignedUrlRef.current = loadSignedUrl;",
  );

  assert(
    handleError.includes("loadSignedUrlRef.current(recoveredTrackId)"),
    "media error re-signs via existing loadSignedUrl",
  );
  assert(
    loadSignedUrl.includes("fetchSignedAudioUrl({"),
    "loadSignedUrl still delegates to fetchSignedAudioUrl",
  );
  assert(
    handleError.includes("recoveryUrlAttemptedRef.current = true"),
    "first media-error recovery consumes the shared retry guard",
  );
  assert(
    handleError.includes("!recoveryUrlAttemptedRef.current"),
    "second media error does not start another re-sign",
  );
  assert(
    handleError.includes("recoveryPromiseRef.current"),
    "in-flight foreground recovery blocks a second URL refresh",
  );
}

function testDoesNotResignUnsupportedFormat() {
  const handleError = readHandleError();

  const formatBranch = sliceBetween(
    handleError,
    "if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {",
    "if (recoveryPromiseRef.current) {",
  );

  assert(
    formatBranch.includes(
      'setPlayerError("Формат аудио не поддерживается на этом устройстве.")',
    ),
    "unsupported format shows the existing format error",
  );
  assert(
    !formatBranch.includes("loadSignedUrl"),
    "unsupported format must not re-sign",
  );
  assert(
    !formatBranch.includes("recoveryUrlAttemptedRef.current = true"),
    "unsupported format does not consume the TTL retry guard",
  );
}

function testCapturesPositionAndPlayIntent() {
  const handleError = readHandleError();
  const recoveryBranch = sliceBetween(
    handleError,
    "if (currentTrack && !recoveryUrlAttemptedRef.current) {",
    "setPlayingState(false);\n      setIsRecovering(false);\n\n      if (!userInitiatedPauseRef.current) {",
  );

  assert(
    recoveryBranch.includes("pendingStartPosition > 0"),
    "prefers pending seek target when one is armed",
  );
  assert(
    recoveryBranch.includes("audio.currentTime"),
    "falls back to the live audio position",
  );
  assert(
    recoveryBranch.includes("setPendingStartPosition(capturedPosition)"),
    "restores the captured position after re-sign",
  );
  assert(
    recoveryBranch.includes("userWantsPlaybackRef.current"),
    "captures user play intent",
  );
  assert(
    recoveryBranch.includes("wasPlayingBeforeSwitchRef.current = wantsPlayback"),
    "playing intent resumes via the existing canplay play() path",
  );
  assert(
    recoveryBranch.includes("wantsPlayback"),
    "paused intent stays paused (wasPlayingBeforeSwitchRef is false)",
  );
  assert(
    !recoveryBranch.includes("userWantsPlaybackRef.current = false"),
    "recovery must not clear paused/playing intent",
  );
  assert(
    readPlayer().includes(
      "audio.playbackRate = PLAYBACK_RATES[playbackRateIndex]",
    ),
    "src reload still reapplies the current playbackRate",
  );
}

function testSecondFailureShowsPlayerError() {
  const handleError = readHandleError();
  const failureTail = handleError.slice(
    handleError.indexOf("if (!userInitiatedPauseRef.current) {"),
  );

  assert(
    failureTail.includes(
      '"Не удалось загрузить аудио. Проверьте соединение и попробуйте ещё раз."',
    ),
    "second failure uses the existing playerError UI",
  );
  assert(
    !failureTail.includes("loadSignedUrl"),
    "second failure must not loop into another re-sign",
  );
}

function testRetryGuardResetsOnCycleBoundaries() {
  const player = readPlayer();
  const handlePlaying = sliceBetween(
    player,
    "const handlePlaying = () => {",
    "const handlePause = () => {",
  );
  const switchToTrack = sliceBetween(
    player,
    "const switchToTrack = useCallback(",
    "useEffect(() => {\n    if (!currentTrack?.id) {",
  );
  const trackLoad = sliceBetween(
    player,
    "useEffect(() => {\n    if (!currentTrack?.id) {",
    "const applySrcToAudioElement = useCallback(",
  );
  const handleRetry = sliceBetween(
    player,
    "const handleRetry = () => {",
    "const handleSpeedChange = () => {",
  );

  assert(
    handlePlaying.includes("recoveryUrlAttemptedRef.current = false"),
    "successful playing after load resets the retry guard",
  );
  assert(
    switchToTrack.includes("recoveryUrlAttemptedRef.current = false") &&
      switchToTrack.includes("recoveryPromiseRef.current = null"),
    "track switch resets the retry guard",
  );
  assert(
    trackLoad.includes("recoveryUrlAttemptedRef.current = false") &&
      trackLoad.includes("recoveryPromiseRef.current = null"),
    "track / session-generation load resets the retry guard",
  );
  assert(
    trackLoad.includes("sessionGeneration"),
    "signed URL reload still follows session generation",
  );
  assert(
    handleRetry.includes("recoveryUrlAttemptedRef.current = false") &&
      handleRetry.includes("recoveryPromiseRef.current = null"),
    "explicit handleRetry resets the retry guard",
  );
}

function testTrackSwitchDoesNotRestoreOldPosition() {
  const player = readPlayer();
  const handleError = readHandleError(player);
  const switchToTrack = sliceBetween(
    player,
    "const switchToTrack = useCallback(",
    "useEffect(() => {\n    if (!currentTrack?.id) {",
  );
  const loadSignedUrl = sliceBetween(
    player,
    "const loadSignedUrl = useCallback(",
    "useEffect(() => {\n    loadSignedUrlRef.current = loadSignedUrl;",
  );

  assert(
    handleError.includes("const recoveredTrackId = currentTrack.id"),
    "media-error recovery captures the failing track id",
  );
  assert(
    handleError.includes("loadSignedUrlRef.current(recoveredTrackId)"),
    "re-sign requests a URL for the failing track only",
  );
  assert(
    switchToTrack.includes("setPendingStartPosition(options?.startPosition ?? 0)"),
    "track switch overwrites any in-flight recovery seek target",
  );
  assert(
    switchToTrack.includes("setCurrentTime(options?.startPosition ?? 0)"),
    "track switch does not keep the previous track clock",
  );
  assert(
    loadSignedUrl.includes("url_fetch_stale_ignored") &&
      loadSignedUrl.includes("capturedGeneration"),
    "a later track/generation load stale-cancels the previous re-sign",
  );
}

function testPreviewAndAccessSemanticsUnchanged() {
  const player = readPlayer();
  const helper = readSource("src/lib/audio/signed-audio-url.ts");
  const loadSignedUrl = sliceBetween(
    player,
    "const loadSignedUrl = useCallback(",
    "useEffect(() => {\n    loadSignedUrlRef.current = loadSignedUrl;",
  );
  const applyStart = sliceBetween(
    player,
    "const applyStartPosition = () => {",
    "const updateDuration = () => {",
  );
  const saveProgress = sliceBetween(
    player,
    "const saveProgress = useCallback(",
    "useEffect(() => {\n    saveProgressRef.current = saveProgress;",
  );

  assert(
    loadSignedUrl.includes("preview: isPreviewModeRef.current"),
    "re-sign keeps paid preview/full via the existing preview flag",
  );
  assert(
    helper.includes("preview_full_audio_blocked"),
    "preview still rejects original full-audio signed URLs",
  );
  assert(
    helper.includes("${listenApiBase}/audio/${audioItemId}${preview ? \"?preview=1\" : \"\"}"),
    "catalog preview query is unchanged",
  );
  assert(
    applyStart.includes("hasPreviewWindowRef.current") &&
      applyStart.includes("clamp(pendingStartPosition, min, max)"),
    "restored seek still clamps to the paid preview window",
  );
  assert(
    saveProgress.includes("if (isPreviewModeRef.current)") &&
      saveProgress.includes("return;"),
    "preview mode still does not persist listen progress",
  );
}

function testForegroundRecoveryDoesNotDoubleRefresh() {
  const player = readPlayer();
  const handleError = readHandleError(player);
  const foreground = sliceBetween(
    player,
    "const recoverPlaybackWhenVisible = useCallback(async (): Promise<boolean> => {",
    "const handleMediaSessionPlay = useCallback(async () => {",
  );

  assert(
    handleError.includes("if (recoveryPromiseRef.current)"),
    "media-error path yields when foreground recovery is already running",
  );
  assert(
    foreground.includes("recoveryUrlAttemptedRef.current"),
    "foreground recovery still consults the shared retry guard",
  );

  const urlRefreshGate = sliceBetween(
    foreground,
    "if (\n          recoveryUrlAttemptedRef.current ||",
    "recoveryUrlAttemptedRef.current = true;",
  );
  assert(
    urlRefreshGate.includes("failed-no-retry"),
    "foreground skips a second URL refresh after media-error already used the cycle",
  );
  assert(
    foreground.includes("await loadSignedUrl(currentTrack.id)"),
    "foreground URL refresh remains for non-expiry / unused-cycle cases",
  );
  assert(
    foreground.includes("visibilityState") &&
      foreground.includes("skip-initial-buffering"),
    "existing visibility / buffering foreground behavior is preserved",
  );
}

function testTtlLeftAt3600() {
  const signedUrl = readSource("src/lib/listen/signed-url.ts");
  const signedAudio = readSource("src/lib/listen/signed-audio.ts");
  const previewClip = readSource("src/lib/listen/serve-preview-clip.ts");
  const player = readPlayer();

  assert(
    signedUrl.includes("export const LISTEN_SIGNED_URL_TTL_SECONDS = 3600;"),
    "production signed URL TTL stays 3600",
  );
  assert(
    signedAudio.includes("LISTEN_SIGNED_URL_TTL_SECONDS") &&
      previewClip.includes("LISTEN_SIGNED_URL_TTL_SECONDS"),
    "server signing still uses the shared TTL constant",
  );
  assert(
    !player.includes("LISTEN_SIGNED_URL_TTL_SECONDS"),
    "player recovery must not invent a client TTL override",
  );
  assert(
    !/LISTEN_SIGNED_URL_TTL_SECONDS\s*=\s*(?!3600)\d+/.test(signedUrl),
    "signed-url module must not redefine TTL away from 3600",
  );
}

function main() {
  testNormalPlaybackUnchanged();
  testMediaErrorResignsOnceViaExistingLoader();
  testDoesNotResignUnsupportedFormat();
  testCapturesPositionAndPlayIntent();
  testSecondFailureShowsPlayerError();
  testRetryGuardResetsOnCycleBoundaries();
  testTrackSwitchDoesNotRestoreOldPosition();
  testPreviewAndAccessSemanticsUnchanged();
  testForegroundRecoveryDoesNotDoubleRefresh();
  testTtlLeftAt3600();
  console.log("signed-url-ttl-expiry-recovery-unit: ok");
}

main();
