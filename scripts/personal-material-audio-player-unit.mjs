#!/usr/bin/env node
/**
 * Unit checks for personal material audio player helpers + player contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PERSONAL_AUDIO_COPY,
  SIGNED_URL_REFRESH_MARGIN_MS,
  classifyFetchStatus,
  classifyMediaErrorCode,
  classifyPlayError,
  getSignedUrlRemainingMs,
  isLikelyIosUserAgent,
  isSignedUrlFresh,
  toSafeAudioSrcPath,
} from "../src/lib/personal-materials/guest/audio-player-helpers.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testSignedUrlFreshness() {
  const now = Date.parse("2026-08-05T12:00:00.000Z");

  assert.equal(isSignedUrlFresh(null, now), false);
  assert.equal(isSignedUrlFresh({ url: "", expiresAt: "2026-08-05T12:10:00.000Z" }, now), false);

  assert.equal(
    isSignedUrlFresh(
      { url: "https://audiolad.ru/storage/v1/object/sign/x", expiresAt: "2026-08-05T12:10:00.000Z" },
      now,
    ),
    true,
  );

  // 30s remaining < 60s margin → not fresh
  assert.equal(
    isSignedUrlFresh(
      { url: "https://audiolad.ru/storage/v1/object/sign/x", expiresAt: "2026-08-05T12:00:30.000Z" },
      now,
    ),
    false,
  );

  // exactly margin boundary is not fresh (must be > margin)
  assert.equal(
    isSignedUrlFresh(
      {
        url: "https://audiolad.ru/storage/v1/object/sign/x",
        expiresAt: new Date(now + SIGNED_URL_REFRESH_MARGIN_MS).toISOString(),
      },
      now,
    ),
    false,
  );

  assert.equal(getSignedUrlRemainingMs("not-a-date", now), null);
  assert.equal(getSignedUrlRemainingMs("2026-08-05T12:01:00.000Z", now), 60_000);
}

function testSafeSrcPathStripsQuery() {
  const safe = toSafeAudioSrcPath(
    "https://audiolad.ru/storage/v1/object/sign/bucket/path/file.mp3?token=SECRET_TOKEN&t=1",
  );

  assert.equal(safe, "audiolad.ru/storage/v1/object/sign/bucket/path/file.mp3");
  assert.equal(safe.includes("SECRET_TOKEN"), false);
  assert.equal(safe.includes("?"), false);
  assert.equal(toSafeAudioSrcPath(null), "");
}

function testErrorClassification() {
  assert.equal(classifyPlayError({ name: "NotAllowedError" }).kind, "not_allowed");
  assert.equal(
    classifyPlayError({ name: "NotAllowedError" }).message,
    PERSONAL_AUDIO_COPY.needsGesture,
  );
  assert.equal(classifyPlayError({ name: "NotSupportedError" }).kind, "not_supported");
  assert.equal(classifyPlayError({ name: "AbortError" }).kind, "abort");
  assert.equal(classifyPlayError({ name: "AbortError" }).message, null);
  assert.equal(classifyPlayError({ name: "TypeError" }).kind, "play_failed");
  assert.equal(classifyPlayError({ name: "TypeError" }).message, PERSONAL_AUDIO_COPY.playFailed);

  assert.equal(classifyFetchStatus(401).kind, "auth");
  assert.equal(classifyFetchStatus(403).kind, "auth");
  assert.equal(classifyFetchStatus(404).kind, "unavailable");
  assert.equal(classifyFetchStatus(429).kind, "rate_limited");
  assert.equal(classifyFetchStatus(500).kind, "network");
  assert.equal(classifyFetchStatus(502).message, PERSONAL_AUDIO_COPY.network);

  assert.equal(classifyMediaErrorCode(1).kind, "abort");
  assert.equal(classifyMediaErrorCode(3).kind, "not_supported");
  assert.equal(classifyMediaErrorCode(4).kind, "not_supported");
  assert.equal(classifyMediaErrorCode(2).kind, "network");
}

function testIosUaHelper() {
  assert.equal(
    isLikelyIosUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
    ),
    true,
  );
  assert.equal(
    isLikelyIosUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
    ),
    false,
  );
}

function testPlayerContracts() {
  const player = read(
    "src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx",
  );
  const helpers = read("src/lib/personal-materials/guest/audio-player-helpers.ts");
  const debug = read("src/lib/audio/player-debug.ts");
  const myMaterials = read(
    "src/components/personal-materials/library/MyMaterialDetailClient.tsx",
  );
  const guest = read(
    "src/components/personal-materials/guest/PersonalMaterialGuestPage.tsx",
  );

  assert.match(player, /stage: "prefetch"/);
  assert.match(player, /fatalOnError: false/);
  assert.match(player, /isSourcePrepared\(\)/);
  assert.match(player, /NotAllowedError|needs_gesture|needsGesture/);
  assert.match(player, /PERSONAL_AUDIO_COPY\.needsGesture/);
  assert.match(player, /addEventListener\("error"/);
  assert.match(player, /addEventListener\("canplay"/);
  assert.match(player, /addEventListener\("stalled"/);
  assert.match(player, /addEventListener\("waiting"/);
  assert.match(player, /inFlightFetchRef/);
  playInFlightGuard(player);
  assert.match(player, /fetchEpochRef/);
  assert.match(player, /logPlayerDebug/);
  assert.match(player, /toSafeAudioSrcPath/);
  assert.match(player, /Попробовать снова|PERSONAL_AUDIO_COPY\.retry/);
  assert.match(player, /iosSafariFallback/);
  assert.equal(player.includes("createElement(\"audio\")"), false);
  assert.equal(player.includes("new Audio("), false);

  // Gesture-safe path: when prepared, call requestPlay(false) before any ensurePreparedSource.
  const playHandlerIdx = player.indexOf("const handlePlayPause");
  const playHandlerEnd = player.indexOf("const handleRetry", playHandlerIdx);
  const playHandler = player.slice(playHandlerIdx, playHandlerEnd);
  const preparedIdx = playHandler.indexOf("if (isSourcePrepared())");
  const requestPlayIdx = playHandler.indexOf("await requestPlay(false)", preparedIdx);
  const ensureIdx = playHandler.indexOf("await ensurePreparedSource", preparedIdx);
  assert.ok(preparedIdx >= 0, "prepared guard exists");
  assert.ok(requestPlayIdx > preparedIdx, "prepared path requests play");
  assert.ok(
    ensureIdx > requestPlayIdx,
    "ensurePreparedSource must come after prepared requestPlay(false)",
  );

  assert.match(helpers, /SIGNED_URL_REFRESH_MARGIN_MS = 60_000/);
  assert.match(debug, /fields\?:/);
  assert.match(myMaterials, /PersonalMaterialAudioPlayer/);
  assert.match(guest, /PersonalMaterialAudioPlayer/);

  // No full-token logging helpers that stringify signed url wholesale in debug fields.
  assert.equal(player.includes("fields: {\n            url:"), false);
  assert.equal(player.includes("signed.url"), true); // used for assign/compare only
}

function playInFlightGuard(player) {
  assert.match(player, /playInFlightRef/);
  assert.match(player, /play_ignored_in_flight/);
}

function testDebugExtensionDoesNotBreakShape() {
  const debug = read("src/lib/audio/player-debug.ts");
  assert.match(debug, /export function logPlayerDebug/);
  assert.match(debug, /export function isPlayerDebugEnabled/);
  assert.match(debug, /export function getPlayerDebugLogText/);
  assert.match(debug, /\.get\("debug"\) === "player"/);
}

testSignedUrlFreshness();
testSafeSrcPathStripsQuery();
testErrorClassification();
testIosUaHelper();
testPlayerContracts();
testDebugExtensionDoesNotBreakShape();

console.log("personal-material-audio-player-unit: ok");
