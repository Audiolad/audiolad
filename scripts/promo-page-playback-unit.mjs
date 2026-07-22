#!/usr/bin/env node
/**
 * Promo page mobile playback regression — pure helpers + static wiring checks.
 */
import { readFileSync } from "node:fs";

import {
  buildPromoPlaybackErrorMessage,
  getPromoProductPlayLabel,
  isPromoAutoplayBlockedHint,
} from "../src/components/promo-pages/usePromoPagePlayback.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testPlayLabels() {
  assert(
    getPromoProductPlayLabel("p1", null, true) === "Запуск…",
    "loading label",
  );
  assert(
    getPromoProductPlayLabel("p1", "p1", false, { isPlaying: true }) ===
      "Слушаете",
    "playing label",
  );
  assert(
    getPromoProductPlayLabel("p1", "p1", false, {
      isPlaying: false,
      needsGesturePlay: true,
    }) === "Воспроизвести",
    "blocked autoplay label",
  );
  assert(
    getPromoProductPlayLabel("p1", "p1", false, { isPlaying: false }) ===
      "Воспроизвести",
    "active but paused shows play CTA",
  );
  assert(
    getPromoProductPlayLabel("p1", null, false) === "Начать слушать",
    "idle label",
  );
}

function testAutoplayHintDetection() {
  assert(
    isPromoAutoplayBlockedHint("Нажмите Play, чтобы начать прослушивание"),
    "play hint detected",
  );
  assert(
    isPromoAutoplayBlockedHint("Нажмите ещё раз, чтобы начать прослушивание."),
    "retry hint detected",
  );
  assert(
    !isPromoAutoplayBlockedHint("Загрузка…"),
    "loading message is not blocked hint",
  );
}

function testErrorMessages() {
  assert(
    buildPromoPlaybackErrorMessage("forbidden").includes("доступ"),
    "forbidden message",
  );
  assert(
    buildPromoPlaybackErrorMessage("no_audio").includes("недоступен"),
    "no_audio message",
  );
}

function testPlaybackWiring() {
  const hook = read("src/components/promo-pages/usePromoPagePlayback.ts");
  const client = read("src/components/promo-pages/PromoPublicPageClient.tsx");
  const form = read("src/components/author-dashboard/AuthorPromoPageForm.tsx");
  const presentation = read("src/components/promo-pages/PromoPagePresentation.tsx");
  const sequential = read("src/components/audio/useSequentialPlayer.ts");

  assert(hook.includes("intentPracticeId"), "pending play intent stored");
  assert(hook.includes("needsGesturePlay"), "gesture fallback state exposed");
  assert(hook.includes("requestGenerationRef"), "stale request guard");
  assert(hook.includes("sessionCacheRef"), "session prefetch cache");
  assert(hook.includes("requestAutoplay: true"), "autoplay still requested");
  assert(
    hook.includes("resumeActiveProduct") &&
      hook.includes("handlePlayTrackAtIndex"),
    "same-track resume uses engine play",
  );
  assert(hook.includes("startedPracticeRef"), "play-started analytics gated");
  assert(
    hook.includes("forceGesturePracticeId"),
    "timeout gesture fallback stored",
  );
  assert(
    client.includes("needsGesturePlay") && client.includes("isPlaying"),
    "client passes play state into labels",
  );
  assert(
    client.includes("trackPromoPagePlayStartedOnce"),
    "play started analytics still wired",
  );
  assert(
    client.includes("onPlayStarted: handlePlayStarted"),
    "analytics callback only via actual start path",
  );
  assert(form.includes("Действие после прослушивания"), "external CTA section preserved");
  assert(form.includes("cta_open_in_new_tab"), "open mode preserved");
  assert(form.includes("https://max.ru"), "MAX placeholder preserved");
  assert(presentation.includes("PromoPageCtaButton"), "cta button preserved");
  assert(
    sequential.includes('debugSnapshot("play-at-index"'),
    "same-track play rejection is logged",
  );
  assert(
    sequential.includes("wasPlayingBeforeSwitchRef.current = true"),
    "missing src keeps play intent",
  );
}

function testThreeGiftsContract() {
  const page = read(
    "src/app/(listener)/promo/[authorSlug]/[promoSlug]/page.tsx",
  );
  const validation = read("src/lib/promo-pages/validation.ts");

  assert(page.includes("PromoPublicPageClient"), "public promo client wired");
  assert(
    validation.includes("PROMO_PAGE_MAX_PRODUCTS") &&
      read("src/lib/promo-pages/validation.ts").includes("= 3"),
    "three gifts max preserved",
  );
}

const tests = [
  ["play labels", testPlayLabels],
  ["autoplay hint detection", testAutoplayHintDetection],
  ["error messages", testErrorMessages],
  ["playback wiring", testPlaybackWiring],
  ["three gifts contract", testThreeGiftsContract],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} promo page playback checks passed`);
