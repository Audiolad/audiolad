import { sortStudioClipsByStart } from "../clip-math";
import {
  assertStudioProjectTimelineLimit,
  StudioClipGeometryInvalidError,
  StudioProjectTimelineLimitError,
} from "../clip-geometry-limits";
import { MAX_STUDIO_AUDIO_DURATION_SECONDS } from "../limits";
import { buildStudioRenderTimeline } from "./timeline";
import type { StudioRenderSnapshot } from "./types";

export type StudioRenderTimelineGuardCode =
  | "studio_render_timeline_invalid"
  | "studio_render_timeline_too_long"
  | "studio_render_clip_exceeds_asset";

export class StudioRenderTimelineGuardError extends Error {
  readonly code: StudioRenderTimelineGuardCode;

  constructor(code: StudioRenderTimelineGuardCode, message: string) {
    super(message);
    this.name = "StudioRenderTimelineGuardError";
    this.code = code;
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new StudioRenderTimelineGuardError(
      "studio_render_timeline_invalid",
      `Studio render ${label} must be a finite non-negative number.`,
    );
  }
}

/**
 * Server-side invariants before FFmpeg.
 * Shared product rule: max(startTime + duration) ≤ MAX_STUDIO_PROJECT_TIMELINE_SECONDS (3h).
 * Allows geometric clip.duration slightly past available source (silence pad).
 * Voice-preset tails may extend the rendered graph a little past clip ends after this check.
 */
export function assertStudioRenderTimelineSafe(snapshot: StudioRenderSnapshot): number {
  const assetsById = new Map(snapshot.assets.map((asset) => [asset.id, asset]));

  for (const track of snapshot.tracks) {
    const asset = assetsById.get(track.assetId);
    if (!asset) {
      throw new StudioRenderTimelineGuardError(
        "studio_render_timeline_invalid",
        `Track ${track.id} references missing asset ${track.assetId}.`,
      );
    }
    assertFiniteNonNegative(asset.durationSeconds, "asset.durationSeconds");
    if (asset.durationSeconds > MAX_STUDIO_AUDIO_DURATION_SECONDS) {
      throw new StudioRenderTimelineGuardError(
        "studio_render_timeline_invalid",
        `Asset ${asset.id} duration exceeds Studio max ${MAX_STUDIO_AUDIO_DURATION_SECONDS}s.`,
      );
    }

    const ordered = sortStudioClipsByStart(track.clips);
    for (const clip of ordered) {
      assertFiniteNonNegative(clip.startTime, "clip.startTime");
      assertFiniteNonNegative(clip.offset, "clip.offset");
      assertFiniteNonNegative(clip.duration, "clip.duration");
      if (!(clip.duration > 0)) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_timeline_invalid",
          `Clip ${clip.id} duration must be positive.`,
        );
      }
      if (clip.offset > asset.durationSeconds + 1e-6) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_clip_exceeds_asset",
          `Clip ${clip.id} offset exceeds asset ${asset.id} duration.`,
        );
      }
    }
  }

  try {
    assertStudioProjectTimelineLimit(snapshot.tracks);
  } catch (error) {
    if (error instanceof StudioProjectTimelineLimitError) {
      throw new StudioRenderTimelineGuardError(
        "studio_render_timeline_too_long",
        error.message,
      );
    }
    if (error instanceof StudioClipGeometryInvalidError) {
      throw new StudioRenderTimelineGuardError(
        "studio_render_timeline_invalid",
        error.message,
      );
    }
    throw error;
  }

  const timeline = buildStudioRenderTimeline(snapshot);
  const durationSeconds = timeline.durationSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new StudioRenderTimelineGuardError(
      "studio_render_timeline_invalid",
      "Studio render timeline duration must be finite and positive.",
    );
  }
  return durationSeconds;
}
