import {
  parseStudioProjectDocument,
  type StudioPersistedProjectState,
} from "../persistence";
import type {
  StudioProjectAssetRow,
  StudioProjectRow,
} from "../server/model";
import type { StudioRenderAsset, StudioRenderSnapshot, StudioRenderTrack } from "./types";

export class StudioRenderSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioRenderSnapshotError";
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function resolveTrackKind(
  document: StudioPersistedProjectState,
  trackId: string,
  persistedKind: "voice" | "music" | undefined,
): "voice" | "music" {
  if (persistedKind) return persistedKind;
  const slot = document.slots.find((candidate) => candidate.audioTrackId === trackId);
  return slot?.trackKind ?? "voice";
}

/**
 * Converts exactly one active, revisioned V2 project plus its persisted assets
 * into a serializable render input. Pending local files and duration-less
 * assets are deliberately rejected: a renderer cannot reproduce them.
 */
export function createStudioRenderSnapshot(input: {
  project: StudioProjectRow;
  expectedRevision: number;
  assets: readonly StudioProjectAssetRow[];
}): StudioRenderSnapshot {
  const { project, expectedRevision } = input;
  if (project.status !== "active" || project.deleted_at !== null) {
    throw new StudioRenderSnapshotError("Only active Studio projects can be rendered.");
  }
  if (project.revision !== expectedRevision) {
    throw new StudioRenderSnapshotError(
      `Project revision ${project.revision} does not match requested revision ${expectedRevision}.`,
    );
  }

  const document = parseStudioProjectDocument(project.project_data);
  const referencedAssetIds = new Set(document.tracks.map((track) => track.assetId));
  const assets = new Map<string, StudioRenderAsset>();
  for (const asset of input.assets) {
    if (
      asset.project_id !== project.id ||
      !referencedAssetIds.has(asset.id) ||
      asset.deleted_at !== null ||
      asset.duration_seconds === null ||
      !Number.isFinite(asset.duration_seconds) ||
      asset.duration_seconds <= 0
    ) {
      continue;
    }
    assets.set(asset.id, {
      id: asset.id,
      storagePath: asset.storage_path,
      mimeType: asset.mime_type,
      durationSeconds: asset.duration_seconds,
      sourceType: asset.source_type,
    });
  }

  const tracks: StudioRenderTrack[] = document.tracks.map((track) => {
    const asset = assets.get(track.assetId);
    if (!asset) {
      throw new StudioRenderSnapshotError(
        `Track ${track.id} references an unavailable, deleted, or transient asset ${track.assetId}.`,
      );
    }
    const clips = track.clips.map((clip) => ({
      ...clip,
      assetId: track.assetId,
    }));
    return {
      id: track.id,
      slotId: document.slots.find((slot) => slot.audioTrackId === track.id)?.id ?? null,
      trackKind: resolveTrackKind(document, track.id, track.trackKind),
      volume: track.volume,
      muted: track.muted,
      voicePreset: track.voicePreset ?? "none",
      assetId: track.assetId,
      clips,
    };
  });

  return freeze({
    project: {
      id: project.id,
      revision: project.revision,
      name: project.name,
      schemaVersion: project.project_data.schemaVersion,
      studioVersion: project.project_data.studioVersion,
    },
    tracks,
    assets: [...assets.values()].sort((left, right) => left.id.localeCompare(right.id)),
  });
}
