import type { StudioTrackKind, StudioVoicePreset } from "../persistence";

/**
 * Complete, runtime-free input to a render. It is intentionally composed from
 * the persisted document and persisted asset rows rather than editor state.
 */
export type StudioRenderSnapshot = Readonly<{
  project: Readonly<{
    id: string;
    revision: number;
    name: string;
    schemaVersion: number;
    studioVersion: number;
  }>;
  tracks: readonly StudioRenderTrack[];
  assets: readonly StudioRenderAsset[];
}>;

export type StudioRenderTrack = Readonly<{
  id: string;
  slotId: string | null;
  trackKind: StudioTrackKind;
  volume: number;
  muted: boolean;
  voicePreset: StudioVoicePreset;
  assetId: string;
  clips: readonly StudioRenderClip[];
}>;

export type StudioRenderClip = Readonly<{
  id: string;
  assetId: string;
  startTime: number;
  offset: number;
  duration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
}>;

export type StudioRenderFileAsset = Readonly<{
  id: string;
  sourceType: "upload" | "recording";
  storagePath: string;
  mimeType: string;
  durationSeconds: number;
}>;

export type StudioRenderCatalogAsset = Readonly<{
  id: string;
  sourceType: "catalog";
  practiceId: string;
  audioItemId: string;
  mimeType: string;
  durationSeconds: number;
}>;

export type StudioRenderAsset = StudioRenderFileAsset | StudioRenderCatalogAsset;

export function isStudioRenderCatalogAsset(
  asset: StudioRenderAsset,
): asset is StudioRenderCatalogAsset {
  return asset.sourceType === "catalog";
}

export function isStudioRenderFileAsset(
  asset: StudioRenderAsset,
): asset is StudioRenderFileAsset {
  return asset.sourceType === "upload" || asset.sourceType === "recording";
}

export type StudioRenderInput = Readonly<{
  snapshot: StudioRenderSnapshot;
  /** Local, already-authorized paths keyed by persisted asset ID. */
  localAssetPaths: ReadonlyMap<string, string>;
}>;
