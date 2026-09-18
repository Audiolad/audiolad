import { MAX_STUDIO_AUDIO_DURATION_SECONDS } from "./limits";

/**
 * Shared clip geometry caps for persistence and render.
 * Uses the existing per-asset Studio max (3h) — not a project timeline product limit.
 * Blocks pathological startTime/duration/gaps (e.g. startTime≈625000) at write time.
 */
export function isStudioClipStartTimeAllowed(startTime: number): boolean {
  return (
    Number.isFinite(startTime)
    && startTime >= 0
    && startTime <= MAX_STUDIO_AUDIO_DURATION_SECONDS
  );
}

export function isStudioClipDurationAllowed(duration: number): boolean {
  return (
    Number.isFinite(duration)
    && duration > 0
    && duration <= MAX_STUDIO_AUDIO_DURATION_SECONDS
  );
}

export function isStudioClipGapAllowed(gapSeconds: number): boolean {
  return (
    Number.isFinite(gapSeconds)
    && gapSeconds >= 0
    && gapSeconds <= MAX_STUDIO_AUDIO_DURATION_SECONDS
  );
}

export function isStudioClipOffsetAllowed(offset: number): boolean {
  return Number.isFinite(offset) && offset >= 0;
}
