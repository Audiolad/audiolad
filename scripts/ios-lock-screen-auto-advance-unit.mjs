#!/usr/bin/env node
/**
 * Lock-screen / background auto-advance — source-level unit checks.
 * Shared iOS / Android / desktop path. No device required.
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

function testEndedDoesNotAwaitProgressBeforeAdvance() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");
  const handleEnded = sliceBetween(
    player,
    "const handleEnded = () => {",
    "const handleError = () => {",
  );

  assert(
    handleEnded.includes("void saveProgress("),
    "handleEnded fire-and-forgets saveProgress",
  );
  assert(
    !handleEnded.includes("await saveProgress"),
    "handleEnded must not await saveProgress before advancing",
  );
  assert(
    handleEnded.includes("fromEndedOrNext: true"),
    "handleEnded uses the ended/next switch path",
  );
  assert(
    handleEnded.includes("void switchToTrack("),
    "handleEnded does not await switchToTrack before returning",
  );
  assert(
    !handleEnded.includes("await switchToTrack"),
    "handleEnded must not await switchToTrack",
  );
  assert(
    !handleEnded.includes("await onTracksExhausted"),
    "handleEnded must not await queue exhaust before returning",
  );
  assert(
    handleEnded.includes("void onTracksExhaustedRef.current(practiceId)"),
    "queue exhaust is kicked off without blocking ended",
  );

  const switchToTrack = sliceBetween(
    player,
    "const switchToTrack = useCallback(",
    "useEffect(() => {\n    if (!currentTrack?.id) {",
  );

  assert(
    switchToTrack.includes("fromEndedOrNext"),
    "switchToTrack accepts ended/next persist mode",
  );
  assert(
    switchToTrack.includes("void persistOutgoing()"),
    "ended/next path does not await the outgoing progress save",
  );

  const persistBranch = sliceBetween(
    switchToTrack,
    "if (options?.fromEndedOrNext) {",
    "} else {",
  );
  assert(
    persistBranch.includes("void persistOutgoing()"),
    "fromEndedOrNext save is void, not awaited",
  );
  assert(
    !persistBranch.includes("await persistOutgoing"),
    "fromEndedOrNext must not await persistOutgoing",
  );
}

function testNextTrackUsesSameFastPath() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");
  const handleNext = sliceBetween(
    player,
    "const handleNextTrack = async () => {",
    "const handleSelectTrack = async (index: number) => {",
  );

  assert(
    handleNext.includes("fromEndedOrNext: true"),
    "handleNextTrack uses the same ended/next persist mode",
  );
  assert(
    handleNext.includes("switchToTrack(currentTrackIndex + 1"),
    "in-session next still switches on the shared player",
  );
}

function testPrefetchNextSignedUrl() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");
  const helper = readSource("src/lib/audio/signed-audio-url.ts");

  assert(
    player.includes("prefetchedNextSourceRef"),
    "prefetch store exists",
  );
  assert(
    player.includes("tracks[currentTrackIndex + 1]"),
    "prefetch targets the next in-session track",
  );
  assert(
    player.includes("fetchSignedAudioUrl"),
    "prefetch uses the shared signed-URL helper",
  );
  assert(
    helper.includes("${listenApiBase}/audio/${audioItemId}"),
    "catalog signed URL matches loadSignedUrl API",
  );
  assert(
    helper.includes("/api/my-library/private-audio/"),
    "private signed URL matches loadSignedUrl API",
  );
  assert(
    !player.includes("new Audio(") && !player.includes("new HTMLAudioElement"),
    "prefetch must not create a second Audio element",
  );
  assert(
    player.includes("prefetchMatch") && player.includes("applyUrlAndPlayNow"),
    "switch path applies a matching prefetch to the shared element",
  );
}

function testPlayRejectionLogsErrorName() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");
  const provider = readSource(
    "src/components/audio/GlobalAudioPlayerProvider.tsx",
  );
  const helper = readSource("src/lib/audio/signed-audio-url.ts");

  assert(helper.includes("export function playErrorName"), "shared error name helper");
  assert(
    player.includes('debugSnapshot("advance-play", `rejected:${name}`'),
    "in-session play() rejection uses debugSnapshot with rejected:name",
  );
  assert(
    player.includes("usedPrefetch:") && player.includes("advanceKind:"),
    "rejection log includes prefetch + queue/session fields",
  );
  assert(
    player.includes("errorName: name"),
    "rejection log includes errorName",
  );
  assert(
    provider.includes('logPlayerDebug("queue-advance", `rejected:${name}`'),
    "queue play() rejection uses existing logPlayerDebug",
  );
  assert(
    provider.includes('advanceKind: "queue"'),
    "queue rejection marks advanceKind=queue",
  );
  assert(
    player.includes('prefetch: meta.usedPrefetch ? "hit" : "miss"') ||
      (player.includes('prefetch: "miss"') && player.includes('prefetch: meta.usedPrefetch ? "hit" : "miss"')),
    "in-session rejection logs prefetch hit/miss",
  );
  assert(
    provider.includes('prefetch: meta.usedPrefetch ? "hit" : "miss"'),
    "queue rejection logs prefetch hit/miss",
  );
}

function testPlaylistExhaustPlaysBeforeRemountOrReplace() {
  const provider = readSource(
    "src/components/audio/GlobalAudioPlayerProvider.tsx",
  );

  assert(
    provider.includes("playBeforeNavigate: true"),
    "playlist exhaust uses play-before-navigate",
  );
  assert(
    provider.includes("queueAdvancePrefetchRef"),
    "next queue entry is prefetched",
  );
  assert(
    provider.includes("resolveQueueEntryPlayback"),
    "queue prefetch loads session + signed URL",
  );
  assert(
    provider.includes("{ preservePlayback: true }"),
    "queue advance preserves the playing element",
  );

  const helper = sliceBetween(
    provider,
    "async function playQueueAdvanceOnSharedAudio(",
    "const SessionContext = createContext",
  );
  assert(
    helper.includes("await audio.play()"),
    "shared-audio helper plays on the persistent element",
  );
  assert(
    helper.includes("waitForPlayingEvent"),
    "queue helper waits for playing (or play accepted) before callers remount/replace",
  );
  assert(
    !helper.includes("router.replace") &&
      !helper.includes("setPlaybackInstanceId"),
    "play helper does not remount or replace",
  );

  const activate = sliceBetween(
    provider,
    "const activateEntryAtIndex = useCallback(",
    "const loadPlaylistQueue = useCallback(",
  );
  const playCall = activate.indexOf(
    "await playQueueAdvanceOnSharedAudio(",
  );
  const replaceIdx = activate.indexOf("router.replace");
  const preserveLoad = activate.indexOf("{ preservePlayback: true }");
  const remountAfterPlayFirst = activate
    .slice(activate.indexOf("playBeforeNavigate === true"), preserveLoad + 1)
    .includes("setPlaybackInstanceId");

  assert(playCall >= 0, "exhaust path plays on the shared audio first");
  assert(preserveLoad > playCall, "loadSession/preserve runs after play()");
  assert(
    replaceIdx > playCall,
    "router.replace is not called before play() on the new path",
  );
  assert(
    !remountAfterPlayFirst,
    "play-first path must not call setPlaybackInstanceId",
  );
  assert(
    activate.includes("stayOnSource"),
    "stay_on_source still gates replace",
  );
}

function testSharedPathHasNoPlatformBranch() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");
  const provider = readSource(
    "src/components/audio/GlobalAudioPlayerProvider.tsx",
  );
  const handleEnded = sliceBetween(
    player,
    "const handleEnded = () => {",
    "const handleError = () => {",
  );
  const handleNext = sliceBetween(
    player,
    "const handleNextTrack = async () => {",
    "const handleSelectTrack = async (index: number) => {",
  );
  const playHelper = sliceBetween(
    provider,
    "async function playQueueAdvanceOnSharedAudio(",
    "const SessionContext = createContext",
  );
  const applyPlay = sliceBetween(
    player,
    "const applyUrlAndPlayNow = useCallback(",
    "const switchToTrack = useCallback(",
  );

  const platformBranch = /userAgent|isIosDevice|isAndroidDevice|isLikelyIos|navigator\.userAgent/;

  for (const [name, source] of [
    ["handleEnded", handleEnded],
    ["handleNextTrack", handleNext],
    ["applyUrlAndPlayNow", applyPlay],
    ["playQueueAdvanceOnSharedAudio", playHelper],
  ]) {
    assert(
      !platformBranch.test(source),
      `${name} must not special-case iOS/Android via UA`,
    );
  }

  assert(
    !handleEnded.includes("visibilityState") &&
      !handleEnded.includes("document.hidden"),
    "ended must not be gated on visibility",
  );
  assert(
    player.includes('audio.addEventListener("ended", handleEnded)'),
    "ended listener stays attached",
  );
}

function testDurationSeedAfterSkipLoadHandoff() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");

  assert(
    player.includes("function readLiveAudioDuration("),
    "live element duration helper exists",
  );

  const applyPlay = sliceBetween(
    player,
    "const applyUrlAndPlayNow = useCallback(",
    "const switchToTrack = useCallback(",
  );
  assert(
    applyPlay.includes("readLiveAudioDuration(audio)"),
    "applyUrlAndPlayNow seeds duration from the live element",
  );
  assert(
    applyPlay.includes("setDuration(liveDuration)"),
    "applyUrlAndPlayNow writes React duration when the element already knows it",
  );
  assert(
    !applyPlay.includes("audio.load("),
    "applyUrlAndPlayNow must not call audio.load()",
  );

  const handoff = sliceBetween(
    player,
    "const handoff = handoffSourceRef?.current;",
    "if (skipUrlLoadForTrackRef.current === trackId) {",
  );
  assert(
    handoff.includes("readLiveAudioDuration(audio)"),
    "handoff consume seeds duration from the live element",
  );
  assert(
    handoff.includes("setDuration(liveDuration)"),
    "handoff consume writes React duration when the element already knows it",
  );

  const attachListeners = sliceBetween(
    player,
    'audio.addEventListener("loadedmetadata", updateDuration);',
    'audio.addEventListener("timeupdate", handleTimeUpdate);',
  );
  assert(
    attachListeners.includes("updateDuration();"),
    "listeners effect seeds duration immediately after attach",
  );

  const hasValid = sliceBetween(
    player,
    "const hasValidDuration =",
    "const rawDisplayDuration = Number.isFinite(duration) && duration > 0",
  );
  assert(
    !hasValid.includes("audioRef.current"),
    "hasValidDuration must not read audioRef.current at render",
  );
  assert(
    !hasValid.includes("readLiveAudioDuration"),
    "hasValidDuration must not read live audio duration at render",
  );
  assert(
    hasValid.includes("Number.isFinite(duration) && duration > 0"),
    "hasValidDuration uses React duration state",
  );
  assert(
    hasValid.includes("hasPreviewWindow"),
    "hasValidDuration keeps the preview-window exception",
  );

  const seekOffset = sliceBetween(
    player,
    "const handleSeekOffset = (offsetSeconds: number) => {",
    "const handleRangeChange = (value: number) => {",
  );
  assert(
    seekOffset.includes("resolveSeekDuration(audio)"),
    "handleSeekOffset clamps using live element duration",
  );
  assert(
    !seekOffset.includes("if (!audio || !hasValidDuration)"),
    "handleSeekOffset must not early-return only on React hasValidDuration",
  );

  const rangeChange = sliceBetween(
    player,
    "const handleRangeChange = (value: number) => {",
    "const handlePreviousTrack = async () => {",
  );
  assert(
    rangeChange.includes("resolveSeekDuration(audio)"),
    "handleRangeChange clamps using live element duration",
  );
}

function testChaptersAndLessonsAreSessionTracks() {
  const sessionLoader = readSource("src/lib/listen/load-session-payload.ts");
  const database = readSource("docs/DATABASE.md");
  const publication = readSource(
    "src/lib/author-products/publication-class.ts",
  );
  const checklist = readSource(
    "docs/background-playback-ios-android-checklist.md",
  );

  assert(
    sessionLoader.includes('from("audio_items")'),
    "listen session loads audio_items as tracks",
  );
  assert(
    sessionLoader.includes("async function loadListenTracks"),
    "shared track loader exists",
  );
  assert(
    !sessionLoader.includes("chapters") &&
      !sessionLoader.includes("lessons") &&
      !sessionLoader.includes("from(\"sections\")"),
    "session loader has no chapter/lesson/section tables",
  );
  assert(
    database.includes("Section / Lesson / Chapter tables не создаются"),
    "schema documents no chapter/lesson tables",
  );
  assert(
    publication.includes('"course"') && publication.includes('"audiobook"'),
    "course and audiobook are publication classes on practices",
  );
  assert(
    checklist.includes("expected PASS") && checklist.includes("N/A (FACT)"),
    "checklist uses expected PASS / FACT, not invented live results",
  );
  assert(
    checklist.includes("not** live-device PASS") ||
      checklist.includes("not** live-device") ||
      checklist.includes("They are **not** live-device PASS"),
    "checklist does not claim live-device PASS",
  );
  assert(
    checklist.includes("in-session prefetch") &&
      checklist.includes("queue prefetch"),
    "checklist documents both advance paths",
  );
  assert(
    checklist.includes("Android Chrome") &&
      checklist.includes("Android PWA") &&
      checklist.includes("Desktop"),
    "checklist covers Android and desktop, not only iPhone",
  );
}

function main() {
  testEndedDoesNotAwaitProgressBeforeAdvance();
  testNextTrackUsesSameFastPath();
  testPrefetchNextSignedUrl();
  testPlayRejectionLogsErrorName();
  testPlaylistExhaustPlaysBeforeRemountOrReplace();
  testSharedPathHasNoPlatformBranch();
  testDurationSeedAfterSkipLoadHandoff();
  testChaptersAndLessonsAreSessionTracks();
  console.log("ios-lock-screen-auto-advance-unit: ok");
}

main();
