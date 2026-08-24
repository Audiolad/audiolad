import assert from "node:assert/strict";

import {
  fromAudioPreviewWindowColumns,
  PREVIEW_DURATION_MAX_MS,
  PREVIEW_DURATION_MIN_MS,
  previewWindowDurationMs,
  toAudioPreviewWindowColumns,
  validateAudioPreviewWindow,
} from "../src/lib/listen/preview-window";

function testEmptyWindowPersists() {
  const window = { previewStartMs: null, previewEndMs: null };
  const columns = toAudioPreviewWindowColumns(window);
  assert.deepEqual(columns, {
    preview_start_ms: null,
    preview_end_ms: null,
  });
  assert.deepEqual(fromAudioPreviewWindowColumns(columns), window);
  assert.equal(validateAudioPreviewWindow(window).ok, true);
}

function testValidWindowPersists() {
  const window = { previewStartMs: 15_000, previewEndMs: 75_000 };
  const columns = toAudioPreviewWindowColumns(window);
  const restored = fromAudioPreviewWindowColumns(columns);

  assert.deepEqual(columns, {
    preview_start_ms: 15_000,
    preview_end_ms: 75_000,
  });
  assert.deepEqual(restored, window);
  assert.equal(previewWindowDurationMs(restored), 60_000);
  assert.equal(validateAudioPreviewWindow(restored).ok, true);
}

function testBoundaryDurations() {
  assert.equal(
    validateAudioPreviewWindow({
      previewStartMs: 0,
      previewEndMs: PREVIEW_DURATION_MIN_MS,
    }).ok,
    true,
  );
  assert.equal(
    validateAudioPreviewWindow({
      previewStartMs: 1_000,
      previewEndMs: 1_000 + PREVIEW_DURATION_MAX_MS,
    }).ok,
    true,
  );
}

function testInvalidDurations() {
  assert.equal(
    validateAudioPreviewWindow({
      previewStartMs: 0,
      previewEndMs: PREVIEW_DURATION_MIN_MS - 1,
    }).ok,
    false,
  );
  assert.equal(
    validateAudioPreviewWindow({
      previewStartMs: 0,
      previewEndMs: PREVIEW_DURATION_MAX_MS + 1,
    }).ok,
    false,
  );
  assert.equal(
    validateAudioPreviewWindow({
      previewStartMs: 10_000,
      previewEndMs: 10_000,
    }).ok,
    false,
  );
  assert.equal(
    validateAudioPreviewWindow({
      previewStartMs: -1,
      previewEndMs: 30_000,
    }).ok,
    false,
  );
  assert.equal(
    validateAudioPreviewWindow({
      previewStartMs: 0,
      previewEndMs: null,
    }).ok,
    false,
  );
}

testEmptyWindowPersists();
testValidWindowPersists();
testBoundaryDurations();
testInvalidDurations();

console.log("catalog-foundation-preview-window-unit: ok");
