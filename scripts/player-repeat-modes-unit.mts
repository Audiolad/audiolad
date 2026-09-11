import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LISTENING_SESSION_GAP_MS } from "../src/lib/analytics/constants";
import {
  rememberContinuousListenCompleted,
  rememberContinuousListenPlayStarted,
  resetContinuousListenSession,
  touchContinuousListenSessionActivity,
} from "../src/lib/listen/repeat-analytics";
import {
  DEFAULT_REPEAT_MODE,
  nextRepeatMode,
  parseRepeatMode,
  PLAYER_REPEAT_MODE_STORAGE_KEY,
  REPEAT_MODE_ARIA_LABELS,
  readStoredRepeatMode,
  resolveNaturalEndedRepeatAction,
  writeStoredRepeatMode,
  type RepeatMode,
} from "../src/lib/listen/repeat-mode";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing end after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

function testParseAndCycle() {
  assert.equal(parseRepeatMode("off"), "off");
  assert.equal(parseRepeatMode("all"), "all");
  assert.equal(parseRepeatMode("one"), "one");
  assert.equal(parseRepeatMode("loop"), DEFAULT_REPEAT_MODE);
  assert.equal(parseRepeatMode(null), "off");
  assert.equal(parseRepeatMode(""), "off");
  assert.equal(parseRepeatMode(1), "off");
  assert.equal(nextRepeatMode("off"), "all");
  assert.equal(nextRepeatMode("all"), "one");
  assert.equal(nextRepeatMode("one"), "off");
}

function testEndedMatrix() {
  const modes: RepeatMode[] = ["off", "all", "one"];

  for (const repeatMode of modes) {
    for (const hasNextInSession of [false, true]) {
      const action = resolveNaturalEndedRepeatAction({
        repeatMode,
        hasNextInSession,
      });

      if (repeatMode === "one") {
        assert.equal(action, "replay-one", `one × next=${hasNextInSession}`);
        continue;
      }

      if (hasNextInSession) {
        assert.equal(action, "auto-next", `${repeatMode} mid-queue`);
        continue;
      }

      if (repeatMode === "all") {
        assert.equal(action, "restart-effective-queue", "all last item");
        continue;
      }

      assert.equal(action, "complete", "off last item");
    }
  }

  assert.equal(
    resolveNaturalEndedRepeatAction({
      repeatMode: "all",
      hasNextInSession: false,
    }),
    "restart-effective-queue",
    "single-item queue uses the same all-restart path",
  );
}

function testLocalStorageHelpers() {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;

  (globalThis as { window: unknown }).window = {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    },
  };

  assert.equal(PLAYER_REPEAT_MODE_STORAGE_KEY, "audiolad:player-repeat-mode");
  assert.equal(readStoredRepeatMode(), "off");
  writeStoredRepeatMode("all");
  assert.equal(store.get(PLAYER_REPEAT_MODE_STORAGE_KEY), "all");
  assert.equal(readStoredRepeatMode(), "all");
  store.set(PLAYER_REPEAT_MODE_STORAGE_KEY, "nope");
  assert.equal(readStoredRepeatMode(), "off");

  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window: unknown }).window = originalWindow;
  }
}

function testAnalyticsNoDuplicateCompletion() {
  resetContinuousListenSession();

  assert.equal(
    rememberContinuousListenPlayStarted("p1", "t1"),
    true,
    "first play_started counts",
  );
  assert.equal(
    rememberContinuousListenCompleted("p1", "t1"),
    true,
    "first completion counts",
  );

  for (let i = 0; i < 10; i += 1) {
    assert.equal(
      rememberContinuousListenPlayStarted("p1", "t1"),
      false,
      `auto loop ${i} must not fire play_started`,
    );
    assert.equal(
      rememberContinuousListenCompleted("p1", "t1"),
      false,
      `auto loop ${i} must not fire audio_completed`,
    );
  }

  assert.equal(
    rememberContinuousListenPlayStarted("p2", "t2"),
    true,
    "new product/session may start a new play_started",
  );
  assert.equal(
    rememberContinuousListenCompleted("p2", "t2"),
    true,
    "new product/session may start a new completion",
  );

  resetContinuousListenSession();
  assert.equal(
    rememberContinuousListenPlayStarted("p1", "t1"),
    true,
    "explicit user stop starts a new analytics context",
  );
}

