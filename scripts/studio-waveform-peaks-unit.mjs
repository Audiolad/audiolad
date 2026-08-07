#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  getCachedWaveformPeaks,
  getWaveformPeaks,
} from "../src/lib/studio/waveform-peaks.ts";

const buffer = {
  numberOfChannels: 2,
  length: 8,
  getChannelData(channel) {
    return channel === 0
      ? Float32Array.from([0, 0.5, -0.8, 0.2, 0.1, -0.4, 0.9, 0])
      : Float32Array.from([0, -0.3, 0.1, 0.7, -0.6, 0.2, 0.4, 0]);
  },
};

const peaks = getWaveformPeaks(buffer, 4);
for (const [index, expected] of [-0.3, -0.8, -0.6, 0].entries()) {
  assert.ok(Math.abs(peaks.minimums[index] - expected) < 0.000_001);
}
for (const [index, expected] of [0.5, 0.7, 0.2, 0.9].entries()) {
  assert.ok(Math.abs(peaks.maximums[index] - expected) < 0.000_001);
}

const cached = getCachedWaveformPeaks(buffer, 4);
assert.strictEqual(
  cached,
  getCachedWaveformPeaks(buffer, 4),
  "same buffer and detail reuse cached peaks",
);
assert.notStrictEqual(
  cached,
  getCachedWaveformPeaks(buffer, 8),
  "different detail receives a separate cached peak set",
);
const replacementBuffer = { ...buffer };
assert.notStrictEqual(
  cached,
  getCachedWaveformPeaks(replacementBuffer, 4),
  "a replacement buffer invalidates the old buffer cache",
);

console.log("studio-waveform-peaks-unit: ok");
