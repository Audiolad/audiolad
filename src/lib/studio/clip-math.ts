export type StudioClipLayout = {
  startTime: number;
  offset: number;
  duration: number;
};

export type StudioClip = StudioClipLayout & {
  id: string;
  fadeInDuration: number;
  fadeOutDuration: number;
};

export const MIN_STUDIO_CLIP_DURATION = 0.01;

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

export function getStudioProjectDurationFromClips(
  tracks: Iterable<{ clips: Iterable<StudioClipLayout> }>,
): number {
  let duration = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      duration = Math.max(duration, getStudioClipEnd(clip));
    }
  }
  return duration;
}

export function getStudioClipSnapCandidates(
  clips: Iterable<StudioClipLayout>,
  excludedClipId?: string,
): number[] {
  const candidates = new Set<number>([0]);
  for (const clip of clips as Iterable<StudioClip>) {
    if (clip.id === excludedClipId) continue;
    candidates.add(clip.startTime);
    candidates.add(getStudioClipEnd(clip));
  }
  return [...candidates];
}

export function getStudioSameTrackBounds(
  clip: StudioClipLayout & { id?: string },
  clips: Iterable<StudioClipLayout & { id?: string }>,
): { previousEnd: number; nextStart: number } {
  let previousEnd = 0;
  let nextStart = Number.POSITIVE_INFINITY;
  for (const candidate of clips) {
    if (candidate.id && candidate.id === clip.id) continue;
    const end = getStudioClipEnd(candidate);
    if (end <= clip.startTime) previousEnd = Math.max(previousEnd, end);
    if (candidate.startTime >= getStudioClipEnd(clip)) {
      nextStart = Math.min(nextStart, candidate.startTime);
    }
  }
  return { previousEnd, nextStart };
}

export function splitStudioClip(
  clip: StudioClip,
  splitTime: number,
  rightClipId: string,
): { left: StudioClip; right: StudioClip } | null {
  const point = Number.isFinite(splitTime) ? splitTime : -1;
  const end = getStudioClipEnd(clip);
  if (
    point <= clip.startTime + MIN_STUDIO_CLIP_DURATION ||
    point >= end - MIN_STUDIO_CLIP_DURATION
  ) {
    return null;
  }
  const leftDuration = point - clip.startTime;
  const rightDuration = end - point;
  return {
    left: {
      ...clip,
      duration: leftDuration,
      fadeOutDuration: 0,
    },
    right: {
      ...clip,
      id: rightClipId,
      startTime: point,
      offset: clip.offset + leftDuration,
      duration: rightDuration,
      fadeInDuration: 0,
    },
  };
}

export function getStudioRippleDeleteResult(
  clips: readonly StudioClip[],
  clipId: string,
): { clips: StudioClip[]; removedClip: StudioClip } | null {
  const removedClip = clips.find((clip) => clip.id === clipId);
  if (!removedClip) {
    return null;
  }

  const removedEnd = getStudioClipEnd(removedClip);
  return {
    removedClip,
    clips: clips.flatMap((clip) => {
      if (clip.id === clipId) {
        return [];
      }
      return [
        clip.startTime >= removedEnd
          ? { ...clip, startTime: clip.startTime - removedClip.duration }
          : clip,
      ];
    }),
  };
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
  collisionBounds,
}: {
  layout: StudioClipLayout;
  bufferDuration: number;
  requestedStartTime: number;
  snapTargets: Iterable<number>;
  pixelsPerSecond: number;
  bypassSnap?: boolean;
  collisionBounds?: { previousEnd: number; nextStart: number };
}): StudioClipLayout {
  const normalized = getStudioClipLayout(layout, bufferDuration);
  const snappedStart = getStudioClipSnapTime({
    requestedTime: requestedStartTime,
    pixelsPerSecond,
    targets: snapTargets,
    bypass: bypassSnap,
  });
  const minimumStart = Math.max(collisionBounds?.previousEnd ?? 0, 0);
  const maximumStart = Number.isFinite(collisionBounds?.nextStart)
    ? Math.max((collisionBounds?.nextStart ?? 0) - normalized.duration, minimumStart)
    : Number.POSITIVE_INFINITY;
  return {
    ...normalized,
    startTime: Math.min(Math.max(snappedStart, minimumStart), maximumStart),
  };
}

export function getStudioClipTrimStartLayout({
  layout,
  bufferDuration,
  requestedStartTime,
  snapTargets,
  pixelsPerSecond,
  bypassSnap,
  collisionBounds,
}: {
  layout: StudioClipLayout;
  bufferDuration: number;
  requestedStartTime: number;
  snapTargets: Iterable<number>;
  pixelsPerSecond: number;
  bypassSnap?: boolean;
  collisionBounds?: { previousEnd: number; nextStart: number };
}): StudioClipLayout {
  const normalized = getStudioClipLayout(layout, bufferDuration);
  const minimumStartTime = Math.max(
    normalized.startTime - normalized.offset,
    collisionBounds?.previousEnd ?? 0,
    0,
  );
  const maximumStartTime = getStudioClipEnd(normalized) - MIN_STUDIO_CLIP_DURATION;
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
  collisionBounds,
}: {
  layout: StudioClipLayout;
  bufferDuration: number;
  requestedEndTime: number;
  snapTargets: Iterable<number>;
  pixelsPerSecond: number;
  bypassSnap?: boolean;
  collisionBounds?: { previousEnd: number; nextStart: number };
}): StudioClipLayout {
  const normalized = getStudioClipLayout(layout, bufferDuration);
  const endTime = Math.min(Math.max(
    getStudioClipSnapTime({
      requestedTime: requestedEndTime,
      pixelsPerSecond,
      targets: snapTargets,
      bypass: bypassSnap,
    }),
    normalized.startTime + MIN_STUDIO_CLIP_DURATION,
  ), collisionBounds?.nextStart ?? Number.POSITIVE_INFINITY);

  return getStudioClipLayout(
    {
      ...normalized,
      duration: endTime - normalized.startTime,
    },
    bufferDuration,
  );
}
