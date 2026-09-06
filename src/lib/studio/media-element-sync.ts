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
