import "server-only";

import {
  STUDIO_ASSETS_BUCKET,
  STUDIO_LIMITS,
} from "../limits";
import type { StudioVoicePreset } from "../voice-preset-dsp";

export { STUDIO_ASSETS_BUCKET, STUDIO_LIMITS };
export {
  MAX_STUDIO_ASSET_BYTES,
  MAX_STUDIO_AUDIO_DURATION_SECONDS,
  MAX_STUDIO_PROJECT_BYTES,
} from "../limits";

export const STUDIO_SCHEMA_VERSION = 2 as const;
export const STUDIO_TECHNICAL_VERSION = 1 as const;

export type StudioAssetUploadState =
  | "reserved"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

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
  author_id: string | null;
  guest_session_id: string | null;
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
  source_id?: string | null;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  source_type: "upload" | "recording";
  upload_state?: StudioAssetUploadState;
  pending_source_id?: string | null;
  pending_storage_path?: string | null;
  pending_size_bytes?: number | null;
  pending_original_name?: string | null;
  pending_mime_type?: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type StudioAssetPeaksDto = {
  version: 1;
  columns: number;
  dataBase64: string;
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

export function toStudioAssetDto(
  asset: StudioProjectAssetRow,
  peaks?: StudioAssetPeaksDto | null,
) {
  return {
    id: asset.id,
    projectId: asset.project_id,
    originalName: asset.original_name,
    mimeType: asset.mime_type,
    sizeBytes: Number(asset.size_bytes),
    durationSeconds: asset.duration_seconds,
    sourceType: asset.source_type,
    uploadState: asset.upload_state ?? "ready",
    createdAt: asset.created_at,
    peaks: peaks ?? null,
  };
}
