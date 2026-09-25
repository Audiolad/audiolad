import { MUSIC_MASTERS_BUCKET, MUSIC_STREAMS_BUCKET } from "@/lib/author-products/music-master-upload-contract";
import { PRACTICE_AUDIO_BUCKET } from "@/lib/author-products/product-audio-upload-contract";

export const MUSIC_TRACK_CLEANUP_BUCKETS = [
  MUSIC_MASTERS_BUCKET,
  MUSIC_STREAMS_BUCKET,
  PRACTICE_AUDIO_BUCKET,
] as const;

const CLEANUP_BUCKETS = new Set<string>(MUSIC_TRACK_CLEANUP_BUCKETS);

export type MusicStorageObjectRef = {
  bucket: string;
  path: string;
};

export type MusicTrackTeardownStatus = "deleted" | "cleared" | "not_found";

export function musicStorageObjectKey(bucket: string, path: string): string {
  return `${bucket}\n${path}`;
}

/**
 * Legacy master rows have a null generation and may still claim desired.
 * A numbered generation applies only when it is the track's current one.
 */
export function musicMasterFinalizeClaimsDesired(
  currentGeneration: number,
  assetGeneration: number | null | undefined,
): boolean {
  if (!Number.isInteger(currentGeneration) || currentGeneration < 0) {
    return false;
  }
  if (assetGeneration == null) {
    return true;
  }
  return assetGeneration === currentGeneration;
}

/**
 * Before any claim, direct MP3 activation stays compatible with older callers.
 * After a claim, only the storage path recorded for the current generation applies.
 */
export function musicDirectMp3ClaimApplies(
  currentGeneration: number,
  claimGeneration: number | null | undefined,
): boolean {
  if (!Number.isInteger(currentGeneration) || currentGeneration < 0) {
    return false;
  }
  if (currentGeneration === 0) {
    return true;
  }
  return claimGeneration === currentGeneration;
}

export function latestMusicUploadGeneration(generations: readonly number[]): number | null {
  const valid = generations.filter((generation) => Number.isInteger(generation) && generation > 0);
  if (valid.length === 0) {
    return null;
  }
  return Math.max(...valid);
}

export function storageObjectsToRemove(
  objects: ReadonlyArray<{ bucket?: string | null; path?: string | null }>,
  protectedKeys: ReadonlySet<string> = new Set(),
): MusicStorageObjectRef[] {
  const seen = new Set<string>();
  const removable: MusicStorageObjectRef[] = [];
  for (const object of objects) {
    const bucket = object.bucket?.trim() ?? "";
    const path = object.path?.trim() ?? "";
    if (!bucket || !path || !CLEANUP_BUCKETS.has(bucket)) {
      continue;
    }
    const key = musicStorageObjectKey(bucket, path);
    if (protectedKeys.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    removable.push({ bucket, path });
  }
  return removable;
}

export function staleUploadCleanupPaths(input: {
  failedPath: string | null | undefined;
  livePaths: readonly (string | null | undefined)[];
}): string[] {
  const failed = input.failedPath?.trim() ?? "";
  if (!failed) {
    return [];
  }
  const live = new Set(
    input.livePaths
      .map((path) => path?.trim() ?? "")
      .filter((path) => path.length > 0),
  );
  if (live.has(failed)) {
    return [];
  }
  return [failed];
}

export function musicTrackHasServerAudio(
  item:
    | {
        audio_path?: string | null;
        active_music_delivery_asset_id?: string | null;
        desired_music_master_asset_id?: string | null;
        music_master?: unknown | null;
      }
    | null
    | undefined,
): boolean {
  if (!item) {
    return false;
  }
  return Boolean(
    (typeof item.audio_path === "string" && item.audio_path.trim()) ||
      item.active_music_delivery_asset_id ||
      item.desired_music_master_asset_id ||
      item.music_master,
  );
}

export function readMusicTrackTeardownResult(data: unknown): {
  status: MusicTrackTeardownStatus;
  objects: Array<{ bucket: string; path: string }>;
} | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return null;
  }
  const status = (row as { status?: unknown }).status;
  if (status !== "deleted" && status !== "cleared" && status !== "not_found") {
    return null;
  }
  const rawObjects = (row as { objects?: unknown }).objects;
  const objects = Array.isArray(rawObjects)
    ? rawObjects.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }
        const bucket = (entry as { bucket?: unknown }).bucket;
        const path = (entry as { path?: unknown }).path;
        if (typeof bucket !== "string" || typeof path !== "string") {
          return [];
        }
        return [{ bucket, path }];
      })
    : [];
  return { status, objects };
}
