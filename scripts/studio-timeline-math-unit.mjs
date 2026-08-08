#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  clampPixelsPerSecond,
  clampTimelineScrollLeft,
  getAnchoredTimelineScrollLeft,
  getFitPixelsPerSecond,
  getRulerStepSeconds,
  getTimelineEditExtent,
  getTimelineWidth,
  timeToTimelineX,
  timelineXToTime,
} from "../src/lib/studio/timeline-math.ts";

assert.equal(clampPixelsPerSecond(5), 20);
assert.equal(clampPixelsPerSecond(900), 400);
assert.equal(getTimelineWidth(12, 50), 600);
assert.equal(getTimelineEditExtent(60, 80, 800), 65);
assert.equal(getTimelineEditExtent(60, 80, 0), 65);
assert.equal(getTimelineEditExtent(60, 20, 800), 70);
assert.equal(timeToTimelineX(2.5, 80), 200);
assert.equal(timelineXToTime(200, 80), 2.5);
assert.equal(getFitPixelsPerSecond(20, 800), 40);
assert.equal(getFitPixelsPerSecond(10_000, 800), 0.08);
assert.equal(getRulerStepSeconds(80), 2);
assert.equal(clampTimelineScrollLeft(-10, 1000, 400), 0);
assert.equal(clampTimelineScrollLeft(900, 1000, 400), 600);
assert.equal(
  getAnchoredTimelineScrollLeft({
    previousPixelsPerSecond: 50,
    nextPixelsPerSecond: 100,
    scrollLeft: 300,
    anchorViewportX: 200,
    duration: 20,
    viewportWidth: 500,
  }),
  800,
);

console.log("studio-timeline-math-unit: ok");
