#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  MIN_STUDIO_CLIP_DURATION,
  getStudioClipEnd,
  getStudioClipLayout,
  getStudioClipMoveLayout,
  getStudioRippleDeleteResult,
  getStudioClipSnapCandidates,
  getStudioClipSnapTime,
  getStudioProjectDurationFromClips,
  getStudioSameTrackBounds,
  getStudioClipTrimEndLayout,
  getStudioClipTrimStartLayout,
  splitStudioClip,
  studioClipOverlapsAny,
  studioClipRangesOverlap,
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

const firstClip = {
  id: "first",
  startTime: 2,
  offset: 1,
  duration: 6,
  fadeInDuration: 2,
  fadeOutDuration: 3,
};
const split = splitStudioClip(firstClip, 5, "right");
assert.ok(split);
assert.deepEqual(split.left, {
  ...firstClip,
  duration: 3,
  fadeOutDuration: 0,
});
assert.deepEqual(
  { ...split.right, id: "generated" },
  {
    ...firstClip,
    id: "generated",
    startTime: 5,
    offset: 4,
    duration: 3,
    fadeInDuration: 0,
  },
);
assert.equal(splitStudioClip(firstClip, 2 + MIN_STUDIO_CLIP_DURATION, "right"), null);
assert.equal(splitStudioClip(firstClip, 8 - MIN_STUDIO_CLIP_DURATION, "right"), null);
const rippleClips = [
  { ...firstClip, id: "removed", startTime: 0, duration: 4 },
  { ...firstClip, id: "next", startTime: 6, duration: 3 },
  { ...firstClip, id: "last", startTime: 12, duration: 2 },
];
const ripple = getStudioRippleDeleteResult(rippleClips, "removed");
assert.ok(ripple);
assert.equal(ripple.removedClip.id, "removed");
assert.deepEqual(
  ripple.clips.map((clip) => [clip.id, clip.startTime]),
  [
    ["next", 2],
    ["last", 8],
  ],
);
assert.equal(getStudioRippleDeleteResult(rippleClips, "missing"), null);
assert.deepEqual(
  getStudioSameTrackBounds(
    { ...firstClip, id: "middle", startTime: 5, duration: 2 },
    [
      { ...firstClip, id: "before", startTime: 0, duration: 4 },
      { ...firstClip, id: "middle", startTime: 5, duration: 2 },
      { ...firstClip, id: "after", startTime: 8, duration: 3 },
    ],
  ),
  { previousEnd: 4, nextStart: 8 },
);
assert.deepEqual(
  getStudioClipMoveLayout({
    layout: { startTime: 5, offset: 0, duration: 2 },
    bufferDuration: 20,
    requestedStartTime: 7.95,
    snapTargets: [8],
    pixelsPerSecond: 100,
    collisionBounds: { previousEnd: 4, nextStart: 8 },
  }),
  { startTime: 6, offset: 0, duration: 2 },
);
assert.deepEqual(getStudioClipSnapCandidates([
  { id: "one", startTime: 2, offset: 0, duration: 3 },
  { id: "two", startTime: 8, offset: 0, duration: 4 },
], "one"), [0, 8, 12]);
assert.equal(
  getStudioProjectDurationFromClips([
    { clips: [{ id: "one", startTime: 2, offset: 0, duration: 3 }] },
    { clips: [{ id: "two", startTime: 8, offset: 0, duration: 4 }] },
  ]),
  12,
);

assert.equal(
  studioClipRangesOverlap(
    { startTime: 0, offset: 0, duration: 3 },
    { startTime: 3, offset: 0, duration: 3 },
  ),
  false,
);
assert.equal(
  studioClipRangesOverlap(
    { startTime: 0, offset: 0, duration: 3 },
    { startTime: 2.9, offset: 0, duration: 3 },
  ),
  true,
);
assert.equal(
  studioClipOverlapsAny(
    { startTime: 3, offset: 0, duration: 3 },
    [{ startTime: 0, offset: 0, duration: 3 }, { startTime: 6, offset: 0, duration: 3 }],
  ),
  false,
);
assert.equal(
  studioClipOverlapsAny(
    { startTime: 3, offset: 0, duration: 3 },
    [{ startTime: 0, offset: 0, duration: 3 }, { startTime: 5, offset: 0, duration: 3 }],
  ),
  true,
);

console.log("studio-clip-math-unit: ok");
