import { MAX_STUDIO_PROJECT_TIMELINE_SECONDS } from "./limits";

export type StudioTimelineClipGeometry = {
  startTime: number;
  duration: number;
};

export type StudioTimelineTrackGeometry = {
  clips: readonly StudioTimelineClipGeometry[];
};

/**
 * Product max for the Studio project timeline (3 hours).
 * Enforced as max over clips of (startTime + duration), not as startTime ≤ 3h alone.
 */
export class StudioProjectTimelineLimitError extends Error {
  readonly code = "project_timeline_too_long" as const;
  readonly endSeconds: number;

  constructor(endSeconds: number) {
    super(
      `Studio project timeline end ${endSeconds}s exceeds max ${MAX_STUDIO_PROJECT_TIMELINE_SECONDS}s.`,
    );
    this.name = "StudioProjectTimelineLimitError";
    this.endSeconds = endSeconds;
  }
}

export class StudioClipGeometryInvalidError extends Error {
  readonly code = "invalid_clip_geometry" as const;

  constructor(message: string) {
    super(message);
    this.name = "StudioClipGeometryInvalidError";
  }
}

/** Latest audible/timeline end across all clips: max(startTime + duration). */
export function getStudioProjectTimelineEndSeconds(
  tracks: Iterable<StudioTimelineTrackGeometry>,
): number {
  let endSeconds = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (
        !Number.isFinite(clip.startTime)
        || clip.startTime < 0
        || !Number.isFinite(clip.duration)
        || !(clip.duration > 0)
      ) {
        throw new StudioClipGeometryInvalidError(
          "Clip startTime/duration must be finite with startTime ≥ 0 and duration > 0.",
        );
      }
      endSeconds = Math.max(endSeconds, clip.startTime + clip.duration);
    }
  }
  return endSeconds;
}

/**
 * Shared persistence + render invariant: project timeline end must be ≤ 3h.
 * Returns the computed end seconds when valid.
 */
export function assertStudioProjectTimelineLimit(
  tracks: Iterable<StudioTimelineTrackGeometry>,
): number {
  const endSeconds = getStudioProjectTimelineEndSeconds(tracks);
  if (endSeconds > MAX_STUDIO_PROJECT_TIMELINE_SECONDS) {
    throw new StudioProjectTimelineLimitError(endSeconds);
  }
  return endSeconds;
}
