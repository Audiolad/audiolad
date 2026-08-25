#!/usr/bin/env node
/**
 * iOS lock-screen auto-advance — source-level unit checks, no device required.
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

function main() {
  testEndedDoesNotAwaitProgressBeforeAdvance();
  testNextTrackUsesSameFastPath();
  testPrefetchNextSignedUrl();
  testPlayRejectionLogsErrorName();
  testPlaylistExhaustPlaysBeforeRemountOrReplace();
  console.log("ios-lock-screen-auto-advance-unit: ok");
}

main();
