import assert from "node:assert/strict";

import {
  DEFAULT_PREVIEW_DURATION_MS,
  resolvePlaybackPreviewWindow,
} from "../src/lib/listen/preview-window";

function testStoredWindowWins() {
  const resolved = resolvePlaybackPreviewWindow(
    { previewStartMs: 12_000, previewEndMs: 72_000 },
    180_000,
  );

  assert.equal(resolved.startMs, 12_000);
  assert.equal(resolved.endMs, 72_000);
}

function testFallbackFirstMinute() {
  const resolved = resolvePlaybackPreviewWindow(
    { previewStartMs: null, previewEndMs: null },
    240_000,
  );

  assert.equal(resolved.startMs, 0);
  assert.equal(resolved.endMs, DEFAULT_PREVIEW_DURATION_MS);
}

function testShortTrackFallback() {
  const resolved = resolvePlaybackPreviewWindow(
    { previewStartMs: null, previewEndMs: null },
    20_000,
  );

  assert.equal(resolved.startMs, 0);
  assert.equal(resolved.endMs, 20_000);
}

function testIncompleteWindowFallsBack() {
  const resolved = resolvePlaybackPreviewWindow(
    { previewStartMs: 5_000, previewEndMs: null },
    120_000,
  );

  assert.equal(resolved.startMs, 0);
  assert.equal(resolved.endMs, DEFAULT_PREVIEW_DURATION_MS);
}

testStoredWindowWins();
testFallbackFirstMinute();
testShortTrackFallback();
testIncompleteWindowFallsBack();

console.log("catalog-play-preview-window-unit: ok");
