import "server-only";

import {
  STUDIO_LIMITS,
  STUDIO_SCHEMA_VERSION,
  STUDIO_TECHNICAL_VERSION,
  type StudioProjectDataV2,
} from "./model";

export class StudioApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
]);

export function parseUuid(value: unknown, code = "invalid_request"): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new StudioApiError(code, 400);
  }
  return value;
}

export function parseRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new StudioApiError("invalid_expected_revision", 422);
  }
  return value as number;
}

export function sanitizeStudioName(value: unknown): string {
  if (typeof value !== "string") {
    throw new StudioApiError("invalid_name", 422);
  }
  const name = value.normalize("NFC").replace(CONTROL_CHARACTERS, "").trim();
  if (!name || name.length > 200) {
    throw new StudioApiError("invalid_name", 422);
  }
  return name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validateNoRuntime(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(validateNoRuntime);
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (Object.hasOwn(value, "runtime")) {
    throw new StudioApiError("runtime_data_not_allowed", 422);
  }
  Object.values(value).forEach(validateNoRuntime);
}

function expectUniqueIds(items: unknown[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
      throw new StudioApiError(`invalid_${label}`, 422);
    }
    if (ids.has(item.id)) {
      throw new StudioApiError(`duplicate_${label}_id`, 422);
    }
    ids.add(item.id);
  }
  return ids;
}

export function parseStudioProjectData(value: unknown): StudioProjectDataV2 {
  if (!isRecord(value)) {
    throw new StudioApiError("invalid_project_data", 422);
  }
  validateNoRuntime(value);

  const allowedKeys = new Set([
    "schemaVersion",
    "studioVersion",
    "editor",
    "slots",
    "tracks",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new StudioApiError("invalid_project_data", 422);
  }
  if (
    value.schemaVersion !== STUDIO_SCHEMA_VERSION ||
    value.studioVersion !== STUDIO_TECHNICAL_VERSION ||
    !isRecord(value.editor) ||
    !hasOnlyKeys(value.editor, ["currentTime"]) ||
    !finiteNonNegative(value.editor.currentTime) ||
    !Array.isArray(value.slots) ||
    !Array.isArray(value.tracks)
  ) {
    throw new StudioApiError("invalid_project_data", 422);
  }

  const slotIds = expectUniqueIds(value.slots, "slot");
  const trackIds = expectUniqueIds(value.tracks, "track");

  const assignedTracks = new Set<string>();
  for (const slot of value.slots) {
    if (
      !isRecord(slot) ||
      !hasOnlyKeys(slot, ["id", "name", "audioTrackId"]) ||
      typeof slot.name !== "string" ||
      !slot.name.trim() ||
      (slot.audioTrackId !== null &&
        (typeof slot.audioTrackId !== "string" ||
          !trackIds.has(slot.audioTrackId)))
    ) {
      throw new StudioApiError("invalid_slot", 422);
    }
    if (slot.audioTrackId) {
      if (assignedTracks.has(slot.audioTrackId)) {
        throw new StudioApiError("duplicate_slot_track", 422);
      }
      assignedTracks.add(slot.audioTrackId);
    }
  }
  void slotIds;

  const clipIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const track of value.tracks) {
    if (
      !isRecord(track) ||
      !hasOnlyKeys(track, ["id", "assetId", "name", "volume", "muted", "clips"]) ||
      typeof track.assetId !== "string" ||
      !UUID_PATTERN.test(track.assetId) ||
      typeof track.name !== "string" ||
      !track.name.trim() ||
      typeof track.volume !== "number" ||
      !Number.isFinite(track.volume) ||
      track.volume < 0 ||
      track.volume > 1 ||
      typeof track.muted !== "boolean" ||
      !Array.isArray(track.clips)
    ) {
      throw new StudioApiError("invalid_track", 422);
    }

    if (assetIds.has(track.assetId)) {
      throw new StudioApiError("duplicate_track_asset", 422);
    }
    assetIds.add(track.assetId);

    const clips: Array<Record<string, unknown>> = [];
    for (const clip of track.clips) {
      if (
        !isRecord(clip) ||
        !hasOnlyKeys(clip, [
          "id",
          "startTime",
          "offset",
          "duration",
          "fadeInDuration",
          "fadeOutDuration",
        ]) ||
        typeof clip.id !== "string" ||
        !clip.id.trim() ||
        clipIds.has(clip.id) ||
        !finiteNonNegative(clip.startTime) ||
        !finiteNonNegative(clip.offset) ||
        typeof clip.duration !== "number" ||
        !Number.isFinite(clip.duration) ||
        clip.duration <= 0 ||
        !finiteNonNegative(clip.fadeInDuration) ||
        !finiteNonNegative(clip.fadeOutDuration) ||
        clip.fadeInDuration + clip.fadeOutDuration > clip.duration
      ) {
        throw new StudioApiError("invalid_clip", 422);
      }
      clipIds.add(clip.id);
      clips.push(clip);
    }

    // Preserve intentional gaps while rejecting overlap after ripple edits.
    clips.sort((left, right) => Number(left.startTime) - Number(right.startTime));
    for (let index = 1; index < clips.length; index += 1) {
      const previous = clips[index - 1];
      const current = clips[index];
      if (
        Number(current.startTime) <
        Number(previous.startTime) + Number(previous.duration)
      ) {
        throw new StudioApiError("invalid_ripple_layout", 422);
      }
    }
  }

  return value as StudioProjectDataV2;
}

export function sanitizeStudioFilename(value: unknown): string {
  if (typeof value !== "string") {
    throw new StudioApiError("invalid_filename", 422);
  }
  const base = value
    .normalize("NFC")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(CONTROL_CHARACTERS, "")
    .trim();
  if (!base || base.length > 240) {
    throw new StudioApiError("invalid_filename", 422);
  }
  const sanitized = base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new StudioApiError("invalid_filename", 422);
  }
  return sanitized;
}

export function parseStudioSourceType(value: unknown): "upload" | "recording" {
  if (value === "upload" || value === "recording") {
    return value;
  }
  throw new StudioApiError("invalid_source_type", 422);
}

export function validateStudioUpload(file: File): {
  filename: string;
  mimeType: string;
  byteSize: number;
} {
  const filename = sanitizeStudioFilename(file.name);
  const mimeType = file.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new StudioApiError("unsupported_mime_type", 422);
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new StudioApiError("empty_file", 422);
  }
  if (file.size > STUDIO_LIMITS.maxAssetBytes) {
    throw new StudioApiError("asset_too_large", 413);
  }
  return { filename, mimeType, byteSize: file.size };
}

export function parseDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const duration = typeof value === "string" ? Number(value) : value;
  if (!finiteNonNegative(duration)) {
    throw new StudioApiError("invalid_duration", 422);
  }
  return duration;
}

export function buildStudioAssetPath(
  authorId: string,
  projectId: string,
  assetId: string,
  filename: string,
): string {
  return `studio/${authorId}/${projectId}/${assetId}/${filename}`;
}

export function isStudioStoragePath(
  path: string,
  authorId: string,
  projectId: string,
  assetId: string,
): boolean {
  if (path.includes("..") || path.includes("\\")) {
    return false;
  }
  return (
    path ===
    `studio/${authorId}/${projectId}/${assetId}/${path.split("/").at(-1)}`
  ) && /^studio\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\/[A-Za-z0-9._-]+$/.test(path);
}
