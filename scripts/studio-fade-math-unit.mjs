#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  clampStudioClipFades,
  getStudioDefaultFadeDuration,
  getStudioFadeEnvelope,
} from "../src/lib/studio/fade-math.ts";

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

console.log("studio-fade-math-unit: ok");
