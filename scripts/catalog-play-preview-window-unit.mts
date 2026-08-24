import assert from "node:assert/strict";

import {
  audioPreviewNeedsSetup,
  COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS,
  isConfiguredStorefrontPreviewWindow,
  resolvePlaybackPreviewWindow,
} from "../src/lib/listen/preview-window";

function testStoredWindowWins() {
  const window = { previewStartMs: 12_000, previewEndMs: 72_000 };
  const resolved = resolvePlaybackPreviewWindow(window, 180_000);

  assert.equal(resolved.startMs, 12_000);
  assert.equal(resolved.endMs, 72_000);
  assert.equal(resolved.needsSetup, false);
  assert.equal(resolved.source, "configured");
  assert.equal(isConfiguredStorefrontPreviewWindow(window), true);
  assert.equal(audioPreviewNeedsSetup(window), false);
}

function testFallbackFirstMinute() {
  const window = { previewStartMs: null, previewEndMs: null };
  const resolved = resolvePlaybackPreviewWindow(window, 240_000);

  assert.equal(resolved.startMs, 0);
  assert.equal(resolved.endMs, COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS);
  assert.equal(resolved.needsSetup, true);
  assert.equal(resolved.source, "compatibility_fallback");
  assert.equal(audioPreviewNeedsSetup(window), true);
  assert.equal(isConfiguredStorefrontPreviewWindow(window), false);
}

function testShortTrackFallback() {
  const resolved = resolvePlaybackPreviewWindow(
    { previewStartMs: null, previewEndMs: null },
    20_000,
  );

  assert.equal(resolved.startMs, 0);
  assert.equal(resolved.endMs, 20_000);
  assert.equal(resolved.needsSetup, true);
  assert.equal(resolved.source, "compatibility_fallback");
}

function testIncompleteWindowFallsBack() {
  const window = { previewStartMs: 5_000, previewEndMs: null };
  const resolved = resolvePlaybackPreviewWindow(window, 120_000);

  assert.equal(resolved.startMs, 0);
  assert.equal(resolved.endMs, COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS);
  assert.equal(resolved.needsSetup, true);
  assert.equal(audioPreviewNeedsSetup(window), true);
}

testStoredWindowWins();
testFallbackFirstMinute();
testShortTrackFallback();
testIncompleteWindowFallsBack();

console.log("catalog-play-preview-window-unit: ok");
