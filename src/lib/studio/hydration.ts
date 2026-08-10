import {
  parseStudioProjectDocument,
  type StudioPersistedProjectState,
} from "./persistence";
import type {
  StudioProjectAssetMetadata,
  StudioPersistedProject,
} from "./persistence-client";

export type StudioHydratedAsset = {
  metadata: StudioProjectAssetMetadata;
  blob: Blob;
  file: File;
  buffer: AudioBuffer;
};

export type StudioHydrationAssetResult =
  | { assetId: string; asset: StudioHydratedAsset }
  | { assetId: string; error: Error };

export type StudioProjectHydration = {
  project: StudioPersistedProject;
  state: StudioPersistedProjectState;
  assets: Map<string, StudioHydratedAsset>;
  failures: Map<string, Error>;
};

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

/**
 * Fetches each referenced asset once. Decoding is injected so the caller can
 * use the audio provider's existing AudioContext rather than creating another.
 */
export async function hydrateStudioProject({
  project,
  assets,
  download,
  decode,
  signal,
}: {
  project: StudioPersistedProject;
  assets: readonly StudioProjectAssetMetadata[];
  download: (asset: StudioProjectAssetMetadata, signal?: AbortSignal) => Promise<Blob>;
  decode: (blob: Blob, metadata: StudioProjectAssetMetadata) => Promise<AudioBuffer>;
  signal?: AbortSignal;
}): Promise<StudioProjectHydration> {
  abortIfNeeded(signal);
  const state = parseStudioProjectDocument(project.projectData);
  const metadataById = new Map(assets.map((asset) => [asset.id, asset]));
  const assetIds = [...new Set(state.tracks.map((track) => track.assetId))];
  const results = await Promise.all(
    assetIds.map(async (assetId): Promise<StudioHydrationAssetResult> => {
      const metadata = metadataById.get(assetId);
      if (!metadata) {
        return { assetId, error: new Error("Аудиофайл проекта не найден.") };
      }
      try {
        const blob = await download(metadata, signal);
        abortIfNeeded(signal);
        const buffer = await decode(blob, metadata);
        abortIfNeeded(signal);
        if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) {
          throw new Error("Аудиофайл проекта повреждён.");
        }
        const file = new File([blob], metadata.originalName, {
          type: metadata.mimeType || blob.type,
        });
        return { assetId, asset: { metadata, blob, file, buffer } };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return {
          assetId,
          error: error instanceof Error ? error : new Error("Не удалось загрузить аудио."),
        };
      }
    }),
  );
  const hydratedAssets = new Map<string, StudioHydratedAsset>();
  const failures = new Map<string, Error>();
  for (const result of results) {
    if ("asset" in result) hydratedAssets.set(result.assetId, result.asset);
    else failures.set(result.assetId, result.error);
  }
  return { project, state, assets: hydratedAssets, failures };
}
