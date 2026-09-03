#!/usr/bin/env node
/**
 * Product-specific persisted state vs Catalog/PDP forceStartAtBeginning.
 * Reproduces the «Поток Изобилия» real-client path without a browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { shouldToggleActiveCatalogPlay } from "../src/lib/catalog/should-toggle-active-catalog-play";
import { resolveSameKeySessionAction } from "../src/lib/listen/resolve-same-key-session-action";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const POTOK_DURATION = 484.885;
const NEAR_END_POSITION = 480;

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function testForceStartOrderInHook() {
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const start = player.indexOf("const initialPlayback = useMemo(() => {");
  const end = player.indexOf("const [currentTrackIndex, setCurrentTrackIndex]", start);
  assert.ok(start >= 0 && end > start, "initialPlayback memo exists");
  const body = player.slice(start, end);

  const previewIdx = body.indexOf("if (hasPreviewWindow)");
  const forceIdx = body.indexOf("if (forceStartAtBeginning)");
  const trackIdx = body.indexOf("if (initialTrackId)");
  const resolveIdx = body.indexOf("return resolveInitialPlayback(tracks, initialProgress)");

  assert.ok(previewIdx >= 0 && forceIdx > previewIdx, "forceStart is after preview window");
  assert.ok(trackIdx > forceIdx, "initialTrackId is after forceStart");
  assert.ok(resolveIdx > trackIdx, "progress resume is last");
  assert.match(
    body.slice(forceIdx, trackIdx),
    /positionSeconds:\s*0/,
    "forceStart selects position 0 before progress merge",
  );
}

function testFreshContextDoesNotToggle() {
  assert.equal(
    shouldToggleActiveCatalogPlay({
      sessionMatchesProduct: false,
      hasEngine: false,
      isPlaying: false,
      forceStartAtBeginning: false,
    }),
    false,
    "A. no persisted session → Catalog/PDP must loadSession",
  );
}

function testRestoredPotokDoesNotToggle() {
  assert.equal(
    shouldToggleActiveCatalogPlay({
      sessionMatchesProduct: true,
      hasEngine: true,
      isPlaying: false,
      forceStartAtBeginning: false,
    }),
    false,
    "B. restored last-session match must not handlePlayPause",
  );
}

function testCatalogStartedSessionToggles() {
  assert.equal(
    shouldToggleActiveCatalogPlay({
      sessionMatchesProduct: true,
      hasEngine: true,
      isPlaying: false,
      forceStartAtBeginning: true,
    }),
    true,
    "already-started Catalog/PDP session may pause/resume",
  );
  assert.equal(
    shouldToggleActiveCatalogPlay({
      sessionMatchesProduct: true,
      hasEngine: true,
      isPlaying: true,
      forceStartAtBeginning: false,
    }),
    true,
    "currently playing restored session may pause",
  );
}

function testDesktopSnapshotThresholds() {
  const persist = read("src/lib/listen/desktop-player-persistence.ts");
  assert.match(
    persist,
    /const COMPLETION_THRESHOLD_SECONDS = 2/,
    "desktop snapshot uses a 2s completion threshold",
  );
  assert.match(
    persist,
    /snapshotPosition >= duration - COMPLETION_THRESHOLD_SECONDS/,
    "near-end snapshot is skipped only at duration-2",
  );
  assert.match(
    persist,
    /snapshot.practiceId !== session.practiceId/,
    "snapshot applies only to the matching practiceId",
  );
  assert.match(
    persist,
    /item.id === snapshot.audioItemId/,
    "G. stale audioItemId cannot attach to another track",
  );
  assert.match(
    persist,
    /playbackMode: snapshot.playbackMode \?\? "full"/,
    "I. old playbackMode is re-applied on restore",
  );

  const completionCutoff = POTOK_DURATION - 2;
  assert.ok(
    NEAR_END_POSITION < completionCutoff,
    `E. ${NEAR_END_POSITION} of ${POTOK_DURATION} is below ${completionCutoff} and would be merged on restore`,
  );
  assert.ok(
    483.5 >= completionCutoff,
    "E+. 483.5 is at/over the threshold and would not be merged",
  );

  const guest = read("src/lib/promo/guest-progress.ts");
  assert.match(guest, /audiolad_gp:/, "J. guest progress is keyed per practiceId");
  assert.match(guest, /completed: progress.completed/, "J. completed guest rows become listen entries");

  const loadSession = read("src/lib/listen/load-session-payload.ts");
  assert.match(
    loadSession,
    /if \(userId && !options\?\.forceStartAtBeginning\)/,
    "K. server progress is skipped only when forceStart is requested at load time",
  );
  assert.match(
    read("src/components/audio/GlobalAudioPlayerProvider.tsx"),
    /mergeDesktopPlaybackIntoSession/,
    "L. restore re-applies desktop snapshot after the listen session payload",
  );
  assert.match(
    read("src/components/audio/GlobalAudioPlayerProvider.tsx"),
    /guestProgressToListenEntries/,
    "L. restore then merges guest progress into initialProgress",
  );
}

function testSameKeyForceStartRemounts() {
  assert.equal(
    resolveSameKeySessionAction({
      trackSelectionChanged: false,
      requestAutoplay: true,
      currentRequestAutoplay: false,
      preservePlayback: false,
      forceStartAtBeginning: true,
      currentForceStartAtBeginning: false,
    }),
    "same_key_bump",
    "Catalog/PDP forceStart on a restored session remounts the engine",
  );

  assert.equal(
    resolveSameKeySessionAction({
      trackSelectionChanged: false,
      requestAutoplay: true,
      currentRequestAutoplay: false,
      preservePlayback: false,
      forceStartAtBeginning: false,
      currentForceStartAtBeginning: false,
    }),
    "autoplay_intent_bump",
    "listen autoplay without forceStart still keeps the mounted engine",
  );

  assert.equal(
    resolveSameKeySessionAction({
      trackSelectionChanged: false,
      requestAutoplay: true,
      currentRequestAutoplay: true,
      preservePlayback: false,
      forceStartAtBeginning: true,
      currentForceStartAtBeginning: true,
    }),
    "noop",
    "repeat Catalog Play on an already-forced session is a no-op at loadSession",
  );

  assert.equal(
    resolveSameKeySessionAction({
      trackSelectionChanged: false,
      requestAutoplay: true,
      currentRequestAutoplay: false,
      preservePlayback: true,
      forceStartAtBeginning: true,
      currentForceStartAtBeginning: false,
    }),
    "preserve_playback",
    "queue handoff preservePlayback still wins",
  );
}

function testCriticalQuestion() {
  const restoredClickable = shouldToggleActiveCatalogPlay({
    sessionMatchesProduct: true,
    hasEngine: true,
    isPlaying: false,
    forceStartAtBeginning: false,
  });
  const loadAction = resolveSameKeySessionAction({
    trackSelectionChanged: false,
    requestAutoplay: true,
    currentRequestAutoplay: false,
    preservePlayback: false,
    forceStartAtBeginning: true,
    currentForceStartAtBeginning: false,
  });

  assert.equal(
    restoredClickable,
    false,
    "restored Potok is clickable but must not silent-toggle",
  );
  assert.equal(loadAction, "same_key_bump", "forceStart remounts leftover restore state");

  const player = read("src/components/audio/useSequentialPlayer.ts");
  const playPause = player.slice(
    player.indexOf("const handlePlayPause = async () => {"),
    player.indexOf("const requestAutoplayIntent = useCallback"),
  );
  assert.match(
    playPause,
    /if \(!audio \|\| !src\) \{\s*return;/,
    "handlePlayPause no-ops when restored session has no src yet",
  );
}

function testWiring() {
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  const catalog = read("src/components/products/CatalogProductPlayButton.tsx");
  const pdp = read("src/components/products/practice-page/PracticeListenCtaLink.tsx");

  assert.match(provider, /resolveSameKeySessionAction/);
  assert.match(catalog, /shouldToggleActiveCatalogPlay/);
  assert.match(pdp, /shouldToggleActiveCatalogPlay/);
  assert.match(
    provider,
    /mergeGuestProgressIntoSession/,
    "restore still merges desktop + guest progress",
  );
  assert.match(
    provider,
    /requestAutoplay:\s*false/,
    "restore still loads without autoplay",
  );
}

function testSwDoesNotCacheProductOrPlay() {
  const sw = read("public/sw.js");
  assert.match(sw, /NEVER_CACHE_PREFIXES/);
  assert.match(sw, /"\/api\/"/);
  assert.match(sw, /request.mode === "navigate"/);
  assert.doesNotMatch(
    sw,
    /potok-izobiliya/,
    "SW has no product-specific cache rule",
  );
}

testForceStartOrderInHook();
testFreshContextDoesNotToggle();
testRestoredPotokDoesNotToggle();
testCatalogStartedSessionToggles();
testDesktopSnapshotThresholds();
testSameKeyForceStartRemounts();
testCriticalQuestion();
testWiring();
testSwDoesNotCacheProductOrPlay();

console.log("catalog-play-persisted-state-unit: ok");
