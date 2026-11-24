export const DEFAULT_PIXELS_PER_SECOND = 80;
export const MIN_PIXELS_PER_SECOND = 0.001;
export const MAX_PIXELS_PER_SECOND = 400;
export const TIMELINE_ZOOM_STEP = 1.18;
export const MIN_PIXELS_PER_SECOND_SLIDER = Math.log(MIN_PIXELS_PER_SECOND);
export const MAX_PIXELS_PER_SECOND_SLIDER = Math.log(MAX_PIXELS_PER_SECOND);

function normalizePixelsPerSecond(value: number): number {
  return Number.isFinite(value) && value > 0
    ? Math.max(value, MIN_PIXELS_PER_SECOND)
    : DEFAULT_PIXELS_PER_SECOND;
}

export function clampPixelsPerSecond(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PIXELS_PER_SECOND;
  }

  return Math.min(Math.max(value, MIN_PIXELS_PER_SECOND), MAX_PIXELS_PER_SECOND);
}

export function stepPixelsPerSecond(current: number, direction: 1 | -1): number {
  const base = Number.isFinite(current) && current > 0 ? current : DEFAULT_PIXELS_PER_SECOND;
  const next = direction === 1 ? base * TIMELINE_ZOOM_STEP : base / TIMELINE_ZOOM_STEP;
  return clampPixelsPerSecond(next);
}

export function pixelsPerSecondToSliderValue(pps: number): number {
  return Math.log(clampPixelsPerSecond(pps));
}

export function sliderValueToPixelsPerSecond(slider: number): number {
  return clampPixelsPerSecond(Math.exp(slider));
}

export function getTimelineWidth(
  duration: number,
  pixelsPerSecond: number,
  minimumWidth = 1,
): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return minimumWidth;
  }

  return Math.max(duration * normalizePixelsPerSecond(pixelsPerSecond), minimumWidth);
}

export function getTimelineEditExtent(
  projectDuration: number,
  pixelsPerSecond: number,
  viewportWidth: number,
): number {
  const safeDuration =
    Number.isFinite(projectDuration) && projectDuration > 0 ? projectDuration : 0;
  const pixels = normalizePixelsPerSecond(pixelsPerSecond);
  const trailingPixels = Math.max(
    Number.isFinite(viewportWidth) ? viewportWidth * 0.25 : 0,
    pixels * 5,
  );

  return safeDuration + trailingPixels / pixels;
}

export function timeToTimelineX(time: number, pixelsPerSecond: number): number {
  if (!Number.isFinite(time) || time <= 0) {
    return 0;
  }

  return time * normalizePixelsPerSecond(pixelsPerSecond);
}

export function timelineXToTime(x: number, pixelsPerSecond: number): number {
  if (!Number.isFinite(x) || x <= 0) {
    return 0;
  }

  return x / normalizePixelsPerSecond(pixelsPerSecond);
}

export function getFitPixelsPerSecond(
  duration: number,
  viewportWidth: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(viewportWidth)) {
    return DEFAULT_PIXELS_PER_SECOND;
  }

  return Math.max(viewportWidth / duration, MIN_PIXELS_PER_SECOND);
}

export function getRulerStepSeconds(pixelsPerSecond: number): number {
  const targetSeconds = 100 / normalizePixelsPerSecond(pixelsPerSecond);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3600];
  return steps.find((step) => step >= targetSeconds) ?? 7200;
}

export function clampTimelineScrollLeft(
  requestedScrollLeft: number,
  timelineWidth: number,
  viewportWidth: number,
): number {
  const maximum = Math.max(timelineWidth - Math.max(viewportWidth, 0), 0);
  if (!Number.isFinite(requestedScrollLeft)) {
    return requestedScrollLeft === Number.POSITIVE_INFINITY ? maximum : 0;
  }
  return Math.min(Math.max(requestedScrollLeft, 0), maximum);
}

export function getAnchoredTimelineScrollLeft({
  previousPixelsPerSecond,
  nextPixelsPerSecond,
  scrollLeft,
  anchorViewportX,
  duration,
  viewportWidth,
}: {
  previousPixelsPerSecond: number;
  nextPixelsPerSecond: number;
  scrollLeft: number;
  anchorViewportX: number;
  duration: number;
  viewportWidth: number;
}): number {
  const anchorTime = timelineXToTime(
    scrollLeft + Math.max(anchorViewportX, 0),
    previousPixelsPerSecond,
  );
  return clampTimelineScrollLeft(
    timeToTimelineX(anchorTime, nextPixelsPerSecond) - Math.max(anchorViewportX, 0),
    getTimelineWidth(duration, nextPixelsPerSecond),
    viewportWidth,
  );
}

export function formatTimelineTime(time: number): string {
  const safeTime = Number.isFinite(time) && time > 0 ? time : 0;
  const minutes = Math.floor(safeTime / 60);
  const seconds = Math.floor(safeTime % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Playback clock drift tolerated before a position change counts as a seek. */
export const TIMELINE_SEEK_JUMP_TOLERANCE_SECONDS = 1;

/**
 * True when the playhead moved differently from normal playback since the
 * previous sample (a seek, a skip or a jump back), so "follow the playhead"
 * may take over the view again. A slow frame is not a seek: the expected
 * position advances with wall-clock time.
 */
export function isTimelineSeekJump({
  previousTime,
  elapsedSeconds,
  currentTime,
}: {
  previousTime: number;
  elapsedSeconds: number;
  currentTime: number;
}): boolean {
  if (
    !Number.isFinite(previousTime) ||
    !Number.isFinite(currentTime) ||
    !Number.isFinite(elapsedSeconds)
  ) {
    return false;
  }
  const expected = previousTime + Math.max(elapsedSeconds, 0);
  return Math.abs(currentTime - expected) > TIMELINE_SEEK_JUMP_TOLERANCE_SECONDS;
}

/** Follow-the-playhead keeps the playhead inside these viewport margins. */
export const TIMELINE_FOLLOW_LEADING_MARGIN_PX = 48;
export const TIMELINE_FOLLOW_TRAILING_MARGIN_PX = 96;
export const TIMELINE_FOLLOW_ANCHOR_RATIO = 0.35;

/**
 * One playback-frame decision for "follow the playhead".
 * While suspended (the author scrolled by hand) the view never moves; follow
 * comes back only once the playhead sits inside the follow zone, i.e. when
 * resuming would not move the view. So a slow manual scroll that brings the
 * playhead near an edge can never be snapped back mid-gesture.
 */
export function getTimelineFollowDecision({
  playheadX,
  scrollLeft,
  viewportWidth,
  suspended,
}: {
  playheadX: number;
  scrollLeft: number;
  viewportWidth: number;
  suspended: boolean;
}): { suspended: boolean; nextScrollLeft: number | null } {
  const insideFollowZone =
    playheadX >= scrollLeft + TIMELINE_FOLLOW_LEADING_MARGIN_PX &&
    playheadX <= scrollLeft + viewportWidth - TIMELINE_FOLLOW_TRAILING_MARGIN_PX;
  if (insideFollowZone) {
    return { suspended: false, nextScrollLeft: null };
  }
  if (suspended) {
    return { suspended: true, nextScrollLeft: null };
  }
  return {
    suspended: false,
    nextScrollLeft: Math.max(0, playheadX - viewportWidth * TIMELINE_FOLLOW_ANCHOR_RATIO),
  };
}