function testHourLongContinuousRepeatStaysDeduped() {
  resetContinuousListenSession();

  const hourMs = 60 * 60 * 1000;
  const tickMs = 4 * 60 * 1000;

  assert.ok(
    tickMs < LISTENING_SESSION_GAP_MS,
    "test ticks must be closer than the inactivity gap",
  );
  assert.equal(
    rememberContinuousListenPlayStarted("album", "track-a", 0),
    true,
    "t=0 first play_started counts",
  );

  for (let t = tickMs; t <= hourMs; t += tickMs) {
    touchContinuousListenSessionActivity(t);
  }

  assert.equal(
    rememberContinuousListenCompleted("album", "track-a", hourMs),
    true,
    "t=60m first completion counts",
  );
  assert.equal(
    rememberContinuousListenPlayStarted("album", "track-a", hourMs + 1_000),
    false,
    "auto-repeat must not fire a second play_started",
  );

  for (let t = hourMs + tickMs; t <= hourMs * 2; t += tickMs) {
    touchContinuousListenSessionActivity(t);
  }

  assert.equal(
    rememberContinuousListenCompleted("album", "track-a", hourMs * 2),
    false,
    "t=120m auto-loop completion must stay deduped",
  );
}

function testInactivityGapStartsNewSession() {
  resetContinuousListenSession();

  assert.equal(
    rememberContinuousListenPlayStarted("album", "track-a", 0),
    true,
    "first play after idle counts",
  );
  touchContinuousListenSessionActivity(1_000);
  rememberContinuousListenCompleted("album", "track-a", 2_000);

  const afterGap = 2_000 + LISTENING_SESSION_GAP_MS + 1;

  assert.equal(
    rememberContinuousListenPlayStarted("album", "track-a", afterGap),
    true,
    "playback after >5m inactivity may start a new session",
  );
  assert.equal(
    rememberContinuousListenCompleted("album", "track-a", afterGap + 1),
    true,
    "new session after inactivity may count completion again",
  );
}

