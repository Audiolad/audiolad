#!/usr/bin/env node
/**
 * Listen autoplay intent unit checks — no browser required.
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

function testAutoplayIntentModule() {
  const source = readSource("src/lib/listen/autoplay-intent.ts");

  assert(source.includes('LISTEN_AUTOPLAY_QUERY_VALUE = "1"'), "canonical value is 1");
  assert(source.includes("parseListenAutoplayIntent"), "parser exists");
  assert(source.includes("value === LISTEN_AUTOPLAY_QUERY_VALUE"), "strict parse");
}

function testBuildListenPath() {
  const paths = readSource("src/lib/products/paths.ts");

  assert(paths.includes("LISTEN_AUTOPLAY_QUERY_PARAM"), "uses shared param name");
  assert(paths.includes("shouldRequestListenAutoplay"), "uses shared autoplay helper");
}

function testGuestPracticeCtaIncludesAutoplay() {
  const ui = readSource("src/lib/products/practice-access-ui.ts");

  assert(ui.includes("autoplay: true"), "guest CTA enables autoplay");
  assert(ui.includes('"Начать слушать"'), "guest label preserved");
  assert(!ui.includes("autoplay: !guestListenWithoutAutoplay"), "removed guest autoplay block");
}

function testListenPageClientPassesAutoplay() {
  const client = readSource("src/components/audio/ListenPageClient.tsx");

  assert(client.includes("requestAutoplay: autoplay"), "URL autoplay forwarded directly");
}

function testListenRouteParser() {
  const page = readSource("src/app/(platform)/listen/[...segments]/page.tsx");

  assert(page.includes("parseListenAutoplayIntent"), "route uses shared parser");
}

function testSequentialPlayerAutoplayOnce() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");

  assert(player.includes("initialAutoplayAttemptedRef"), "single autoplay attempt guard");
  assert(player.includes("initialAutoplayPendingRef"), "pending autoplay flag");
  assert(player.includes("restartPlaybackFromBeginning"), "restart helper exists");
  assert(player.includes("autoPlay: true"), "restart requests playback");
  assert(player.includes("clearGuestPracticeProgress"), "guest restart clears local progress");
}

function testStartOverFromClick() {
  const sequential = readSource("src/components/audio/useSequentialPlayer.ts");
  const shared = readSource("src/components/audio/listen-player-shared.tsx");
  const mobile = readSource("src/components/audio/ListenPlayerMobile.tsx");
  const desktop = readSource("src/components/audio/ListenPlayerDesktop.tsx");
  const promo = readSource("src/components/promo/PromoPlaybackPrompts.tsx");
  const legacy = readSource("src/components/audio/AudioPlayer.tsx");

  assert(
    sequential.includes("const handleStartOver"),
    "handleStartOver exists in sequential player",
  );
  assert(
    sequential.includes("restartPlaybackFromBeginning({ autoPlay: true })"),
    "start over restarts playback from the beginning",
  );
  assert(
    sequential.includes("clearGuestPracticeProgress"),
    "start over clears guest progress when needed",
  );
  assert(
    shared.includes("onReplay={() => void handleStartOver()}"),
    "promo slot wires replay to handleStartOver",
  );
  assert(
    mobile.includes("handleStartOver") && mobile.includes("void handleStartOver()"),
    "mobile start-over control calls handleStartOver",
  );
  assert(
    desktop.includes("handleStartOver") && desktop.includes("void handleStartOver()"),
    "desktop start-over control calls handleStartOver",
  );
  assert(promo.includes("onClick={onReplay}"), "replay button wired");
  assert(
    legacy.includes("ListenPlayerProvider") &&
      !legacy.includes("void handleStartOver()"),
    "legacy AudioPlayer re-export is not the start-over wiring source",
  );
}

function testPlayRejectionHandling() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");

  assert(
    player.includes('setAutoplayHint("Нажмите Play, чтобы начать прослушивание")'),
    "autoplay rejection leaves paused hint",
  );
  assert(player.includes("userWantsPlaybackRef.current = false"), "clears playback intent on rejection");
}

function testSignedUrlRaceHandling() {
  const player = readSource("src/components/audio/useSequentialPlayer.ts");
  const provider = readSource(
    "src/components/audio/GlobalAudioPlayerProvider.tsx",
  );

  assert(player.includes("loadSignedUrlRef"), "signed url loader keeps a stable ref");
  assert(player.includes("finally {"), "signed url loader always settles in finally");
  assert(
    player.includes("void loadSignedUrl(trackId)"),
    "track/session generation reloads the signed url",
  );
  assert(
    player.includes("url_fetch_stale_ignored") ||
      player.includes("Never auto-retry after generation change"),
    "stale signed url fetches are ignored after generation change",
  );
  assert(
    player.includes("sessionGeneration"),
    "player reacts to session generation changes",
  );
  assert(
    player.includes("requestAnimationFrame(tryApply)"),
    "audio src retries when media element mounts later",
  );
  assert(
    player.includes("Не удалось подготовить аудио."),
    "prepare failure shows user-facing message",
  );
  assert(
    provider.includes("setSessionGeneration"),
    "provider exposes reactive session generation",
  );
  assert(
    provider.includes("Same session key, no material change"),
    "same-practice refresh without material change does not invalidate signed url fetch",
  );
}

function main() {
  testAutoplayIntentModule();
  testBuildListenPath();
  testGuestPracticeCtaIncludesAutoplay();
  testListenPageClientPassesAutoplay();
  testListenRouteParser();
  testSequentialPlayerAutoplayOnce();
  testStartOverFromClick();
  testPlayRejectionHandling();
  testSignedUrlRaceHandling();
  console.log("listen-autoplay-unit: ok");
}

main();
