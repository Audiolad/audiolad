#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  clampStudioClipFades,
  getStudioDefaultFadeDuration,
  getStudioFadeEnvelope,
  isStudioContiguousSourceSeam,
  resolveStudioPlaybackClipFades,
  STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS,
} from "../src/lib/studio/fade-math.ts";
import { splitStudioClip } from "../src/lib/studio/clip-math.ts";

assert.deepEqual(clampStudioClipFades({}, 10), {
  fadeInDuration: 0,
  fadeOutDuration: 0,
});
assert.deepEqual(clampStudioClipFades({ fadeInDuration: 3, fadeOutDuration: 1 }, 10), {
  fadeInDuration: 3,
  fadeOutDuration: 1,
});
assert.deepEqual(clampStudioClipFades({ fadeInDuration: 6, fadeOutDuration: 3 }, 6), {
  fadeInDuration: 4,
  fadeOutDuration: 2,
});
assert.deepEqual(clampStudioClipFades({ fadeInDuration: 8, fadeOutDuration: 0 }, 3), {
  fadeInDuration: 3,
  fadeOutDuration: 0,
});
assert.deepEqual(clampStudioClipFades({ fadeInDuration: 0, fadeOutDuration: 8 }, 3), {
  fadeInDuration: 0,
  fadeOutDuration: 3,
});
const veryShortClipFades = clampStudioClipFades(
  { fadeInDuration: 4, fadeOutDuration: 2 },
  0.3,
);
assert.ok(Math.abs(veryShortClipFades.fadeInDuration - 0.2) < 1e-9);
assert.ok(Math.abs(veryShortClipFades.fadeOutDuration - 0.1) < 1e-9);
assert.deepEqual(
  clampStudioClipFades({ fadeInDuration: 2, fadeOutDuration: 1 }, 1),
  { fadeInDuration: 2 / 3, fadeOutDuration: 1 / 3 },
);
assert.deepEqual(
  clampStudioClipFades({ fadeInDuration: 2, fadeOutDuration: 1 }, 12),
  { fadeInDuration: 2, fadeOutDuration: 1 },
);
assert.deepEqual(
  clampStudioClipFades({ fadeInDuration: Number.POSITIVE_INFINITY, fadeOutDuration: -2 }, 6),
  { fadeInDuration: 0, fadeOutDuration: 0 },
);
assert.equal(getStudioDefaultFadeDuration(30), 2);
assert.equal(getStudioDefaultFadeDuration(5), 0.5);
assert.equal(getStudioFadeEnvelope(0, 10, { fadeInDuration: 2, fadeOutDuration: 3 }), 0);
assert.equal(getStudioFadeEnvelope(1, 10, { fadeInDuration: 2, fadeOutDuration: 3 }), 0.5);
assert.equal(getStudioFadeEnvelope(5, 10, { fadeInDuration: 2, fadeOutDuration: 3 }), 1);
assert.equal(getStudioFadeEnvelope(8.5, 10, { fadeInDuration: 2, fadeOutDuration: 3 }), 0.5);
assert.equal(getStudioFadeEnvelope(10, 10, { fadeInDuration: 2, fadeOutDuration: 3 }), 0);

assert.equal(STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS, 0.01);

const techZero = resolveStudioPlaybackClipFades(
  { fadeInDuration: 0, fadeOutDuration: 0 },
  10,
);
assert.deepEqual(techZero, {
  fadeInDuration: STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS,
  fadeOutDuration: STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS,
});

const userWins = resolveStudioPlaybackClipFades(
  { fadeInDuration: 0.5, fadeOutDuration: 0.25 },
  10,
);
assert.deepEqual(userWins, { fadeInDuration: 0.5, fadeOutDuration: 0.25 });

const shortClip = resolveStudioPlaybackClipFades(
  { fadeInDuration: 0, fadeOutDuration: 0 },
  0.012,
);
assert.ok(Math.abs(shortClip.fadeInDuration - 0.006) < 1e-9);
assert.ok(Math.abs(shortClip.fadeOutDuration - 0.006) < 1e-9);
assert.ok(
  Math.abs(getStudioFadeEnvelope(0, 10, techZero)) < 1e-12,
  "technical fade-in starts at gain 0",
);
assert.ok(
  Math.abs(getStudioFadeEnvelope(STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS / 2, 10, techZero) - 0.5) < 1e-9,
);

const source = {
  id: "whole",
  startTime: 0,
  offset: 0,
  duration: 4,
  fadeInDuration: 0,
  fadeOutDuration: 0,
};
const split = splitStudioClip(source, 2, "right");
assert.ok(split);
assert.equal(isStudioContiguousSourceSeam(split.left, split.right), true);
const leftFades = resolveStudioPlaybackClipFades(split.left, split.left.duration, {
  clip: split.left,
  previous: null,
  next: split.right,
});
const rightFades = resolveStudioPlaybackClipFades(split.right, split.right.duration, {
  clip: split.right,
  previous: split.left,
  next: null,
});
assert.equal(leftFades.fadeInDuration, STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS);
assert.equal(leftFades.fadeOutDuration, 0, "contiguous seam must not tech fade-out");
assert.equal(rightFades.fadeInDuration, 0, "contiguous seam must not tech fade-in");
assert.equal(rightFades.fadeOutDuration, STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS);

const gappedRight = { ...split.right, startTime: split.right.startTime + 0.05 };
assert.equal(isStudioContiguousSourceSeam(split.left, gappedRight), false);
const gappedFades = resolveStudioPlaybackClipFades(split.left, split.left.duration, {
  clip: split.left,
  previous: null,
  next: gappedRight,
});
assert.equal(gappedFades.fadeOutDuration, STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS);

console.log("studio-fade-math-unit: ok");
