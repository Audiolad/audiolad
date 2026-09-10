import { CATALOG_MUSIC_UNAVAILABLE_MESSAGE } from "./catalog-asset";
import {
  parseStudioProjectDocument,
  type StudioPersistedProjectState,
} from "./persistence";
import type {
  StudioProjectAssetMetadata,
  StudioPersistedProject,
} from "./persistence-client";
import { parseStudioPlaybackExpiry } from "./signed-playback";

export const STUDIO_PROJECT_HYDRATION_TIMEOUT_MS = 120_000;

export const STUDIO_PROJECT_HYDRATION_TIMEOUT_MESSAGE =
  "Загрузка аудио заняла слишком много времени. Проверьте соединение и повторите попытку.";

export type StudioHydratedAsset = {
  metadata: StudioProjectAssetMetadata;
  playbackUrl: string;
  expiresAt: number;
  duration: number;
};

export type StudioHydrationAssetResult =
  | { assetId: string; asset: StudioHydratedAsset }
  | { assetId: string; error: Error };

export type StudioProjectHydration = {
  project: StudioPersistedProject;
  state: StudioPersistedProjectState;
  assets: Map<string, StudioHydratedAsset>;
  failures: Map<string, Error>;
  assetMetadata: ReadonlyMap<string, StudioProjectAssetMetadata>;
};

export type StudioHydrationFailureKind = "unmount" | "timeout" | "aborted";

export type StudioHydratedTrackLoadState = {
  status: "ready" | "error";
  replacementError: string | null;
};

export type StudioSignedPlaybackResult = {
  url: string;
  expiresAt: string | number;
  durationSeconds?: number | null;
};

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function resolveHydratedDuration(
  metadata: StudioProjectAssetMetadata,
  signed?: Pick<StudioSignedPlaybackResult, "durationSeconds">,
): number | null {
  const candidates = [signed?.durationSeconds, metadata.durationSeconds];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

/**
 * Initial open only needs assets that already appear on the timeline.
 * Empty tracks keep their assetId for a later lazy load.
 */
export function collectInitialHydrationAssetIds(
  tracks: readonly unknown[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const track of tracks) {
    if (!track || typeof track !== "object") continue;
    const assetId = (track as { assetId?: unknown }).assetId;
    const clips = (track as { clips?: unknown }).clips;
    if (typeof assetId !== "string" || assetId.length === 0) continue;
    if (!Array.isArray(clips) || clips.length === 0) continue;
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    ids.push(assetId);
  }
  return ids;
}

export function classifyStudioHydrationFailure({
  unmounted,
  timedOut,
  aborted = false,
}: {
  unmounted: boolean;
  timedOut: boolean;
  aborted?: boolean;
}): StudioHydrationFailureKind | null {
  if (unmounted) return "unmount";
  if (timedOut) return "timeout";
  if (aborted) return "aborted";
  return null;
}

export function createStudioHydrationTimeout({
  abort,
  timeoutMs = STUDIO_PROJECT_HYDRATION_TIMEOUT_MS,
  setTimeoutFn = (handler, timeout) => setTimeout(handler, timeout),
  clearTimeoutFn = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
}: {
  abort: () => void;
  timeoutMs?: number;
  setTimeoutFn?: (handler: () => void, timeout: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
}): {
  didTimeOut: () => boolean;
  cancel: () => void;
} {
  let timedOut = false;
  const id = setTimeoutFn(() => {
    timedOut = true;
    abort();
  }, timeoutMs);
  return {
    didTimeOut: () => timedOut,
    cancel: () => {
      clearTimeoutFn(id);
    },
  };
}

export function getHydratedTrackLoadState({
  clipsLength,
  hasAsset,
  failureMessage = null,
}: {
  clipsLength: number;
  hasAsset: boolean;
  failureMessage?: string | null;
}): StudioHydratedTrackLoadState {
  if (hasAsset) {
    return { status: "ready", replacementError: null };
  }
  if (clipsLength === 0 && !failureMessage) {
    return { status: "ready", replacementError: null };
  }
  return {
    status: "error",
    replacementError: failureMessage ?? "Не удалось загрузить аудио дорожки.",
  };
}

export async function loadPersistedStudioAsset({
  metadata,
  signPlayback,
  signal,
}: {
  metadata: StudioProjectAssetMetadata;
  signPlayback: (
    asset: StudioProjectAssetMetadata,
    signal?: AbortSignal,
  ) => Promise<StudioSignedPlaybackResult>;
  signal?: AbortSignal;
}): Promise<StudioHydratedAsset> {
  abortIfNeeded(signal);
  if (metadata.sourceType === "catalog" && metadata.available === false) {
    throw new Error(CATALOG_MUSIC_UNAVAILABLE_MESSAGE);
  }
  const signed = await signPlayback(metadata, signal);
  abortIfNeeded(signal);
  const playbackUrl = typeof signed.url === "string" ? signed.url.trim() : "";
  if (!playbackUrl) {
    throw new Error("Не удалось получить ссылку на аудио.");
  }
  const expiresAt = parseStudioPlaybackExpiry(signed.expiresAt);
  if (expiresAt == null) {
    throw new Error("Не удалось получить ссылку на аудио.");
  }
  const duration = resolveHydratedDuration(metadata, signed);
  if (duration == null) {
    throw new Error("Аудиофайл проекта повреждён.");
  }
  return {
    metadata,
    playbackUrl,
    expiresAt,
    duration,
  };
}

/**
 * Signs each referenced (non-empty) asset once. Playback stays on a private
 * signed URL; the browser streams it instead of downloading/decoding PCM.
 */
export async function hydrateStudioProject({
  project,
  assets,
  signPlayback,
  signal,
}: {
  project: StudioPersistedProject;
  assets: readonly StudioProjectAssetMetadata[];
  signPlayback: (
    asset: StudioProjectAssetMetadata,
    signal?: AbortSignal,
  ) => Promise<StudioSignedPlaybackResult>;
  signal?: AbortSignal;
}): Promise<StudioProjectHydration> {
  abortIfNeeded(signal);
  const state = parseStudioProjectDocument(project.projectData);
  const metadataById = new Map(assets.map((asset) => [asset.id, asset]));
  const assetIds = collectInitialHydrationAssetIds(state.tracks);
  const results = await Promise.all(
    assetIds.map(async (assetId): Promise<StudioHydrationAssetResult> => {
      const metadata = metadataById.get(assetId);
      if (!metadata) {
        return { assetId, error: new Error("Аудиофайл проекта не найден.") };
      }
      try {
        const asset = await loadPersistedStudioAsset({
          metadata,
          signPlayback,
          signal,
        });
        return { assetId, asset };
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
  return { project, state, assets: hydratedAssets, failures, assetMetadata: metadataById };
}
