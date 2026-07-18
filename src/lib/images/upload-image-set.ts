import { IMAGE_IMMUTABLE_CACHE_CONTROL } from "@/lib/images/image-constants";
import { profileStoresOriginal } from "@/lib/images/image-profiles";
import { getImageProfileConfig } from "@/lib/images/image-profiles";
import {
  buildImageManifestFromProcessed,
  getPrimaryVariantKey,
} from "@/lib/images/image-manifest";
import { buildVariantPathsForProfile } from "@/lib/images/image-paths";
import { processImageForProfile } from "@/lib/images/process-image";
import type {
  ImageManifest,
  ImageProfile,
  ProcessedImageSet,
  StoredImageSet,
} from "@/lib/images/image-types";

type StorageBucketClient = {
  upload: (
    path: string,
    body: Buffer,
    options: {
      contentType: string;
      upsert: boolean;
      cacheControl?: string;
    },
  ) => Promise<{ error: { message: string } | null }>;
  remove: (paths: string[]) => Promise<unknown>;
};

export type UploadImageSetContext = {
  practiceId?: string;
  audioItemId?: string;
  authorId?: string;
  authorKind?: "avatar" | "banner";
  userId?: string;
  playlistId?: string;
};

export type UploadImageSetOptions = {
  profile: ImageProfile;
  bucket: string;
  buffer: Buffer;
  declaredMime: string | null | undefined;
  storage: {
    from: (bucket: string) => StorageBucketClient;
  };
  context: UploadImageSetContext;
  storeOriginal?: boolean;
  originalCacheControl?: string;
};

export async function uploadProcessedImageSet(
  processed: ProcessedImageSet,
  options: Omit<UploadImageSetOptions, "buffer" | "declaredMime">,
): Promise<
  | { ok: true; data: StoredImageSet }
  | { ok: false; code: "upload_failed"; uploadedPaths: string[] }
> {
  const paths = buildVariantPathsForProfile(
    options.profile,
    processed,
    options.context,
  );

  const bucket = options.storage.from(options.bucket);
  const uploadedPaths: string[] = [];

  const uploadOne = async (
    path: string,
    body: Buffer,
    contentType: string,
    cacheControl: string,
    upsert: boolean,
  ) => {
    const { error } = await bucket.upload(path, body, {
      contentType,
      upsert,
      cacheControl,
    });

    if (error) {
      throw new Error(error.message);
    }

    uploadedPaths.push(path);
  };

  const config = getImageProfileConfig(options.profile);
  const storeOriginal =
    options.storeOriginal ?? profileStoresOriginal(options.profile);

  try {
    if (
      storeOriginal &&
      processed.originalBuffer.length > 0 &&
      paths.originalPath
    ) {
      await uploadOne(
        paths.originalPath,
        processed.originalBuffer,
        `image/${processed.originalExtension === "jpg" ? "jpeg" : processed.originalExtension}`,
        options.originalCacheControl ?? "3600",
        false,
      );
    }

    for (const variant of processed.variants) {
      const variantPath = paths.variantPaths[variant.key];

      if (!variantPath) {
        continue;
      }

      await uploadOne(
        variantPath,
        variant.buffer,
        variant.mimeType,
        IMAGE_IMMUTABLE_CACHE_CONTROL,
        false,
      );
    }
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await bucket.remove(uploadedPaths).catch(() => undefined);
    }

    console.error("image_set_upload_error", error instanceof Error ? error.message : error);
    return { ok: false, code: "upload_failed", uploadedPaths: [] };
  }

  const manifest = buildImageManifestFromProcessed(processed, {
    ...paths,
    originalPath: storeOriginal ? paths.originalPath : undefined,
  });
  const primaryKey = getPrimaryVariantKey(options.profile);
  const primaryDisplayPath =
    paths.variantPaths[primaryKey] ??
    paths.variantPaths.lg ??
    paths.variantPaths.md ??
    Object.values(paths.variantPaths)[0] ??
    "";

  if (!primaryDisplayPath) {
    await bucket.remove(uploadedPaths).catch(() => undefined);
    return { ok: false, code: "upload_failed", uploadedPaths: [] };
  }

  return {
    ok: true,
    data: {
      manifest,
      primaryDisplayPath,
    },
  };
}

export async function processAndUploadImageSet(
  options: UploadImageSetOptions,
): Promise<
  | { ok: true; data: StoredImageSet & { processed: ProcessedImageSet } }
  | {
      ok: false;
      code: string;
      uploadedPaths?: string[];
    }
> {
  const processed = await processImageForProfile(
    options.buffer,
    options.declaredMime,
    options.profile,
  );

  if (!processed.ok) {
    return { ok: false, code: processed.code };
  }

  const uploaded = await uploadProcessedImageSet(processed.data, options);

  if (!uploaded.ok) {
    return { ok: false, code: uploaded.code, uploadedPaths: uploaded.uploadedPaths };
  }

  return {
    ok: true,
    data: {
      ...uploaded.data,
      processed: processed.data,
    },
  };
}

export async function removeStoragePathsSafe(
  storage: { from: (bucket: string) => StorageBucketClient },
  bucket: string,
  paths: string[],
): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];

  if (unique.length === 0) {
    return;
  }

  await storage.from(bucket).remove(unique).catch(() => undefined);
}

export function getManifestFromUnknown(value: unknown): ImageManifest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as ImageManifest;
}
