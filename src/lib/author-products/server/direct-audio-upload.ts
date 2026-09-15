import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requirePracticeMutationAccess } from "@/lib/author-products/auth";
import {
  MAX_PRODUCT_AUDIO_BYTES,
  PRACTICE_AUDIO_BUCKET,
  buildVersionedProductAudioPath,
  buildVersionedProductAudioSourcePath,
  canAbandonProductAudioUploadPath,
  canonicalProductAudioUploadMime,
  detectProductAudioSourceFormat,
  isOwnedVersionedProductAudioPath,
  isOwnedVersionedProductAudioSourcePath,
  parseProductAudioSourcePath,
  shouldBlockMusicAudioReplacement,
  shouldBlockProductAudioReplacement,
  validateProductAudioSourceDescriptor,
  validateProductMp3Descriptor,
  type MusicCurrentAudioPointers,
} from "@/lib/author-products/product-audio-upload-contract";
import { getAuthorProductDetail } from "@/lib/author-products/products";
import { syncPracticeAudioCompatibility } from "@/lib/author-products/publish";
import {
  PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
  PRODUCT_CONTENT_LOCKED_AFTER_SALE,
  getPracticeSaleLock,
  isProductContentLockedDbError,
} from "@/lib/author-products/sale-lock";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  probeStudioAudioFile,
  removeTempFile,
  studioAudioTempPath,
  writeStreamToTempFile,
} from "@/lib/studio/server/audio-duration";

export type ProductSignedUpload = {
  path: string;
  token: string;
};

export class ProductAudioUploadError extends Error {
  readonly code: string;
  readonly status: number;
  readonly userMessage?: string;

  constructor(code: string, status: number, userMessage?: string) {
    super(code);
    this.name = "ProductAudioUploadError";
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
  }
}

type OwnedAudioItem = {
  id: string;
  audio_path: string | null;
  active_music_delivery_asset_id: string | null;
  desired_music_master_asset_id: string | null;
};

type StorageObjectInfo = {
  size: number;
};

async function loadOwnedAudioItem(
  supabase: SupabaseClient,
  practiceId: string,
  audioId: string,
): Promise<OwnedAudioItem> {
  const { data, error } = await supabase
    .from("audio_items")
    .select(
      "id, audio_path, active_music_delivery_asset_id, desired_music_master_asset_id",
    )
    .eq("id", audioId)
    .eq("practice_id", practiceId)
    .maybeSingle();

  if (error) {
    console.error("author_audio_direct_upload_lookup_error", error.message);
    throw new ProductAudioUploadError("internal_error", 500);
  }

  if (!data?.id) {
    throw new ProductAudioUploadError("not_found", 404);
  }

  return data;
}

function musicPointersFromAudioItem(item: OwnedAudioItem): MusicCurrentAudioPointers {
  return {
    audioPath: item.audio_path,
    activeMusicDeliveryAssetId: item.active_music_delivery_asset_id,
    desiredMusicMasterAssetId: item.desired_music_master_asset_id,
  };
}

async function assertSaleLockAllowsMutation(
  practiceId: string,
  audioItem: OwnedAudioItem,
  productKind: string | null | undefined,
): Promise<void> {
  const service = createServiceRoleClient();
  const saleLock = await getPracticeSaleLock(service, practiceId);
  const blocked =
    productKind === "music"
      ? shouldBlockMusicAudioReplacement(saleLock.locked, musicPointersFromAudioItem(audioItem))
      : shouldBlockProductAudioReplacement(saleLock.locked, audioItem.audio_path);
  if (blocked) {
    throw new ProductAudioUploadError(
      PRODUCT_CONTENT_LOCKED_AFTER_SALE,
      409,
      PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
    );
  }
}

function requireOwnedUploadPath(
  uploadPath: string,
  practiceId: string,
  audioId: string,
): string {
  const trimmed = uploadPath.trim();
  if (
    isOwnedVersionedProductAudioPath(trimmed, practiceId, audioId) ||
    isOwnedVersionedProductAudioSourcePath(trimmed, practiceId, audioId)
  ) {
    return trimmed;
  }
  throw new ProductAudioUploadError("invalid_request", 400);
}

async function createSignedUpload(storagePath: string): Promise<ProductSignedUpload> {
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error || !data?.token || !data.path) {
    console.error("author_product_signed_upload_error", error?.message);
    throw new ProductAudioUploadError("upload_failed", 502);
  }

  return { path: data.path, token: data.token };
}

