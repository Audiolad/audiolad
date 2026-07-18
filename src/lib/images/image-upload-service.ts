import type { SupabaseClient } from "@supabase/supabase-js";

import { getCoverPublicUrl } from "@/lib/author-products/utils";
import { getAuthorAssetPublicUrl } from "@/lib/authors/assets";
import {
  listManifestStoragePaths,
  sanitizePublicImageManifest,
} from "@/lib/images/image-manifest";
import { profileStoresOriginal } from "@/lib/images/image-profiles";
import type { ImageManifest } from "@/lib/images/image-types";
import {
  processAndUploadImageSet,
  removeStoragePathsSafe,
} from "@/lib/images/upload-image-set";
import type { ImageProfile, StoredImageSet } from "@/lib/images/image-types";
import type { UploadImageSetContext } from "@/lib/images/upload-image-set";

type StorageClient = SupabaseClient["storage"];

export type ImageUploadParams = {
  profile: ImageProfile;
  bucket: string;
  buffer: Buffer;
  declaredMime: string | null | undefined;
  storage: StorageClient;
  context: UploadImageSetContext;
};

export async function uploadOptimizedImageSet(
  params: ImageUploadParams,
): Promise<
  | { ok: true; data: StoredImageSet }
  | { ok: false; code: string }
> {
  const result = await processAndUploadImageSet({
    ...params,
    storage: { from: (bucket) => params.storage.from(bucket) },
    storeOriginal: profileStoresOriginal(params.profile),
  });

  if (!result.ok) {
    return { ok: false, code: result.code };
  }

  return {
    ok: true,
    data: {
      manifest: result.data.manifest,
      primaryDisplayPath: result.data.primaryDisplayPath,
    },
  };
}

export function sanitizeManifestForClient(
  manifest: ImageManifest | null | undefined,
): ImageManifest | null {
  return sanitizePublicImageManifest(manifest);
}

export function resolvePublicUrlForBucket(
  bucket: string,
  path: string,
): string {
  if (bucket === "practice-covers") {
    return getCoverPublicUrl(path);
  }

  if (bucket === "author-assets") {
    return getAuthorAssetPublicUrl(path);
  }

  return path;
}

export async function cleanupImageManifest(
  storage: StorageClient,
  bucket: string,
  manifest: ImageManifest | null | undefined,
): Promise<void> {
  if (!manifest) {
    return;
  }

  await removeStoragePathsSafe(
    { from: (b) => storage.from(b) },
    bucket,
    listManifestStoragePaths(manifest),
  );
}

export function primaryPublicUrl(
  bucket: string,
  stored: StoredImageSet,
  cacheBuster?: string | number,
): string {
  const base = resolvePublicUrlForBucket(bucket, stored.primaryDisplayPath);

  if (cacheBuster === undefined) {
    return base;
  }

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}v=${encodeURIComponent(String(cacheBuster))}`;
}
