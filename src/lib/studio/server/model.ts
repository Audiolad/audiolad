import "server-only";

import type { StudioVoicePreset } from "../voice-preset-dsp";

export const STUDIO_SCHEMA_VERSION = 2 as const;
export const STUDIO_TECHNICAL_VERSION = 1 as const;
export const STUDIO_ASSETS_BUCKET = "studio-draft-assets" as const;
export const STUDIO_LIMITS = {
  maxAssetBytes: 200 * 1024 * 1024,
  maxProjectAssetBytes: 750 * 1024 * 1024,
} as const;

export type StudioProjectDataV2 = {
  schemaVersion: typeof STUDIO_SCHEMA_VERSION;
  studioVersion: typeof STUDIO_TECHNICAL_VERSION;
  editor: { currentTime: number };
  slots: StudioSlotV2[];
  tracks: StudioTrackV2[];
};

export const EMPTY_STUDIO_PROJECT_DATA: StudioProjectDataV2 = {
  schemaVersion: STUDIO_SCHEMA_VERSION,
  studioVersion: STUDIO_TECHNICAL_VERSION,
  editor: { currentTime: 0 },
  slots: [
    { id: "slot-voice-1", name: "Голос 1", audioTrackId: null, trackKind: "voice" },
    { id: "slot-music-1", name: "Музыка 1", audioTrackId: null, trackKind: "music" },
  ],
  tracks: [],
};

export type StudioSlotV2 = {
  id: string;
  name: string;
  audioTrackId: string | null;
  trackKind?: "voice" | "music";
};

export type StudioTrackV2 = {
  id: string;
  assetId: string;
  name: string;
  volume: number;
  muted: boolean;
  trackKind?: "voice" | "music";
  voicePreset?: StudioVoicePreset;
  clips: StudioClipV2[];
};

export type StudioClipV2 = {
  id: string;
  startTime: number;
  offset: number;
  duration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
};

export type StudioProjectRow = {
  id: string;
  author_id: string;
  name: string;
  project_data: StudioProjectDataV2;
  schema_version: number;
  revision: number;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  deleted_at: string | null;
};

export type StudioProjectAssetRow = {
  id: string;
  project_id: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  source_type: "upload" | "recording";
  created_at: string;
  deleted_at: string | null;
};

export type StudioProjectListItem = Pick<
  StudioProjectRow,
  "id" | "name" | "updated_at" | "last_opened_at" | "revision"
>;

export function toStudioProjectDto(project: StudioProjectRow) {
  return {
    id: project.id,
    authorId: project.author_id,
    name: project.name,
    projectData: project.project_data,
    schemaVersion: project.schema_version,
    revision: project.revision,
    status: project.status,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    lastOpenedAt: project.last_opened_at,
  };
}

export function toStudioProjectListItemDto(project: StudioProjectListItem) {
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updated_at,
    lastOpenedAt: project.last_opened_at,
    revision: project.revision,
  };
}

export function toStudioAssetDto(asset: StudioProjectAssetRow) {
  return {
    id: asset.id,
    projectId: asset.project_id,
    originalName: asset.original_name,
    mimeType: asset.mime_type,
    sizeBytes: Number(asset.size_bytes),
    durationSeconds: asset.duration_seconds,
    sourceType: asset.source_type,
    createdAt: asset.created_at,
  };
}
