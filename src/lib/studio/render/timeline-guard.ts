import { sortStudioClipsByStart } from "../clip-math";
import {
  isStudioClipDurationAllowed,
  isStudioClipGapAllowed,
  isStudioClipOffsetAllowed,
  isStudioClipStartTimeAllowed,
} from "../clip-geometry-limits";
import { MAX_STUDIO_AUDIO_DURATION_SECONDS } from "../limits";
import { buildStudioRenderTimeline } from "./timeline";
import type { StudioRenderSnapshot } from "./types";

export type StudioRenderTimelineGuardCode =
  | "studio_render_timeline_invalid"
  | "studio_render_clip_exceeds_asset"
  | "studio_render_gap_too_large";

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
 * Caps clip startTime / duration / gaps by the existing per-asset Studio max (3h).
 * There is no approved product project-timeline duration limit yet — do not invent one.
 * Allows geometric clip.duration slightly past available source (silence pad).
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
    let previousEnd = 0;
    for (const clip of ordered) {
      assertFiniteNonNegative(clip.startTime, "clip.startTime");
      assertFiniteNonNegative(clip.offset, "clip.offset");
      assertFiniteNonNegative(clip.duration, "clip.duration");
      if (!isStudioClipOffsetAllowed(clip.offset)) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_timeline_invalid",
          `Clip ${clip.id} offset is invalid.`,
        );
      }
      if (!(clip.duration > 0)) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_timeline_invalid",
          `Clip ${clip.id} duration must be positive.`,
        );
      }
      if (!isStudioClipStartTimeAllowed(clip.startTime)) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_gap_too_large",
          `Clip ${clip.id} startTime ${clip.startTime}s exceeds Studio max ${MAX_STUDIO_AUDIO_DURATION_SECONDS}s.`,
        );
      }
      if (!isStudioClipDurationAllowed(clip.duration)) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_clip_exceeds_asset",
          `Clip ${clip.id} duration ${clip.duration}s exceeds Studio max ${MAX_STUDIO_AUDIO_DURATION_SECONDS}s.`,
        );
      }
      if (clip.offset > asset.durationSeconds + 1e-6) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_clip_exceeds_asset",
          `Clip ${clip.id} offset exceeds asset ${asset.id} duration.`,
        );
      }
      const gap = clip.startTime - previousEnd;
      if (!isStudioClipGapAllowed(gap)) {
        throw new StudioRenderTimelineGuardError(
          "studio_render_gap_too_large",
          `Clip ${clip.id} gap/startTime ${gap}s exceeds Studio max ${MAX_STUDIO_AUDIO_DURATION_SECONDS}s.`,
        );
      }
      previousEnd = Math.max(previousEnd, clip.startTime + clip.duration);
    }
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
