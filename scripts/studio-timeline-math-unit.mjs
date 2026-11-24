#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  clampPixelsPerSecond,
  DEFAULT_PIXELS_PER_SECOND,
  clampTimelineScrollLeft,
  getAnchoredTimelineScrollLeft,
  getFitPixelsPerSecond,
  getRulerStepSeconds,
  getTimelineEditExtent,
  getTimelineFollowDecision,
  getTimelineWidth,
  isTimelineSeekJump,
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

const CONTROL_COLUMN_PX = 190;
const rulerClass = timelineSource.match(
  /className="([^"]*h-8 border-b border-white\/10 text-\[10px\][^"]*)"/,
);
assert.ok(rulerClass, "ruler container class must exist");
assert.match(rulerClass[1], /(^|\s)relative(\s|$)/);
assert.doesNotMatch(rulerClass[1], /ml-\[190px\]/);

const rulerMarks = timelineSource.slice(
  timelineSource.indexOf("rulerMarks.map"),
  timelineSource.indexOf("{tracks.map"),
);
assert.match(rulerMarks, /left: timeToTimelineX\(time, pixelsPerSecond\)/);
assert.doesNotMatch(rulerMarks, /190/);
assert.match(
  timelineSource,
  /const playheadX = timeToTimelineX\(currentTime, pixelsPerSecond\)/,
);
assert.match(timelineSource, /ml-\[190px\][\s\S]{0,400}left: playheadX/);
assert.match(
  timelineSource,
  /const clipLeft = timeToTimelineX\(\s*layout\.startTime,\s*pixelsPerSecond\s*\)/,
);

const projectDuration = 180;
const currentTime = 165;
let zoom = DEFAULT_PIXELS_PER_SECOND;
const zoomLevels = [
  zoom,
  getFitPixelsPerSecond(projectDuration, 1100),
  clampPixelsPerSecond(0.4),
  clampPixelsPerSecond(240),
];
zoom = stepPixelsPerSecond(zoom, 1);
zoomLevels.push(zoom);
zoom = stepPixelsPerSecond(zoom, 1);
zoomLevels.push(zoom);
zoom = stepPixelsPerSecond(zoom, -1);
zoomLevels.push(zoom);

for (const pixelsPerSecond of zoomLevels) {
  const contentX = timeToTimelineX(currentTime, pixelsPerSecond);
  const rulerVisualX = CONTROL_COLUMN_PX + contentX;
  const clipVisualX = CONTROL_COLUMN_PX + contentX;
  const playheadVisualX = CONTROL_COLUMN_PX + contentX;
  assert.equal(rulerVisualX, clipVisualX);
  assert.equal(clipVisualX, playheadVisualX);
  assert.equal(playheadVisualX - contentX, CONTROL_COLUMN_PX);
  assert.equal(timelineXToTime(contentX, pixelsPerSecond), currentTime);
  assert.notEqual(contentX, playheadVisualX);
  assert.equal(currentTime, 165);
  assert.equal(projectDuration, 180);
}

assert.match(editorSource, /stepPixelsPerSecond/);
assert.match(editorSource, /TIMELINE_ZOOM_STEP|stepPixelsPerSecond\(current, 1\)/);
assert.doesNotMatch(editorSource, /1\.25/);
assert.doesNotMatch(editorSource, /clampPixelsPerSecond\(current \*/);

// t1669u: normal playback (incl. a slow frame) is not a seek; skips and jumps are.
assert.equal(isTimelineSeekJump({ previousTime: 20, elapsedSeconds: 0.016, currentTime: 20.016 }), false);
assert.equal(isTimelineSeekJump({ previousTime: 20, elapsedSeconds: 2.5, currentTime: 22.4 }), false);
assert.equal(isTimelineSeekJump({ previousTime: 20, elapsedSeconds: 0.016, currentTime: 35 }), true);
assert.equal(isTimelineSeekJump({ previousTime: 600, elapsedSeconds: 0.016, currentTime: 0 }), true);
assert.equal(isTimelineSeekJump({ previousTime: Number.NaN, elapsedSeconds: 0.016, currentTime: 5 }), false);

// t1669u: behaviour of follow-the-playhead during playback.
{
  const follow = (playheadX, scrollLeft, suspended) =>
    getTimelineFollowDecision({ playheadX, scrollLeft, viewportWidth: 1000, suspended });
  // Not suspended: playhead past the trailing margin pages the view.
  assert.deepEqual(follow(1000, 0, false), { suspended: false, nextScrollLeft: 650 });
  assert.deepEqual(follow(500, 0, false), { suspended: false, nextScrollLeft: null });
  // Author dragged far away (old bug: snapped back after 1.5 s) – view stays.
  assert.deepEqual(follow(1600, 29000, true), { suspended: true, nextScrollLeft: null });
  // Slow manual scroll toward the playhead: each scroll event re-suspends; the
  // view must never be moved, even when the playhead enters the edge margins.
  let suspended = false;
  for (const scrollLeft of [750, 850, 925, 960, 990, 1010]) {
    suspended = true; // onScroll from the author
    const decision = follow(1000, scrollLeft, suspended);
    assert.equal(decision.nextScrollLeft, null, `no snap at scrollLeft ${scrollLeft}`);
    suspended = decision.suspended;
  }
  // Playhead comfortably in view → follow resumes without moving the view.
  assert.deepEqual(follow(1000, 500, true), { suspended: false, nextScrollLeft: null });
  // Then it pages normally once the playhead reaches the trailing margin.
  assert.deepEqual(follow(1405, 500, false), { suspended: false, nextScrollLeft: 1055 });
}

// t1669u: a manual scroll during playback must not be overridden by follow-the-playhead.
assert.match(timelineSource, /followSuspendedRef\.current = true/);
assert.match(timelineSource, /isTimelineSeekJump\(/);
assert.doesNotMatch(timelineSource, /Date\.now\(\) - lastManualScrollAtRef\.current < 1500/);
assert.doesNotMatch(timelineSource, /isAutoScrollingRef/);

console.log("studio-timeline-math-unit: ok");
