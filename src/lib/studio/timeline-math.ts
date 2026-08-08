export const DEFAULT_PIXELS_PER_SECOND = 80;
export const MIN_PIXELS_PER_SECOND = 20;
export const MAX_PIXELS_PER_SECOND = 400;
const MIN_FIT_PIXELS_PER_SECOND = 0.001;

function normalizePixelsPerSecond(value: number): number {
  return Number.isFinite(value) && value > 0
    ? Math.max(value, MIN_FIT_PIXELS_PER_SECOND)
    : DEFAULT_PIXELS_PER_SECOND;
}

export function clampPixelsPerSecond(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PIXELS_PER_SECOND;
  }

  return Math.min(Math.max(value, MIN_PIXELS_PER_SECOND), MAX_PIXELS_PER_SECOND);
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

  return Math.max(viewportWidth / duration, MIN_FIT_PIXELS_PER_SECOND);
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
