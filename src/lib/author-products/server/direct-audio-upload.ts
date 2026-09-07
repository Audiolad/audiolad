import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requirePracticeMutationAccess } from "@/lib/author-products/auth";
import {
  MAX_PRODUCT_AUDIO_BYTES,
  PRACTICE_AUDIO_BUCKET,
  buildVersionedProductAudioPath,
  canAbandonProductAudioUploadPath,
  isOwnedVersionedProductAudioPath,
  shouldBlockProductAudioReplacement,
  validateProductMp3Descriptor,
} from "@/lib/author-products/mp3-upload-contract";
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
    .select("id, audio_path")
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

async function assertSaleLockAllowsMutation(
  practiceId: string,
  existingAudioPath: string | null,
): Promise<void> {
  const service = createServiceRoleClient();
  const saleLock = await getPracticeSaleLock(service, practiceId);
  if (shouldBlockProductAudioReplacement(saleLock.locked, existingAudioPath)) {
    throw new ProductAudioUploadError(
      PRODUCT_CONTENT_LOCKED_AFTER_SALE,
      409,
      PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
    );
  }
}

function requireOwnedVersionedPath(
  uploadPath: string,
  practiceId: string,
  audioId: string,
): string {
  const trimmed = uploadPath.trim();
  if (!isOwnedVersionedProductAudioPath(trimmed, practiceId, audioId)) {
    throw new ProductAudioUploadError("invalid_request", 400);
  }
  return trimmed;
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
  const { supabase } = await requirePracticeMutationAccess(input.practiceId);
  const audioItem = await loadOwnedAudioItem(
    supabase,
    input.practiceId,
    input.audioId,
  );
  await assertSaleLockAllowsMutation(input.practiceId, audioItem.audio_path);

  const validation = validateProductMp3Descriptor({
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

  const uploadPath = buildVersionedProductAudioPath(
    input.practiceId,
    input.audioId,
    randomUUID(),
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
  const uploadPath = requireOwnedVersionedPath(
    input.uploadPath,
    input.practiceId,
    input.audioId,
  );

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
    await assertSaleLockAllowsMutation(input.practiceId, audioItem.audio_path);
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
  const now = new Date().toISOString();
  const { data: updatedAudioItem, error: updateError } = await supabase
    .from("audio_items")
    .update({
      audio_path: uploadPath,
      duration_seconds: inspected.durationSeconds,
      original_file_name: input.fileName,
      file_size_bytes: inspected.sizeBytes,
      status: practice.status === "published" ? "published" : "draft",
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
