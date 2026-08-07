#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  getStudioClipEnd,
  getStudioClipLayout,
  getStudioClipMoveLayout,
  getStudioClipSnapTime,
  getStudioClipTrimEndLayout,
  getStudioClipTrimStartLayout,
} from "../src/lib/studio/clip-math.ts";

assert.deepEqual(getStudioClipLayout({}, 12), {
  startTime: 0,
  offset: 0,
  duration: 12,
});
assert.deepEqual(
  getStudioClipLayout({ startTime: -3, offset: 20, duration: Infinity }, 12),
  { startTime: 0, offset: 12, duration: 0 },
);
assert.deepEqual(
  getStudioClipLayout({ startTime: 3, offset: 2, duration: 30 }, 12),
  { startTime: 3, offset: 2, duration: 10 },
);
assert.equal(getStudioClipEnd({ startTime: 3, offset: 2, duration: 10 }), 13);

assert.equal(
  getStudioClipSnapTime({
    requestedTime: 4.91,
    pixelsPerSecond: 100,
    targets: [0, 5, 8],
  }),
  5,
);
assert.equal(
  getStudioClipSnapTime({
    requestedTime: 4.91,
    pixelsPerSecond: 100,
    targets: [5],
    bypass: true,
  }),
  4.91,
);
assert.equal(
  getStudioClipSnapTime({
    requestedTime: 4.7,
    pixelsPerSecond: 100,
    targets: [5],
  }),
  4.7,
);

const layout = { startTime: 2, offset: 1, duration: 5 };
assert.deepEqual(
  getStudioClipMoveLayout({
    layout,
    bufferDuration: 12,
    requestedStartTime: 4.94,
    snapTargets: [0, 5, 9],
    pixelsPerSecond: 100,
  }),
  { ...layout, startTime: 5 },
);
assert.deepEqual(
  getStudioClipTrimStartLayout({
    layout,
    bufferDuration: 12,
    requestedStartTime: 3,
    snapTargets: [0],
    pixelsPerSecond: 100,
  }),
  { startTime: 3, offset: 2, duration: 4 },
);
assert.deepEqual(
  getStudioClipTrimStartLayout({
    layout,
    bufferDuration: 12,
    requestedStartTime: -10,
    snapTargets: [0],
    pixelsPerSecond: 100,
  }),
  { startTime: 1, offset: 0, duration: 6 },
);
assert.deepEqual(
  getStudioClipTrimEndLayout({
    layout,
    bufferDuration: 12,
    requestedEndTime: 20,
    snapTargets: [0],
    pixelsPerSecond: 100,
  }),
  { startTime: 2, offset: 1, duration: 11 },
);

console.log("studio-clip-math-unit: ok");
