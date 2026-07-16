#!/usr/bin/env node
/**
 * Listen autoplay intent unit checks — no browser required.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testAutoplayIntentModule() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/listen/autoplay-intent.ts",
    "utf8",
  );

  assert(source.includes('LISTEN_AUTOPLAY_QUERY_VALUE = "1"'), "canonical value is 1");
  assert(source.includes("parseListenAutoplayIntent"), "parser exists");
  assert(source.includes('value === LISTEN_AUTOPLAY_QUERY_VALUE'), "strict parse");
}

function testBuildListenPath() {
  const paths = readFileSync(
    "/var/www/audiolad/src/lib/products/paths.ts",
    "utf8",
  );

  assert(paths.includes("LISTEN_AUTOPLAY_QUERY_PARAM"), "uses shared param name");
  assert(paths.includes("shouldRequestListenAutoplay"), "uses shared autoplay helper");
}

function testGuestPracticeCtaIncludesAutoplay() {
  const ui = readFileSync(
    "/var/www/audiolad/src/lib/products/practice-access-ui.ts",
    "utf8",
  );

  assert(ui.includes('autoplay: true'), "guest CTA enables autoplay");
  assert(ui.includes('"Начать слушать"'), "guest label preserved");
  assert(!ui.includes("autoplay: !guestListenWithoutAutoplay"), "removed guest autoplay block");
}

function testListenPageClientPassesAutoplay() {
  const client = readFileSync(
    "/var/www/audiolad/src/components/audio/ListenPageClient.tsx",
    "utf8",
  );

  assert(client.includes("requestAutoplay: autoplay"), "URL autoplay forwarded directly");
}

function testListenRouteParser() {
  const page = readFileSync(
    "/var/www/audiolad/src/app/listen/[...segments]/page.tsx",
    "utf8",
  );

  assert(page.includes("parseListenAutoplayIntent"), "route uses shared parser");
}

function testSequentialPlayerAutoplayOnce() {
  const player = readFileSync(
    "/var/www/audiolad/src/components/audio/useSequentialPlayer.ts",
    "utf8",
  );

  assert(player.includes("initialAutoplayAttemptedRef"), "single autoplay attempt guard");
  assert(player.includes("initialAutoplayPendingRef"), "pending autoplay flag");
  assert(player.includes("restartPlaybackFromBeginning"), "restart helper exists");
  assert(player.includes("autoPlay: true"), "restart requests playback");
  assert(player.includes("clearGuestPracticeProgress"), "guest restart clears local progress");
}

function testStartOverFromClick() {
  const audioPlayer = readFileSync(
    "/var/www/audiolad/src/components/audio/AudioPlayer.tsx",
    "utf8",
  );
  const promo = readFileSync(
    "/var/www/audiolad/src/components/promo/PromoPlaybackPrompts.tsx",
    "utf8",
  );

  assert(audioPlayer.includes("onClick={() => void handleStartOver()}"), "start over wired");
  assert(promo.includes("onClick={onReplay}"), "replay button wired");
  assert(audioPlayer.includes("onReplay={() => void handleStartOver()}"), "promo replay uses start over");
}

function testPlayRejectionHandling() {
  const player = readFileSync(
    "/var/www/audiolad/src/components/audio/useSequentialPlayer.ts",
    "utf8",
  );

  assert(
    player.includes('setAutoplayHint("Нажмите Play, чтобы начать прослушивание")'),
    "autoplay rejection leaves paused hint",
  );
  assert(player.includes("userWantsPlaybackRef.current = false"), "clears playback intent on rejection");
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
  console.log("listen-autoplay-unit: ok");
}

main();
