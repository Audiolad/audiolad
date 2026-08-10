import { getStudioClipEnd } from "./clip-math";

export const STUDIO_PROJECT_SCHEMA_VERSION = 2 as const;
export const STUDIO_PROJECT_STUDIO_VERSION = 1 as const;

export type StudioPersistenceErrorCode =
  | "invalid_document"
  | "unsupported_schema_version"
  | "unsupported_studio_version"
  | "unknown_field"
  | "invalid_editor"
  | "invalid_slot"
  | "invalid_track"
  | "invalid_clip"
  | "duplicate_slot_id"
  | "duplicate_track_id"
  | "duplicate_clip_id"
  | "duplicate_asset_id"
  | "duplicate_slot_track"
  | "dangling_slot_track"
  | "overlapping_clips"
  | "invalid_asset_duration"
  | "missing_asset_duration"
  | "clip_exceeds_asset_duration";

export class StudioPersistenceError extends Error {
  constructor(
    readonly code: StudioPersistenceErrorCode,
    readonly path?: string,
  ) {
    super(path ? `${code}: ${path}` : code);
    this.name = "StudioPersistenceError";
  }
}

export type StudioProjectDocumentV2 = {
  schemaVersion: typeof STUDIO_PROJECT_SCHEMA_VERSION;
  studioVersion: typeof STUDIO_PROJECT_STUDIO_VERSION;
  editor: { currentTime: number };
  slots: StudioPersistedSlot[];
  tracks: StudioPersistedTrack[];
};

export type StudioPersistedSlot = {
  id: string;
  name: string;
  audioTrackId: string | null;
  trackKind?: StudioTrackKind;
};

export type StudioTrackKind = "voice" | "music";
export type StudioVoicePreset = "clean" | "warm" | "deep" | "space";

export type StudioPersistedTrack = {
  id: string;
  assetId: string;
  name: string;
  volume: number;
  muted: boolean;
  trackKind?: StudioTrackKind;
  voicePreset?: StudioVoicePreset;
  clips: StudioPersistedClip[];
};

export type StudioPersistedClip = {
  id: string;
  startTime: number;
  offset: number;
  duration: number;
  fadeInDuration: number;
  fadeOutDuration: number;
};

/**
 * The deliberately small shape that can cross the editor/API boundary. Runtime
 * fields such as File, AudioBuffer, history, selection, and clipboard are not
 * represented here.
 */
export type StudioPersistableProjectInput = {
  currentTime: number;
  slots: readonly StudioPersistedSlot[];
  tracks: readonly StudioPersistableTrack[];
};

export type StudioPersistableTrack = {
  id: string;
  assetId?: string | null;
  assetPersistenceStatus?: "pending" | "uploading" | "saved" | "error";
  name: string;
  volume: number;
  muted: boolean;
  trackKind?: StudioTrackKind;
  voicePreset?: StudioVoicePreset;
  clips: readonly StudioPersistedClip[];
};

export type StudioPersistedProjectState = {
  currentTime: number;
  slots: StudioPersistedSlot[];
  tracks: StudioPersistedTrack[];
};

export type StudioProjectSerializationResult = {
  document: StudioProjectDocumentV2;
  pendingTrackIds: string[];
};

