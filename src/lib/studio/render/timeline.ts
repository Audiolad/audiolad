import { STUDIO_VOICE_PRESET_CONFIG } from "../voice-preset-dsp";
import type { StudioRenderSnapshot, StudioRenderTrack } from "./types";

export type StudioRenderTimelineTrack = Readonly<{
  track: StudioRenderTrack;
  audibleEnd: number;
  tailSeconds: number;
}>;

export type StudioRenderTimeline = Readonly<{
  tracks: readonly StudioRenderTimelineTrack[];
  durationSeconds: number;
}>;

export function isStudioRenderTrackAudible(track: StudioRenderTrack): boolean {
  return !track.muted && track.volume > 0 && track.clips.length > 0;
}

export function getStudioRenderTrackTailSeconds(track: StudioRenderTrack): number {
  if (track.trackKind !== "voice" || track.voicePreset === "none") return 0;
  return STUDIO_VOICE_PRESET_CONFIG[track.voicePreset].reverb?.impulseDurationSeconds ?? 0;
}

/**
 * The output duration is the latest end of an audible clip plus that voice
 * track's convolution IR length. Muted/zero-gain tracks never extend it.
 */
export function buildStudioRenderTimeline(snapshot: StudioRenderSnapshot): StudioRenderTimeline {
  const tracks = snapshot.tracks
    .filter(isStudioRenderTrackAudible)
    .map((track) => {
      const audibleEnd = Math.max(...track.clips.map((clip) => clip.startTime + clip.duration));
      return {
        track,
        audibleEnd,
        tailSeconds: getStudioRenderTrackTailSeconds(track),
      };
    });
  return {
    tracks,
    durationSeconds: tracks.reduce(
      (duration, track) => Math.max(duration, track.audibleEnd + track.tailSeconds),
      0,
    ),
  };
}
