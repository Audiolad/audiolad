import assert from "node:assert/strict";

import { fromAudioPreviewWindowColumns } from "../src/lib/listen/preview-window.ts";
import {
  MAX_STOREFRONT_PREVIEW_MAX_DURATION_MS,
  capMaxStorefrontPreviewWindow,
  resolveCappedMaxPreviewWindow,
} from "../src/lib/max/preview-window.ts";

assert.equal(MAX_STOREFRONT_PREVIEW_MAX_DURATION_MS, 60_000);

const configured15to75 = capMaxStorefrontPreviewWindow({ startMs: 15_000, endMs: 75_000 });
assert.equal(configured15to75.startMs, 15_000);
assert.equal(configured15to75.endMs, 75_000);
assert.equal(configured15to75.durationMs, 60_000);
assert.equal(configured15to75.durationSeconds, 60);

const configured20to50 = capMaxStorefrontPreviewWindow({ startMs: 20_000, endMs: 50_000 });
assert.equal(configured20to50.startMs, 20_000);
assert.equal(configured20to50.endMs, 50_000);
assert.equal(configured20to50.durationMs, 30_000);
assert.equal(configured20to50.durationSeconds, 30);

const configured30to120 = capMaxStorefrontPreviewWindow({ startMs: 30_000, endMs: 120_000 });
assert.equal(configured30to120.startMs, 30_000);
assert.equal(configured30to120.endMs, 90_000);
assert.equal(configured30to120.durationMs, 60_000);

const configured30 = resolveCappedMaxPreviewWindow(
  fromAudioPreviewWindowColumns({ preview_start_ms: 10_000, preview_end_ms: 40_000 }),
);
assert.equal(configured30.durationMs, 30_000);
assert.equal(configured30.startMs, 10_000);
assert.equal(configured30.endMs, 40_000);

const configured90 = resolveCappedMaxPreviewWindow(
  fromAudioPreviewWindowColumns({ preview_start_ms: 20_000, preview_end_ms: 110_000 }),
);
assert.equal(configured90.startMs, 20_000);
assert.equal(configured90.endMs, 80_000);
assert.equal(configured90.durationMs, 60_000);

const fallback = resolveCappedMaxPreviewWindow({
  previewStartMs: null,
  previewEndMs: null,
});
assert.equal(fallback.startMs, 0);
assert.equal(fallback.endMs, 60_000);
assert.equal(fallback.durationMs, 60_000);

const shortTrack = resolveCappedMaxPreviewWindow(
  { previewStartMs: null, previewEndMs: null },
  40_000,
);
assert.equal(shortTrack.startMs, 0);
assert.equal(shortTrack.endMs, 40_000);
assert.equal(shortTrack.durationMs, 40_000);
assert.equal(shortTrack.durationSeconds, 40);

console.log("max-paid-preview-window-unit: ok");