function fail(code: StudioPersistenceErrorCode, path?: string): never {
  throw new StudioPersistenceError(code, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function assertId(value: unknown, code: StudioPersistenceErrorCode, path: string): string {
  return isNonEmptyString(value) ? value : fail(code, path);
}

function assertKnownKeys(
  value: unknown,
  keys: readonly string[],
  code: StudioPersistenceErrorCode,
  path: string,
): Record<string, unknown> {
  if (!isRecord(value)) fail(code, path);
  if (!hasOnlyKeys(value, keys)) fail("unknown_field", path);
  return value;
}

function compareClips(left: StudioPersistedClip, right: StudioPersistedClip): number {
  return left.startTime - right.startTime || left.id.localeCompare(right.id);
}

function parseClip(value: unknown, path: string): StudioPersistedClip {
  const clip = assertKnownKeys(
    value,
    ["id", "startTime", "offset", "duration", "fadeInDuration", "fadeOutDuration"],
    "invalid_clip",
    path,
  );
  if (
    !isNonEmptyString(clip.id) ||
    !isFiniteNonNegative(clip.startTime) ||
    !isFiniteNonNegative(clip.offset) ||
    typeof clip.duration !== "number" ||
    !Number.isFinite(clip.duration) ||
    clip.duration <= 0 ||
    !isFiniteNonNegative(clip.fadeInDuration) ||
    !isFiniteNonNegative(clip.fadeOutDuration) ||
    clip.fadeInDuration + clip.fadeOutDuration > clip.duration
  ) {
    fail("invalid_clip", path);
  }

  return {
    id: clip.id,
    startTime: clip.startTime,
    offset: clip.offset,
    duration: clip.duration,
    fadeInDuration: clip.fadeInDuration,
    fadeOutDuration: clip.fadeOutDuration,
  };
}

function parseTrack(value: unknown, path: string): StudioPersistedTrack {
  const track = assertKnownKeys(
    value,
    ["id", "assetId", "name", "volume", "muted", "trackKind", "voicePreset", "clips"],
    "invalid_track",
    path,
  );
  if (
    !isNonEmptyString(track.id) ||
    !isUuid(track.assetId) ||
    !isNonEmptyString(track.name) ||
    typeof track.volume !== "number" ||
    !Number.isFinite(track.volume) ||
    track.volume < 0 ||
    track.volume > 2 ||
    typeof track.muted !== "boolean" ||
    (track.trackKind !== undefined && track.trackKind !== "voice" && track.trackKind !== "music") ||
    (track.voicePreset !== undefined && !["clean", "warm", "deep", "space"].includes(track.voicePreset as string)) ||
    !Array.isArray(track.clips)
  ) {
    fail("invalid_track", path);
  }

  const clips = track.clips.map((clip, index) => parseClip(clip, `${path}.clips[${index}]`));
  return {
    id: track.id,
    assetId: track.assetId,
    name: track.name,
    volume: track.volume,
    muted: track.muted,
    ...(track.trackKind === "voice" || track.trackKind === "music"
      ? { trackKind: track.trackKind }
      : {}),
    voicePreset: (track.voicePreset as StudioVoicePreset | undefined) ?? "clean",
    clips: clips.sort(compareClips),
  };
}

function parseSlot(value: unknown, path: string): StudioPersistedSlot {
  const slot = assertKnownKeys(value, ["id", "name", "audioTrackId", "trackKind"], "invalid_slot", path);
  if (
    !isNonEmptyString(slot.id) ||
    !isNonEmptyString(slot.name) ||
    (slot.audioTrackId !== null && !isNonEmptyString(slot.audioTrackId)) ||
    (slot.trackKind !== undefined && slot.trackKind !== "voice" && slot.trackKind !== "music")
  ) {
    fail("invalid_slot", path);
  }
  return {
    id: slot.id,
    name: slot.name,
    audioTrackId: slot.audioTrackId,
    ...(slot.trackKind === "voice" || slot.trackKind === "music"
      ? { trackKind: slot.trackKind }
      : {}),
  };
}

function serializeInputTrack(value: unknown, path: string): StudioPersistedTrack {
  if (!isRecord(value)) fail("invalid_track", path);
  const clips = Array.isArray(value.clips)
    ? value.clips.map((clip) => {
      if (!isRecord(clip)) return clip;
      return {
        id: clip.id,
        startTime: clip.startTime,
        offset: clip.offset,
        duration: clip.duration,
        fadeInDuration: clip.fadeInDuration,
        fadeOutDuration: clip.fadeOutDuration,
      };
    })
    : value.clips;
  return parseTrack({
    id: value.id,
    assetId: value.assetId,
    name: value.name,
    volume: value.volume,
    muted: value.muted,
    trackKind: value.trackKind,
    voicePreset: value.voicePreset,
    clips,
  }, path);
}

function serializeInputSlot(value: unknown, path: string): StudioPersistedSlot {
  if (!isRecord(value)) fail("invalid_slot", path);
  return parseSlot({
    id: value.id,
    name: value.name,
    audioTrackId: value.audioTrackId,
    trackKind: value.trackKind,
  }, path);
}

function validateAssetDurations(
  tracks: readonly StudioPersistedTrack[],
  assetDurations?: Map<string, number>,
): void {
  if (!assetDurations) return;
  for (const [assetId, duration] of assetDurations) {
    if (!isNonEmptyString(assetId) || !isFiniteNonNegative(duration)) {
      fail("invalid_asset_duration", `assetDurations.${assetId}`);
    }
  }
  for (const track of tracks) {
    const assetDuration = assetDurations.get(track.assetId);
    if (assetDuration === undefined) {
      fail("missing_asset_duration", `tracks.${track.id}.assetId`);
    }
    for (const clip of track.clips) {
      if (clip.offset + clip.duration > assetDuration) {
        fail("clip_exceeds_asset_duration", `tracks.${track.id}.clips.${clip.id}`);
      }
    }
  }
}

function validateRelationships(
  slots: readonly StudioPersistedSlot[],
  tracks: readonly StudioPersistedTrack[],
): void {
  const trackIds = new Set<string>();
  const assetIds = new Set<string>();
  const clipIds = new Set<string>();
  for (const track of tracks) {
    if (trackIds.has(track.id)) fail("duplicate_track_id", `tracks.${track.id}`);
    if (assetIds.has(track.assetId)) fail("duplicate_asset_id", `tracks.${track.id}`);
    trackIds.add(track.id);
    assetIds.add(track.assetId);

    for (let index = 0; index < track.clips.length; index += 1) {
      const clip = track.clips[index];
      if (clipIds.has(clip.id)) fail("duplicate_clip_id", `tracks.${track.id}.clips.${clip.id}`);
      clipIds.add(clip.id);
      if (index > 0 && clip.startTime < getStudioClipEnd(track.clips[index - 1])) {
        fail("overlapping_clips", `tracks.${track.id}.clips.${clip.id}`);
      }
    }
  }

  const slotIds = new Set<string>();
  const assignedTrackIds = new Set<string>();
  for (const slot of slots) {
    if (slotIds.has(slot.id)) fail("duplicate_slot_id", `slots.${slot.id}`);
    slotIds.add(slot.id);
    if (slot.audioTrackId === null) continue;
    if (!trackIds.has(slot.audioTrackId)) {
      fail("dangling_slot_track", `slots.${slot.id}.audioTrackId`);
    }
    if (assignedTrackIds.has(slot.audioTrackId)) {
      fail("duplicate_slot_track", `slots.${slot.id}.audioTrackId`);
    }
    assignedTrackIds.add(slot.audioTrackId);
  }
}

export function validateStudioProjectDocument(
  value: unknown,
  assetDurations?: Map<string, number>,
): StudioProjectDocumentV2 {
  const document = assertKnownKeys(
    value,
    ["schemaVersion", "studioVersion", "editor", "slots", "tracks"],
    "invalid_document",
    "document",
  );
  if (document.schemaVersion !== STUDIO_PROJECT_SCHEMA_VERSION) {
    fail("unsupported_schema_version", "schemaVersion");
  }
  if (document.studioVersion !== STUDIO_PROJECT_STUDIO_VERSION) {
    fail("unsupported_studio_version", "studioVersion");
  }
  const editor = assertKnownKeys(document.editor, ["currentTime"], "invalid_editor", "editor");
  if (!isFiniteNonNegative(editor.currentTime)) fail("invalid_editor", "editor.currentTime");
  if (!Array.isArray(document.slots) || !Array.isArray(document.tracks)) {
    fail("invalid_document", "document");
  }

  const slots = document.slots.map((slot, index) => parseSlot(slot, `slots[${index}]`));
  const tracks = document.tracks.map((track, index) => parseTrack(track, `tracks[${index}]`));
  validateRelationships(slots, tracks);
  validateAssetDurations(tracks, assetDurations);

  return {
    schemaVersion: STUDIO_PROJECT_SCHEMA_VERSION,
    studioVersion: STUDIO_PROJECT_STUDIO_VERSION,
    editor: { currentTime: editor.currentTime },
    slots,
    tracks,
  };
}

export function parseStudioProjectDocument(
  value: unknown,
  assetDurations?: Map<string, number>,
): StudioPersistedProjectState {
  const document = validateStudioProjectDocument(value, assetDurations);
  return {
    currentTime: document.editor.currentTime,
    slots: document.slots,
    tracks: document.tracks,
  };
}

export const deserializeStudioProjectDocument = parseStudioProjectDocument;

export function serializeStudioProjectState(
  input: StudioPersistableProjectInput,
  assetDurations?: Map<string, number>,
): StudioProjectSerializationResult {
  if (!isRecord(input) || !Array.isArray(input.slots) || !Array.isArray(input.tracks)) {
    fail("invalid_document", "input");
  }

  const pendingTrackIds: string[] = [];
  const pendingTrackIdSet = new Set<string>();
  const inputTrackIds = new Set<string>();
  const tracks: StudioPersistedTrack[] = [];

  for (let index = 0; index < input.tracks.length; index += 1) {
    const sourceTrack = input.tracks[index];
    if (!isRecord(sourceTrack)) fail("invalid_track", `tracks[${index}]`);
    const trackId = assertId(sourceTrack.id, "invalid_track", `tracks[${index}].id`);
    if (inputTrackIds.has(trackId)) {
      fail("duplicate_track_id", `tracks[${trackId}]`);
    }
    inputTrackIds.add(trackId);
    const assetId = sourceTrack.assetId;
    if (
      assetId === undefined ||
      assetId === null ||
      (typeof assetId === "string" && assetId.trim() === "")
    ) {
      pendingTrackIds.push(trackId);
      pendingTrackIdSet.add(trackId);
      continue;
    }
    tracks.push(serializeInputTrack(sourceTrack, `tracks[${index}]`));
  }

  const slots = input.slots.map((sourceSlot, index) => {
    const slot = serializeInputSlot(sourceSlot, `slots[${index}]`);
    return slot.audioTrackId !== null && pendingTrackIdSet.has(slot.audioTrackId)
      ? { ...slot, audioTrackId: null }
      : slot;
  });
  const currentTime = isFiniteNonNegative(input.currentTime) ? input.currentTime : 0;
  const document: StudioProjectDocumentV2 = {
    schemaVersion: STUDIO_PROJECT_SCHEMA_VERSION,
    studioVersion: STUDIO_PROJECT_STUDIO_VERSION,
    editor: { currentTime },
    slots,
    tracks,
  };

  return {
    document: validateStudioProjectDocument(document, assetDurations),
    pendingTrackIds,
  };
}

export function areStudioProjectDocumentsEqual(
  left: unknown,
  right: unknown,
): boolean {
  const leftDocument = validateStudioProjectDocument(left);
  const rightDocument = validateStudioProjectDocument(right);
  return JSON.stringify(leftDocument) === JSON.stringify(rightDocument);
}