function testHandleEndedContract() {
  const player = read("src/components/audio/useSequentialPlayer.ts");
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
  const handlePrev = sliceBetween(
    player,
    "const handlePreviousTrack = async () => {",
    "const handleNextTrack = async () => {",
  );
  const handleSelect = sliceBetween(
    player,
    "const handleSelectTrack = async (index: number) => {",
    "const handlePlayTrackAtIndex = async (index: number) => {",
  );

  assert.match(handleEnded, /finishPreview\(\)/);
  const previewIdx = handleEnded.indexOf("finishPreview()");
  const actionIdx = handleEnded.indexOf("resolveNaturalEndedRepeatAction");
  assert.ok(previewIdx >= 0 && previewIdx < actionIdx, "preview finishes before repeat");

  assert.match(handleEnded, /void saveProgress\(/);
  assert.doesNotMatch(handleEnded, /await saveProgress/);
  assert.match(handleEnded, /fromEndedOrNext: true/);
  assert.match(handleEnded, /void switchToTrack\(/);
  assert.doesNotMatch(handleEnded, /await switchToTrack/);
  assert.match(handleEnded, /void onTracksExhaustedRef\.current\(practiceId\)/);
  assert.doesNotMatch(handleEnded, /await onTracksExhausted/);
  assert.match(handleEnded, /replay-one/);
  assert.match(handleEnded, /audio\.currentTime = 0/);
  assert.match(handleEnded, /void audio\.play\(\)/);
  assert.match(handleEnded, /restart-effective-queue/);
  assert.match(handleEnded, /switchToTrack\(0,/);
  assert.match(handleEnded, /isHandlerCurrent\(\)/);
  assert.doesNotMatch(handleEnded, /new Audio\(/);
  assert.doesNotMatch(handleEnded, /addEventListener\("ended"/);

  assert.doesNotMatch(handleNext, /repeatMode|getRepeatMode|resolveNaturalEnded/);
  assert.doesNotMatch(handlePrev, /repeatMode|getRepeatMode|resolveNaturalEnded/);
  assert.doesNotMatch(handleSelect, /repeatMode|getRepeatMode|resolveNaturalEnded/);
  assert.match(
    handleNext,
    /switchToTrack\(currentTrackIndex \+ 1/,
    "manual next stays non-wrapping",
  );
}

function testProviderSoT() {
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  const sequential = read("src/components/audio/useSequentialPlayer.ts");
  const shared = read("src/components/audio/listen-player-shared.tsx");
  const tracker = read("src/components/analytics/ListenAnalyticsTracker.tsx");

  assert.match(provider, /repeatMode: RepeatMode/);
  assert.match(provider, /cycleRepeatMode/);
  assert.match(provider, /useSyncExternalStore/);
  assert.match(provider, /readStoredRepeatMode/);
  assert.match(provider, /writeStoredRepeatMode/);
  assert.match(provider, /getRepeatMode=\{getRepeatMode\}/);
  assert.match(provider, /restartPlaylistQueue\(\)/);
  assert.match(
    provider,
    /if \(readStoredRepeatMode\(\) === "all"\)/,
    "playlist last-item all uses restartPlaylistQueue",
  );
  assert.match(provider, /resetContinuousListenSession/);
  assert.doesNotMatch(provider, /ListenAnalyticsTracker/);

  assert.match(sequential, /getRepeatMode\?: \(\) => RepeatMode/);
  assert.match(sequential, /getRepeatModeRef/);
  assert.doesNotMatch(
    sequential,
    /useState<RepeatMode>|PLAYER_REPEAT_MODE_STORAGE_KEY/,
    "engine does not own repeat SoT",
  );

  assert.match(shared, /repeatMode,/);
  assert.match(shared, /cycleRepeatMode,/);
  assert.doesNotMatch(shared, /useState<RepeatMode>/);

  assert.match(tracker, /if \(!trackId \|\| !isPlaying \|\| playStartedRef\.current\)/);
  assert.match(tracker, /rememberContinuousListenPlayStarted/);
  assert.match(tracker, /rememberContinuousListenCompleted/);
  assert.match(tracker, /touchContinuousListenSessionActivity/);
  assert.match(
    tracker,
    /if \(isPlaying\) \{\s*touchContinuousListenSessionActivity\(now\);/,
    "activity touch is gated on actual playback ticks",
  );

  const analytics = read("src/lib/listen/repeat-analytics.ts");
  assert.match(analytics, /lastActivityAt/);
  assert.doesNotMatch(
    analytics,
    /startedAt/,
    "continuous session expiry uses last activity, not first event time",
  );
}

function testUiSurfaces() {
  const desktop = read("src/components/audio/ListenPlayerDesktop.tsx");
  const mobile = read("src/components/audio/ListenPlayerMobile.tsx");
  const bar = read("src/components/listener/DesktopPlayerBar.tsx");
  const button = read("src/components/audio/RepeatModeButton.tsx");
  const labels = read("src/lib/listen/repeat-mode.ts");
  const mini = read("src/components/audio/GlobalMiniPlayer.tsx");
  const nowPlaying = read("src/components/listener/NowPlayingPanel.tsx");
  const personal = read(
    "src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx",
  );
  const studio = read(
    "src/components/studio/audiobooks/AudiobookChapterPlayer.tsx",
  );

  assert.match(labels, /Повтор выключен/);
  assert.match(labels, /Повтор очереди/);
  assert.match(labels, /Повтор трека/);
  assert.match(button, /REPEAT_MODE_ARIA_LABELS\[repeatMode\]/);
  assert.equal(REPEAT_MODE_ARIA_LABELS.off, "Повтор выключен");
  assert.equal(REPEAT_MODE_ARIA_LABELS.all, "Повтор очереди");
  assert.equal(REPEAT_MODE_ARIA_LABELS.one, "Повтор трека");
  assert.match(button, /showOne=\{repeatMode === "one"\}/);
  assert.match(button, /data-repeat-mode=\{repeatMode\}/);
  assert.doesNotMatch(button, /lucide|from "react-icons"/);

  assert.match(desktop, /<RepeatModeButton/);
  assert.match(mobile, /<RepeatModeButton/);
  assert.match(bar, /<RepeatModeButton/);
  assert.match(desktop, /cycleRepeatMode/);
  assert.match(mobile, /cycleRepeatMode/);
  assert.match(bar, /cycleRepeatMode/);

  assert.doesNotMatch(mini, /RepeatModeButton|cycleRepeatMode/);
  assert.doesNotMatch(nowPlaying, /RepeatModeButton|cycleRepeatMode/);
  assert.doesNotMatch(personal, /RepeatModeButton|cycleRepeatMode|repeatMode/);
  assert.doesNotMatch(studio, /RepeatModeButton|cycleRepeatMode|repeatMode/);
}

function testMediaSessionAndPersistenceStayManual() {
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  const persist = read("src/lib/listen/desktop-player-persistence.ts");

  assert.match(
    provider,
    /navigator\.mediaSession\.setActionHandler\("nexttrack"/,
  );
  assert.match(provider, /mediaSessionHandlersRef\.current\.nextTrack\(\)/);
  assert.match(provider, /handleNextTrack/);
  assert.doesNotMatch(
    persist,
    /repeat-mode|repeatMode/,
    "repeat is not mixed into desktop session persistence",
  );
}

function testErrorPathDoesNotRepeat() {
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const handleError = sliceBetween(
    player,
    "const handleError = () => {",
    "audio.addEventListener(\"loadedmetadata\", updateDuration);",
  );

  assert.doesNotMatch(handleError, /resolveNaturalEndedRepeatAction/);
  assert.doesNotMatch(handleError, /repeatMode === "one"/);
  assert.doesNotMatch(handleError, /restart-effective-queue/);
}

function main() {
  testParseAndCycle();
  testEndedMatrix();
  testLocalStorageHelpers();
  testAnalyticsNoDuplicateCompletion();
  testHourLongContinuousRepeatStaysDeduped();
  testInactivityGapStartsNewSession();
  testHandleEndedContract();
  testProviderSoT();
  testUiSurfaces();
  testMediaSessionAndPersistenceStayManual();
  testErrorPathDoesNotRepeat();
  console.log("player-repeat-modes-unit: ok");
}

main();
