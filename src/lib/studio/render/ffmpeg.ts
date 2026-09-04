import { getStudioRenderClipSourceDuration } from "../clip-math";
import { STUDIO_VOICE_PRESET_CONFIG, type StudioVoicePreset } from "../voice-preset-dsp";
import { buildStudioRenderTimeline } from "./timeline";
import type { StudioRenderInput } from "./types";

type FilterGraph = Readonly<{
  filterComplex: string;
  assetInputPaths: readonly string[];
  irPresets: readonly Exclude<StudioVoicePreset, "none">[];
  durationSeconds: number;
}>;

function seconds(value: number): string {
  return value.toFixed(6);
}

function inputLabel(index: number): string {
  return `[${index}:a]`;
}

function eqFilter(type: string, frequency: number, q: number, gain?: number): string {
  if (type === "highpass") return `highpass=f=${frequency}:width_type=q:width=${q}`;
  if (type === "lowshelf") return `bass=g=${gain ?? 0}:f=${frequency}:width_type=q:width=${q}`;
  if (type === "highshelf") return `treble=g=${gain ?? 0}:f=${frequency}:width_type=q:width=${q}`;
  return `equalizer=f=${frequency}:width_type=q:width=${q}:g=${gain ?? 0}`;
}

/**
 * Prefer `apad,atrim=duration=X` over `apad=whole_dur=X`: whole_dur can fail when
 * atrim EOF shortens samples while duration metadata confuses the pad target.
 */
function padToDuration(durationSeconds: number): string {
  return `apad,atrim=duration=${seconds(durationSeconds)}`;
}

/**
 * Produces an argument-safe filter graph.  The only semantic approximation is
 * FFmpeg's bass/treble shelf shape versus Web Audio's BiquadFilterNode shelf;
 * Q and gain are still passed explicitly and live in the canonical config.
 */
