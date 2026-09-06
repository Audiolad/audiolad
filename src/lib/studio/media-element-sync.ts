export const STUDIO_MEDIA_DRIFT_SEEK_SECONDS = 0.25;

export type StudioMediaClipWindow = {
  startTime: number;
  offset: number;
  duration: number;
};

export function getStudioClipMediaTime(
  clip: StudioMediaClipWindow,
  timelineTime: number,
): number {
  const startTime = Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
  const offset = Number.isFinite(clip.offset) && clip.offset > 0 ? clip.offset : 0;
  const duration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
  const elapsed = Math.min(Math.max(timelineTime - startTime, 0), duration);
  return offset + elapsed;
}

export function findActiveStudioClip<T extends StudioMediaClipWindow>(
  clips: readonly T[],
  timelineTime: number,
): T | null {
  for (const clip of clips) {
    const startTime = Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
    const duration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
    if (timelineTime >= startTime && timelineTime < startTime + duration) {
      return clip;
    }
  }
  return null;
}

export function findNextStudioClip<T extends StudioMediaClipWindow>(
  clips: readonly T[],
  timelineTime: number,
): T | null {
  let next: T | null = null;
  for (const clip of clips) {
    const startTime = Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
    if (startTime <= timelineTime) continue;
    if (!next || startTime < next.startTime) {
      next = clip;
    }
  }
  return next;
}

export function shouldCorrectStudioMediaDrift(
  actualMediaTime: number,
  targetMediaTime: number,
  thresholdSeconds = STUDIO_MEDIA_DRIFT_SEEK_SECONDS,
): boolean {
  if (!Number.isFinite(actualMediaTime) || !Number.isFinite(targetMediaTime)) {
    return true;
  }
  return Math.abs(actualMediaTime - targetMediaTime) > thresholdSeconds;
}

export type StudioMediaElementSyncPlan = {
  activeClipId: string | null;
  envelope: "silence" | "clip";
  seekTo: number | null;
  loop: boolean;
  wantPlaying: boolean;
  enteredClip: boolean;
  elapsedClipTime: number;
};

function clipIdOf(clip: StudioMediaClipWindow & { id?: string }): string {
  return typeof clip.id === "string" && clip.id ? clip.id : "clip";
}

/**
 * One MediaElement per track. During a timeline gap we keep the element
 * playing (silenced) so a later clip does not need a new user gesture.
 */
export function planStudioMediaElementSync({
  clips,
  timelineTime,
  playing,
  activeClipId,
  mediaCurrentTime,
  mediaEnded = false,
}: {
  clips: readonly (StudioMediaClipWindow & { id?: string })[];
  timelineTime: number;
  playing: boolean;
  activeClipId: string | null;
  mediaCurrentTime: number;
  mediaEnded?: boolean;
}): StudioMediaElementSyncPlan {
  const clip = findActiveStudioClip(clips, timelineTime);
  if (!clip) {
    return {
      activeClipId: null,
      envelope: "silence",
      seekTo: playing && mediaEnded ? 0 : null,
      loop: playing,
      wantPlaying: playing,
      enteredClip: false,
      elapsedClipTime: 0,
    };
  }

  const startTime =
    Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
  const mediaTime = getStudioClipMediaTime(clip, timelineTime);
  const clipId = clipIdOf(clip);
  const entered = activeClipId !== clipId;
  const shouldSeek =
    entered || shouldCorrectStudioMediaDrift(mediaCurrentTime, mediaTime);
  return {
    activeClipId: clipId,
    envelope: "clip",
    seekTo: shouldSeek ? mediaTime : null,
    loop: false,
    wantPlaying: playing,
    enteredClip: entered,
    elapsedClipTime: Math.max(timelineTime - startTime, 0),
  };
}

export function countActiveStudioClips<T extends StudioMediaClipWindow>(
  clips: readonly T[],
  timelineTime: number,
): number {
  let count = 0;
  for (const clip of clips) {
    const startTime =
      Number.isFinite(clip.startTime) && clip.startTime > 0 ? clip.startTime : 0;
    const duration =
      Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
    if (timelineTime >= startTime && timelineTime < startTime + duration) {
      count += 1;
    }
  }
  return count;
}