export async function readPracticeAudioObjectInfo(
  storagePath: string,
): Promise<StorageObjectInfo | null> {
  const service = createServiceRoleClient();
  const slash = storagePath.lastIndexOf("/");
  const directory = slash >= 0 ? storagePath.slice(0, slash) : "";
  const filename = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
  const { data, error } = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .list(directory, { limit: 20, search: filename });

  if (error) {
    console.error("author_product_storage_list_error", error.message);
  }

  const object = data?.find((entry) => entry.name === filename);
  const metadata = object?.metadata as
    | { size?: number | string }
    | undefined;
  const listedSize = Number(metadata?.size);
  if (object && Number.isFinite(listedSize) && listedSize > 0) {
    return { size: listedSize };
  }

  const signed = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (!signed.data?.signedUrl) {
    return null;
  }

  const head = await fetch(signed.data.signedUrl, { method: "HEAD" });
  const length = Number(head.headers.get("content-length"));
  if (!head.ok || !Number.isFinite(length) || length <= 0) {
    return null;
  }

  return { size: length };
}

async function materializePracticeAudioObject(storagePath: string): Promise<string> {
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .createSignedUrl(storagePath, 120);

  if (error || !data?.signedUrl) {
    throw new ProductAudioUploadError("upload_not_complete", 409);
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok || !response.body) {
    throw new ProductAudioUploadError("upload_not_complete", 409);
  }

  const path = studioAudioTempPath("audio/mpeg");
  try {
    await writeStreamToTempFile(response.body, path);
    return path;
  } catch (error) {
    await removeTempFile(path);
    throw error;
  }
}

async function inspectUploadedProductMp3(input: {
  storagePath: string;
  expectedBytes: number;
}): Promise<{ sizeBytes: number; durationSeconds: number }> {
  const object = await readPracticeAudioObjectInfo(input.storagePath);
  if (!object) {
    throw new ProductAudioUploadError("upload_not_complete", 409);
  }
  if (object.size > MAX_PRODUCT_AUDIO_BYTES) {
    throw new ProductAudioUploadError("invalid_file_size", 413);
  }
  if (object.size !== input.expectedBytes) {
    throw new ProductAudioUploadError("upload_not_complete", 409);
  }

  const tempPath = await materializePracticeAudioObject(input.storagePath);
  try {
    const fileStat = await stat(tempPath);
    if (fileStat.size !== object.size) {
      throw new ProductAudioUploadError("upload_not_complete", 409);
    }

    const duration = await probeStudioAudioFile(tempPath);
    if (duration == null || duration <= 0) {
      throw new ProductAudioUploadError("invalid_audio_duration", 400);
    }

    return {
      sizeBytes: object.size,
      durationSeconds: Math.round(duration),
    };
  } finally {
    await removeTempFile(tempPath);
  }
}

export async function deletePracticeAudioPaths(paths: readonly string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) {
    return;
  }

  const service = createServiceRoleClient();
  const { error } = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .remove(unique);
  if (error) {
    console.error("author_product_direct_upload_cleanup_error", error.message);
  }
}

