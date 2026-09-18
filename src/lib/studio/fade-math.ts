export type StudioClipFades = {
  fadeInDuration: number;
  fadeOutDuration: number;
};

function finiteNonNegative(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value ?? 0 : 0;
}

export function getStudioDefaultFadeDuration(duration: number): number {
  return Math.min(2, finiteNonNegative(duration) * 0.1);
}

/**
 * Keeps each requested fade's share when their combined duration exceeds the
 * clip. This avoids one handle unexpectedly consuming the other fade.
 */
export function clampStudioClipFades(
  fades: Partial<StudioClipFades>,
  clipDuration: number,
): StudioClipFades {
  const duration = finiteNonNegative(clipDuration);
  const fadeInDuration = finiteNonNegative(fades.fadeInDuration);
  const fadeOutDuration = finiteNonNegative(fades.fadeOutDuration);
  const total = fadeInDuration + fadeOutDuration;

  if (total <= duration || total === 0) {
    return { fadeInDuration, fadeOutDuration };
  }

  const scale = duration / total;
  return {
    fadeInDuration: fadeInDuration * scale,
    fadeOutDuration: fadeOutDuration * scale,
  };
}

export function getStudioFadeEnvelope(
  position: number,
  clipDuration: number,
  fades: Partial<StudioClipFades>,
): number {
  const duration = finiteNonNegative(clipDuration);
  if (duration <= 0 || !Number.isFinite(position) || position < 0 || position > duration) {
    return 0;
  }

  const { fadeInDuration, fadeOutDuration } = clampStudioClipFades(fades, duration);
  const fadeInGain = fadeInDuration > 0 ? Math.min(position / fadeInDuration, 1) : 1;
  const fadeOutGain =
    fadeOutDuration > 0
      ? Math.min((duration - position) / fadeOutDuration, 1)
      : 1;
  return Math.min(Math.max(Math.min(fadeInGain, fadeOutGain), 0), 1);
}

/**
 * Invisible DSP anti-click ramp at clip edges (preview + FFmpeg).
 * Not stored in project_data and not shown as a user fade handle.
 * 10 ms is long enough to remove a hard 0→1 amplitude discontinuity on speech
 * without a subjectively audible artistic fade.
 */
export const STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS = 0.01;

/**
 * Playback/render fades: raise each edge to at least the technical ramp when
 * the authored fade is shorter, then re-clamp so in+out still fit the clip.
 * Authored fadeInDuration/fadeOutDuration in project_data stay unchanged.
 */
export function resolveStudioPlaybackClipFades(
  fades: Partial<StudioClipFades>,
  clipDuration: number,
): StudioClipFades {
  const clamped = clampStudioClipFades(fades, clipDuration);
  const duration = finiteNonNegative(clipDuration);
  if (duration <= 0) {
    return clamped;
  }
  const technical = Math.min(STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS, duration / 2);
  return clampStudioClipFades(
    {
      fadeInDuration: Math.max(clamped.fadeInDuration, technical),
      fadeOutDuration: Math.max(clamped.fadeOutDuration, technical),
    },
    duration,
  );
}

