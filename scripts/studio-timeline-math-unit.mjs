#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  clampPixelsPerSecond,
  clampTimelineScrollLeft,
  getAnchoredTimelineScrollLeft,
  getFitPixelsPerSecond,
  getRulerStepSeconds,
  getTimelineEditExtent,
  getTimelineWidth,
  pixelsPerSecondToSliderValue,
  sliderValueToPixelsPerSecond,
  stepPixelsPerSecond,
  timeToTimelineX,
  timelineXToTime,
  TIMELINE_ZOOM_STEP,
} from "../src/lib/studio/timeline-math.ts";

assert.equal(clampPixelsPerSecond(5), 5);
assert.equal(clampPixelsPerSecond(900), 400);
assert.equal(clampPixelsPerSecond(0.0005), 0.001);
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

assert.equal(TIMELINE_ZOOM_STEP, 1.18);

const longFit = getFitPixelsPerSecond(32 * 60 + 27, 1000);
assert.ok(Math.abs(longFit - 1000 / (32 * 60 + 27)) < 1e-12);
assert.ok(Math.abs(longFit - 0.514) < 0.002);

const afterOnePlus = stepPixelsPerSecond(longFit, 1);
assert.equal(afterOnePlus, clampPixelsPerSecond(longFit * TIMELINE_ZOOM_STEP));
assert.ok(afterOnePlus < 20);
assert.ok(Math.abs(afterOnePlus / longFit - TIMELINE_ZOOM_STEP) < 1e-12);
assert.notEqual(afterOnePlus, 20);

let afterFivePluses = longFit;
for (let i = 0; i < 5; i += 1) {
  afterFivePluses = stepPixelsPerSecond(afterFivePluses, 1);
}
assert.ok(
  Math.abs(afterFivePluses - clampPixelsPerSecond(longFit * TIMELINE_ZOOM_STEP ** 5)) < 1e-12,
);
assert.ok(afterFivePluses < 20);

let towardFit = afterFivePluses;
for (let i = 0; i < 5; i += 1) {
  towardFit = stepPixelsPerSecond(towardFit, -1);
}
assert.ok(Math.abs(towardFit - longFit) < 1e-10);
assert.ok(stepPixelsPerSecond(afterOnePlus, -1) < afterOnePlus);
assert.ok(
  Math.abs(stepPixelsPerSecond(afterOnePlus, -1) - longFit) < 1e-10,
);

const shortFit = getFitPixelsPerSecond(150, 1000);
assert.ok(Math.abs(shortFit - 1000 / 150) < 1e-12);
const shortPlus = stepPixelsPerSecond(shortFit, 1);
assert.equal(shortPlus, clampPixelsPerSecond(shortFit * TIMELINE_ZOOM_STEP));
assert.ok(Math.abs(shortPlus - 7.87) < 0.02);
assert.notEqual(shortPlus, 20);

const fitSlider = pixelsPerSecondToSliderValue(longFit);
assert.equal(fitSlider, Math.log(longFit));
const plusSlider = pixelsPerSecondToSliderValue(afterOnePlus);
const minusFromFit = stepPixelsPerSecond(longFit, -1);
const minusSlider = pixelsPerSecondToSliderValue(minusFromFit);
assert.ok(plusSlider > fitSlider);
assert.ok(minusSlider < fitSlider);
assert.ok(
  Math.abs(
    sliderValueToPixelsPerSecond(plusSlider) - afterOnePlus,
  ) < 1e-10,
);

assert.equal(stepPixelsPerSecond(400, 1), 400);
assert.equal(stepPixelsPerSecond(0.001, -1), 0.001);

const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };
assert.notEqual(portrait.width, landscape.width);
assert.equal(landscape.width, 844);
assert.equal(landscape.height, 390);

const editorSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/components/studio/StudioEditorShell.tsx"),
  "utf8",
);
const timelineSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/components/studio/StudioTimeline.tsx"),
  "utf8",
);
assert.match(timelineSource, /ResizeObserver/);
assert.match(timelineSource, /setViewportWidth\(viewport\.clientWidth\)/);
assert.doesNotMatch(timelineSource, /innerWidth/);
assert.doesNotMatch(timelineSource, /orientationchange/);
assert.doesNotMatch(editorSource, /screen\.orientation/);
assert.doesNotMatch(editorSource, /innerWidth/);
assert.match(editorSource, /fixed inset-0 z-30 hidden flex-col/);
assert.match(editorSource, /stepPixelsPerSecond/);
assert.match(editorSource, /TIMELINE_ZOOM_STEP|stepPixelsPerSecond\(current, 1\)/);
assert.doesNotMatch(editorSource, /1\.25/);
assert.doesNotMatch(editorSource, /clampPixelsPerSecond\(current \*/);

console.log("studio-timeline-math-unit: ok");
