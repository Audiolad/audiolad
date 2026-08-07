export type StudioClipLayout = {
  startTime: number;
  offset: number;
  duration: number;
};

const MIN_CLIP_DURATION = 0.01;

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getStudioClipLayout(
  layout: Partial<StudioClipLayout>,
  bufferDuration: number,
): StudioClipLayout {
  const safeBufferDuration = finiteNonNegative(bufferDuration);
  const startTime = finiteNonNegative(layout.startTime ?? 0);
  const offset = Math.min(
    finiteNonNegative(layout.offset ?? 0),
    safeBufferDuration,
  );
  const availableDuration = Math.max(safeBufferDuration - offset, 0);
  const requestedDuration =
    Number.isFinite(layout.duration) && (layout.duration ?? 0) > 0
      ? layout.duration ?? 0
      : availableDuration;

  return {
    startTime,
    offset,
    duration: Math.min(requestedDuration, availableDuration),
  };
}

export function getStudioClipEnd(layout: StudioClipLayout): number {
  return layout.startTime + layout.duration;
}

export function getStudioClipSnapTime({
  requestedTime,
  pixelsPerSecond,
  targets,
  bypass,
}: {
  requestedTime: number;
  pixelsPerSecond: number;
  targets: Iterable<number>;
  bypass?: boolean;
}): number {
  const time = finiteNonNegative(requestedTime);
  if (bypass || !Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    return time;
  }

  const threshold = 10 / pixelsPerSecond;
  let snappedTime = time;
  let closestDistance = threshold;
  for (const target of targets) {
    if (!Number.isFinite(target) || target < 0) {
      continue;
    }
    const distance = Math.abs(target - time);
    if (distance <= closestDistance) {
      snappedTime = target;
      closestDistance = distance;
    }
  }
  return snappedTime;
}

export function getStudioClipMoveLayout({
  layout,
  bufferDuration,
  requestedStartTime,
  snapTargets,
  pixelsPerSecond,
  bypassSnap,
}: {
  layout: StudioClipLayout;
  bufferDuration: number;
  requestedStartTime: number;
  snapTargets: Iterable<number>;
  pixelsPerSecond: number;
  bypassSnap?: boolean;
}): StudioClipLayout {
  const normalized = getStudioClipLayout(layout, bufferDuration);
  return {
    ...normalized,
    startTime: getStudioClipSnapTime({
      requestedTime: requestedStartTime,
      pixelsPerSecond,
      targets: snapTargets,
      bypass: bypassSnap,
    }),
  };
}

export function getStudioClipTrimStartLayout({
  layout,
  bufferDuration,
  requestedStartTime,
  snapTargets,
  pixelsPerSecond,
  bypassSnap,
}: {
  layout: StudioClipLayout;
  bufferDuration: number;
  requestedStartTime: number;
  snapTargets: Iterable<number>;
  pixelsPerSecond: number;
  bypassSnap?: boolean;
}): StudioClipLayout {
  const normalized = getStudioClipLayout(layout, bufferDuration);
  const minimumStartTime = Math.max(normalized.startTime - normalized.offset, 0);
  const maximumStartTime = getStudioClipEnd(normalized) - MIN_CLIP_DURATION;
  const startTime = Math.min(
    Math.max(
      getStudioClipSnapTime({
        requestedTime: requestedStartTime,
        pixelsPerSecond,
        targets: snapTargets,
        bypass: bypassSnap,
      }),
      minimumStartTime,
    ),
    maximumStartTime,
  );
  const delta = startTime - normalized.startTime;

  return getStudioClipLayout(
    {
      startTime,
      offset: normalized.offset + delta,
      duration: normalized.duration - delta,
    },
    bufferDuration,
  );
}

export function getStudioClipTrimEndLayout({
  layout,
  bufferDuration,
  requestedEndTime,
  snapTargets,
  pixelsPerSecond,
  bypassSnap,
}: {
  layout: StudioClipLayout;
  bufferDuration: number;
  requestedEndTime: number;
  snapTargets: Iterable<number>;
  pixelsPerSecond: number;
  bypassSnap?: boolean;
}): StudioClipLayout {
  const normalized = getStudioClipLayout(layout, bufferDuration);
  const endTime = Math.max(
    getStudioClipSnapTime({
      requestedTime: requestedEndTime,
      pixelsPerSecond,
      targets: snapTargets,
      bypass: bypassSnap,
    }),
    normalized.startTime + MIN_CLIP_DURATION,
  );

  return getStudioClipLayout(
    {
      ...normalized,
      duration: endTime - normalized.startTime,
    },
    bufferDuration,
  );
}