export async function startProductAudioDirectUpload(input: {
  practiceId: string;
  audioId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ upload_path: string; signedUpload: ProductSignedUpload }> {
  const { supabase, practice } = await requirePracticeMutationAccess(input.practiceId);
  const audioItem = await loadOwnedAudioItem(
    supabase,
    input.practiceId,
    input.audioId,
  );
  await assertSaleLockAllowsMutation(input.practiceId, audioItem, practice.product_kind);

  const isMusicProduct = practice.product_kind === "music";
  // Music stays on the existing MP3 direct path. M4A/AAC foundation is non-music only.
  const validation = isMusicProduct
    ? validateProductMp3Descriptor({
        name: input.fileName,
        type: input.mimeType,
        size: input.fileSize,
      })
    : validateProductAudioSourceDescriptor({
        name: input.fileName,
        type: input.mimeType,
        size: input.fileSize,
      });
  if (validation === "invalid_file_type") {
    throw new ProductAudioUploadError("invalid_file_type", 400);
  }
  if (validation === "invalid_file_size") {
    throw new ProductAudioUploadError("invalid_file_size", 400);
  }

  const format = detectProductAudioSourceFormat(input.fileName);
  if (!format || (isMusicProduct && format !== "mp3")) {
    throw new ProductAudioUploadError("invalid_file_type", 400);
  }

  const versionId = randomUUID();
  const uploadPath =
    format === "mp3"
      ? buildVersionedProductAudioPath(input.practiceId, input.audioId, versionId)
      : buildVersionedProductAudioSourcePath(
          input.practiceId,
          input.audioId,
          versionId,
          format,
        );
  const signedUpload = await createSignedUpload(uploadPath);
  return { upload_path: signedUpload.path, signedUpload };
}

export async function finalizeProductAudioDirectUpload(input: {
  practiceId: string;
  audioId: string;
  uploadPath: string;
  fileName: string;
  fileSize: number;
}) {
  const { supabase, practice } = await requirePracticeMutationAccess(
    input.practiceId,
  );
  const audioItem = await loadOwnedAudioItem(
    supabase,
    input.practiceId,
    input.audioId,
  );
  const uploadPath = requireOwnedUploadPath(
    input.uploadPath,
    input.practiceId,
    input.audioId,
  );

  const sourceMeta = parseProductAudioSourcePath(uploadPath);
  const isMusicProduct = practice.product_kind === "music";

  if (sourceMeta) {
    if (isMusicProduct) {
      await deletePracticeAudioPaths([uploadPath]);
      throw new ProductAudioUploadError("invalid_file_type", 400);
    }
    const validation = validateProductAudioSourceDescriptor({
      name: input.fileName,
      type: canonicalProductAudioUploadMime(sourceMeta.format),
      size: input.fileSize,
    });
    if (validation === "invalid_file_type") {
      await deletePracticeAudioPaths([uploadPath]);
      throw new ProductAudioUploadError("invalid_file_type", 400);
    }
    if (validation === "invalid_file_size") {
      await deletePracticeAudioPaths([uploadPath]);
      throw new ProductAudioUploadError("invalid_file_size", 400);
    }
    try {
      await assertSaleLockAllowsMutation(
        input.practiceId,
        audioItem,
        practice.product_kind,
      );
    } catch (error) {
      await deletePracticeAudioPaths([uploadPath]);
      throw error;
    }

    const object = await readPracticeAudioObjectInfo(uploadPath);
    if (!object || object.size !== input.fileSize) {
      await deletePracticeAudioPaths([uploadPath]);
      throw new ProductAudioUploadError("upload_not_complete", 409);
    }
    if (object.size > MAX_PRODUCT_AUDIO_BYTES) {
      await deletePracticeAudioPaths([uploadPath]);
      throw new ProductAudioUploadError("invalid_file_size", 413);
    }

    const targetPath = buildVersionedProductAudioPath(
      input.practiceId,
      input.audioId,
      randomUUID(),
    );
    const service = createServiceRoleClient();
    const { data: job, error: enqueueError } = await service.rpc(
      "enqueue_product_audio_normalize_job",
      {
        p_practice_id: input.practiceId,
        p_audio_item_id: input.audioId,
        p_source_storage_path: uploadPath,
        p_source_format: sourceMeta.format,
        p_source_original_filename: input.fileName,
        p_source_file_size_bytes: object.size,
        p_target_storage_path: targetPath,
        p_previous_audio_path: audioItem.audio_path,
      },
    );
    if (enqueueError || !job) {
      await deletePracticeAudioPaths([uploadPath]);
      console.error(
        "author_product_audio_normalize_enqueue_error",
        enqueueError?.message,
      );
      throw new ProductAudioUploadError("internal_error", 500);
    }

    // Old audio_path stays playable until worker atomic swap.
    await recordAuthorSupportAudit({
      action: "product_track_updated",
      resourceType: "audio_item",
      resourceId: input.audioId,
      metadata: {
        practice_id: input.practiceId,
        changed_fields: ["product_audio_normalize_queued"],
        normalize_job_id: (job as { id?: string }).id ?? null,
      },
    });

    return {
      product: await getAuthorProductDetail(supabase, input.practiceId),
      duration_seconds: null,
      normalize_queued: true as const,
    };
  }

  const validation = validateProductMp3Descriptor({
    name: input.fileName,
    type: "audio/mpeg",
    size: input.fileSize,
  });
  if (validation === "invalid_file_type") {
    await deletePracticeAudioPaths([uploadPath]);
    throw new ProductAudioUploadError("invalid_file_type", 400);
  }
  if (validation === "invalid_file_size") {
    await deletePracticeAudioPaths([uploadPath]);
    throw new ProductAudioUploadError("invalid_file_size", 400);
  }

  try {
    await assertSaleLockAllowsMutation(
      input.practiceId,
      audioItem,
      practice.product_kind,
    );
  } catch (error) {
    await deletePracticeAudioPaths([uploadPath]);
    throw error;
  }

  let inspected: { sizeBytes: number; durationSeconds: number };
  try {
    inspected = await inspectUploadedProductMp3({
      storagePath: uploadPath,
      expectedBytes: input.fileSize,
    });
  } catch (error) {
    await deletePracticeAudioPaths([uploadPath]);
    throw error;
  }

  const previousPath = audioItem.audio_path;
  const nextStatus = practice.status === "published" ? "published" : "draft";

  if (isMusicProduct) {
    const service = createServiceRoleClient();
    const { data: activated, error: activateError } = await service.rpc(
      "activate_music_direct_mp3_delivery",
      {
        p_audio_item_id: input.audioId,
        p_audio_path: uploadPath,
        p_duration_seconds: inspected.durationSeconds,
        p_original_file_name: input.fileName,
        p_file_size_bytes: inspected.sizeBytes,
        p_status: nextStatus,
      },
    );
    if (activateError) {
      await deletePracticeAudioPaths([uploadPath]);
      if (isProductContentLockedDbError(activateError)) {
        throw new ProductAudioUploadError(
          PRODUCT_CONTENT_LOCKED_AFTER_SALE,
          409,
          PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
        );
      }
      console.error("author_music_direct_mp3_activate_error", activateError.message);
      throw new ProductAudioUploadError("internal_error", 500);
    }
    if (activated !== true) {
      await deletePracticeAudioPaths([uploadPath]);
      throw new ProductAudioUploadError("update_failed", 500);
    }
  } else {
    const now = new Date().toISOString();
    const { data: updatedAudioItem, error: updateError } = await supabase
      .from("audio_items")
      .update({
        audio_path: uploadPath,
        duration_seconds: inspected.durationSeconds,
        original_file_name: input.fileName,
        file_size_bytes: inspected.sizeBytes,
        status: nextStatus,
        updated_at: now,
      })
      .eq("id", input.audioId)
      .eq("practice_id", input.practiceId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      await deletePracticeAudioPaths([uploadPath]);
      if (isProductContentLockedDbError(updateError)) {
        throw new ProductAudioUploadError(
          PRODUCT_CONTENT_LOCKED_AFTER_SALE,
          409,
          PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
        );
      }
      console.error("author_audio_direct_path_update_error", updateError.message);
      throw new ProductAudioUploadError("internal_error", 500);
    }

    if (!updatedAudioItem?.id) {
      await deletePracticeAudioPaths([uploadPath]);
      throw new ProductAudioUploadError("update_failed", 500);
    }
  }

  if (previousPath && previousPath !== uploadPath) {
    await deletePracticeAudioPaths([previousPath]);
  }

  await syncPracticeAudioCompatibility(supabase, input.practiceId);
  await recordAuthorSupportAudit({
    action: "product_track_updated",
    resourceType: "audio_item",
    resourceId: input.audioId,
    metadata: {
      practice_id: input.practiceId,
      changed_fields: ["audio_path", "duration_seconds"],
    },
  });

  return {
    product: await getAuthorProductDetail(supabase, input.practiceId),
    duration_seconds: inspected.durationSeconds,
  };
}

export async function abandonProductAudioDirectUpload(input: {
  practiceId: string;
  audioId: string;
  uploadPath: string;
}): Promise<void> {
  const { supabase } = await requirePracticeMutationAccess(input.practiceId);
  const audioItem = await loadOwnedAudioItem(
    supabase,
    input.practiceId,
    input.audioId,
  );
  const uploadPath = input.uploadPath.trim();

  if (
    !canAbandonProductAudioUploadPath({
      uploadPath,
      practiceId: input.practiceId,
      audioId: input.audioId,
      liveAudioPath: audioItem.audio_path,
    })
  ) {
    throw new ProductAudioUploadError("invalid_request", 400);
  }

  await deletePracticeAudioPaths([uploadPath]);
}