export function buildStudioRenderFilterGraph(input: StudioRenderInput): FilterGraph {
  const timeline = buildStudioRenderTimeline(input.snapshot);
  if (timeline.tracks.length === 0 || timeline.durationSeconds <= 0) {
    throw new Error("Studio project has no audible clips to render.");
  }

  const assetInputPaths = input.snapshot.assets.map((asset) => {
    const localPath = input.localAssetPaths.get(asset.id);
    if (!localPath) throw new Error(`Missing local file for persisted asset ${asset.id}.`);
    return localPath;
  });
  const assetIndexes = new Map(input.snapshot.assets.map((asset, index) => [asset.id, index]));
  const assetsById = new Map(input.snapshot.assets.map((asset) => [asset.id, asset]));
  const irPresets = [...new Set(
    timeline.tracks
      .filter(({ track }) => track.trackKind === "voice" && track.voicePreset !== "none")
      .map(({ track }) => track.voicePreset as Exclude<StudioVoicePreset, "none">),
  )].sort();
  const irIndexes = new Map(irPresets.map((preset, index) => [preset, assetInputPaths.length + index]));
  const filters: string[] = [];
  const outputLabels: string[] = [];
  const clipsByAsset = new Map<string, number>();
  timeline.tracks.forEach(({ track }) => track.clips.forEach((clip) => {
    clipsByAsset.set(clip.assetId, (clipsByAsset.get(clip.assetId) ?? 0) + 1);
  }));
  const assetSplitLabels = new Map<string, string[]>();
  input.snapshot.assets.forEach((asset, assetIndex) => {
    const count = clipsByAsset.get(asset.id) ?? 0;
    if (count === 0) return;
    const labels = Array.from({ length: count }, (_, index) => `asset_${assetIndex}_${index}`);
    filters.push(`${inputLabel(assetIndex)}asplit=${count}${labels.map((label) => `[${label}]`).join("")}`);
    assetSplitLabels.set(asset.id, labels);
  });
  const nextAssetSplit = new Map<string, number>();

  timeline.tracks.forEach(({ track, audibleEnd }, trackIndex) => {
    let cursor = 0;
    const timelineParts: string[] = [];
    track.clips.forEach((clip, clipIndex) => {
      const gap = clip.startTime - cursor;
      if (gap > 0) {
        const gapLabel = `gap_${trackIndex}_${clipIndex}`;
        filters.push(
          `anullsrc=r=44100:cl=stereo,atrim=duration=${seconds(gap)},asetpts=PTS-STARTPTS[${gapLabel}]`,
        );
        timelineParts.push(`[${gapLabel}]`);
      }
      if (!assetIndexes.has(clip.assetId)) throw new Error(`Unknown asset ${clip.assetId}.`);
      const asset = assetsById.get(clip.assetId);
      if (!asset) throw new Error(`Unknown asset ${clip.assetId}.`);
      const splitIndex = nextAssetSplit.get(clip.assetId) ?? 0;
      const assetLabel = assetSplitLabels.get(clip.assetId)?.[splitIndex];
      if (!assetLabel) throw new Error(`Missing split source for asset ${clip.assetId}.`);
      nextAssetSplit.set(clip.assetId, splitIndex + 1);
      const label = `clip_${trackIndex}_${clipIndex}`;
      const sourceTrim = getStudioRenderClipSourceDuration(clip, asset.durationSeconds);
      const filterParts: string[] = [];
      if (sourceTrim > 0) {
        filterParts.push(
          `atrim=start=${seconds(clip.offset)}:duration=${seconds(sourceTrim)}`,
          "asetpts=PTS-STARTPTS",
          "aformat=sample_rates=44100:channel_layouts=stereo",
          padToDuration(clip.duration),
        );
      } else {
        // No usable source left after offset — fill geometric slot with silence.
        filterParts.push(
          `anullsrc=r=44100:cl=stereo,atrim=duration=${seconds(clip.duration)},asetpts=PTS-STARTPTS`,
          "aformat=sample_rates=44100:channel_layouts=stereo",
        );
      }
      if (clip.fadeInDuration > 0) {
        filterParts.push(`afade=t=in:st=0:d=${seconds(clip.fadeInDuration)}:curve=tri`);
      }
      if (clip.fadeOutDuration > 0) {
        filterParts.push(
          `afade=t=out:st=${seconds(clip.duration - clip.fadeOutDuration)}:d=${seconds(clip.fadeOutDuration)}:curve=tri`,
        );
      }
      if (sourceTrim > 0) {
        filters.push(`[${assetLabel}]${filterParts.join(",")}[${label}]`);
      } else {
        // Still consume the split label so asplit counts stay consistent.
        filters.push(`[${assetLabel}]anull,aformat=sample_rates=44100:channel_layouts=stereo[unused_${label}]`);
        filters.push(`${filterParts.join(",")}[${label}]`);
      }
      timelineParts.push(`[${label}]`);
      cursor = clip.startTime + clip.duration;
    });

    const timelineLabel = `track_timeline_${trackIndex}`;
    filters.push(
      `${timelineParts.join("")}concat=n=${timelineParts.length}:v=0:a=1,asetpts=PTS-STARTPTS,${padToDuration(audibleEnd)}[${timelineLabel}]`,
    );
    let currentLabel = timelineLabel;
    if (track.trackKind === "voice" && track.voicePreset !== "none") {
      const config = STUDIO_VOICE_PRESET_CONFIG[track.voicePreset];
      const eqLabel = `track_eq_${trackIndex}`;
      const eqs = config.filters.map((filter) =>
        eqFilter(filter.type, filter.frequency, filter.q, filter.gain),
      );
      filters.push(`[${currentLabel}]${eqs.join(",")}[${eqLabel}]`);
      currentLabel = eqLabel;
      const reverb = config.reverb;
      if (reverb) {
        const dryLabel = `track_dry_${trackIndex}`;
        const wetInputLabel = `track_wet_input_${trackIndex}`;
        const wetLabel = `track_wet_${trackIndex}`;
        const dspLabel = `track_dsp_${trackIndex}`;
        const irIndex = irIndexes.get(track.voicePreset);
        const wetDuration = Math.max(
          ...track.clips.map((clip) => clip.startTime + clip.duration),
        ) + reverb.impulseDurationSeconds;
        if (irIndex === undefined) throw new Error(`Missing IR input for ${track.voicePreset}.`);
        filters.push(`[${currentLabel}]asplit=2[${dryLabel}][${wetInputLabel}]`);
        filters.push(
          // In FFmpeg 6.1 afir's `dry` is the input gain to convolution, not
          // a bypass-output level. Zero would silence the wet signal.
          `[${wetInputLabel}]${padToDuration(wetDuration)}[wet_padded_${trackIndex}];[wet_padded_${trackIndex}]${inputLabel(irIndex)}afir=dry=1:wet=1:gtype=-1:irfmt=input:irload=init,highpass=f=${reverb.wetHighPassFrequency},lowpass=f=${reverb.wetLowPassFrequency},volume=${reverb.wetGain}[${wetLabel}]`,
        );
        filters.push(
          `[${dryLabel}]volume=${reverb.dryGain}[dry_gain_${trackIndex}];[dry_gain_${trackIndex}][${wetLabel}]amix=inputs=2:duration=longest:normalize=0,asetpts=PTS-STARTPTS[${dspLabel}]`,
        );
        currentLabel = dspLabel;
      }
    }
    const outputLabel = `track_out_${trackIndex}`;
    filters.push(`[${currentLabel}]volume=${track.volume}[${outputLabel}]`);
    outputLabels.push(`[${outputLabel}]`);
  });

  filters.push(
    `${outputLabels.join("")}amix=inputs=${outputLabels.length}:duration=longest:normalize=0,${padToDuration(timeline.durationSeconds)},asetpts=N/SR/TB,aformat=sample_rates=44100:channel_layouts=stereo[out]`,
  );
  return { filterComplex: filters.join(";"), assetInputPaths, irPresets, durationSeconds: timeline.durationSeconds };
}

export function studioRenderFfmpegOutputArgs(outputPath: string): string[] {
  return [
    "-map", "[out]",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    "-ar", "44100",
    "-ac", "2",
    "-write_xing", "0",
    "-y",
    outputPath,
  ];
}
