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

/** Timeline/source continuity tolerance for split seams (seconds). */
export const STUDIO_CONTIGUOUS_SEAM_EPSILON_SECONDS = 0.001;

export type StudioClipBoundaryGeometry = {
  startTime: number;
  offset: number;
  duration: number;
};

/**
 * True when right continues left without a timeline gap and without a source
 * jump — the geometry `splitStudioClip` produces for one asset.
 */
export function isStudioContiguousSourceSeam(
  left: StudioClipBoundaryGeometry,
  right: StudioClipBoundaryGeometry,
  epsilonSeconds = STUDIO_CONTIGUOUS_SEAM_EPSILON_SECONDS,
): boolean {
  const eps = finiteNonNegative(epsilonSeconds);
  const leftEnd = finiteNonNegative(left.startTime) + finiteNonNegative(left.duration);
  const leftSourceEnd = finiteNonNegative(left.offset) + finiteNonNegative(left.duration);
  const rightStart = finiteNonNegative(right.startTime);
  const rightOffset = finiteNonNegative(right.offset);
  return (
    Math.abs(rightStart - leftEnd) <= eps &&
    Math.abs(rightOffset - leftSourceEnd) <= eps
  );
}

export type StudioClipBoundaryNeighbor = StudioClipBoundaryGeometry &
  Partial<StudioClipFades>;

export type StudioPlaybackFadeBoundaries = {
  clip: StudioClipBoundaryGeometry;
  previous?: StudioClipBoundaryNeighbor | null;
  next?: StudioClipBoundaryNeighbor | null;
};

/**
 * Playback/render fades with boundary-aware technical de-click:
 * - silence / project edge / non-contiguous hard cut → technical ramp
 * - untouched contiguous seam (both authored edges 0) → flat / flat
 * - one-sided authored fade on a contiguous seam → complementary 10 ms
 *   technical ramp on the opposite side (avoids 1→0 / 0→1 clicks)
 * - both sides authored → authored values
 * Authored fadeInDuration/fadeOutDuration in project_data stay unchanged.
 */
export function resolveStudioPlaybackClipFades(
  fades: Partial<StudioClipFades>,
  clipDuration: number,
  boundaries?: StudioPlaybackFadeBoundaries,
): StudioClipFades {
  const clamped = clampStudioClipFades(fades, clipDuration);
  const duration = finiteNonNegative(clipDuration);
  if (duration <= 0) {
    return clamped;
  }
  const technical = Math.min(STUDIO_TECHNICAL_CLIP_EDGE_RAMP_SECONDS, duration / 2);
  const clip = boundaries?.clip ?? {
    startTime: 0,
    offset: 0,
    duration,
  };
  const previous = boundaries?.previous ?? null;
  const next = boundaries?.next ?? null;
  const contiguousPrev = Boolean(
    previous && isStudioContiguousSourceSeam(previous, clip),
  );
  const contiguousNext = Boolean(
    next && isStudioContiguousSourceSeam(clip, next),
  );

  let fadeInDuration = clamped.fadeInDuration;
  let fadeOutDuration = clamped.fadeOutDuration;

  if (!contiguousPrev) {
    fadeInDuration = Math.max(fadeInDuration, technical);
  } else if (fadeInDuration <= 0) {
    const previousFadeOut = finiteNonNegative(previous?.fadeOutDuration);
    if (previousFadeOut > 0) {
      // Left authored fade-out → complementary technical fade-in on right.
      fadeInDuration = technical;
    }
  }

  if (!contiguousNext) {
    fadeOutDuration = Math.max(fadeOutDuration, technical);
  } else if (fadeOutDuration <= 0) {
    const nextFadeIn = finiteNonNegative(next?.fadeInDuration);
    if (nextFadeIn > 0) {
      // Right authored fade-in → complementary technical fade-out on left.
      fadeOutDuration = technical;
    }
  }

  return clampStudioClipFades({ fadeInDuration, fadeOutDuration }, duration);
}

export type StudioClipEnterHandoff = "flat" | "fade-in" | "from-silence";

/**
 * How preview should open when entering `clip` from `previous`.
 * Flat only for untouched contiguous seams; authored or complementary
 * fade-in both open from 0.
 */
export function resolveStudioClipEnterHandoff(input: {
  clip: StudioClipBoundaryGeometry & Partial<StudioClipFades>;
  previous?: StudioClipBoundaryNeighbor | null;
  next?: StudioClipBoundaryNeighbor | null;
}): StudioClipEnterHandoff {
  if (input.previous && isStudioContiguousSourceSeam(input.previous, input.clip)) {
    const fades = resolveStudioPlaybackClipFades(input.clip, input.clip.duration, {
      clip: input.clip,
      previous: input.previous,
      next: input.next ?? null,
    });
    return fades.fadeInDuration > 0 ? "fade-in" : "flat";
  }
  return "from-silence";
}

