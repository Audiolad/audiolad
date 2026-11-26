import "server-only";

import { detectProductAudioSourceFormat } from "@/lib/author-products/product-audio-upload-contract";
import { assertValidProductSourceFile } from "@/lib/product-audio-normalize/ffmpeg";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requirePracticeMutationAccess } from "@/lib/author-products/auth";
import {
  MAX_MUSIC_MASTER_BYTES,
  MUSIC_MASTERS_BUCKET,
  buildMusicMasterStoragePath,
  isOwnedMusicMasterStoragePath,
  validateMusicMasterDescriptor,
} from "@/lib/author-products/music-master-upload-contract";
import {
  PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
  PRODUCT_CONTENT_LOCKED_AFTER_SALE,
  isProductContentLockedDbError,
} from "@/lib/author-products/sale-lock";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import {
  claimMusicTrackUploadGeneration,
  removeMusicStorageObjectsBestEffort,
} from "@/lib/author-products/server/music-track-delivery";
import {
  createMusicStorageUploadTarget,
  downloadMusicStorageObjectToFile,
  headMusicStorageObject,
  musicStorageLocation,
  newMusicMasterStorageProvider,
  removeMusicStorageObject,
  type MusicStorageLocation,
} from "@/lib/music-storage/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  inspectAudioMediaFile,
  removeTempFile,
  studioAudioTempPath,
} from "@/lib/studio/server/audio-duration";
import type { AudioMediaInspection } from "@/lib/studio/server/audio-duration";

export class MusicMasterUploadError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly userMessage?: string,
  ) {
    super(code);
    this.name = "MusicMasterUploadError";
  }
}

type OwnedMusicAudioItem = {
  id: string;
  audio_path: string | null;
  active_music_delivery_asset_id: string | null;
  desired_music_master_asset_id: string | null;
};
type MusicAsset = {
  id: string;
  audio_item_id: string;
  storage_provider: string | null;
  storage_bucket: string;
  storage_path: string;
  lifecycle_state: string;
  size_bytes: number | null;
};

export function isVerifiedMusicMasterMedia(
  media: AudioMediaInspection | null,
): media is AudioMediaInspection & { durationSeconds: number } {
  return Boolean(
    media &&
      media.formatNames.some((format) => format === "wav" || format === "wave") &&
      media.hasAudioStream &&
      media.durationSeconds &&
      media.durationSeconds > 0,
  );
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function loadMusicAudioItem(
  supabase: SupabaseClient,
  practiceId: string,
  audioId: string,
): Promise<OwnedMusicAudioItem> {
  const { data, error } = await supabase
    .from("audio_items")
    .select(
      "id, audio_path, active_music_delivery_asset_id, desired_music_master_asset_id",
    )
    .eq("id", audioId)
    .eq("practice_id", practiceId)
    .maybeSingle();
  if (error) throw new MusicMasterUploadError("internal_error", 500);
  if (!data?.id) throw new MusicMasterUploadError("not_found", 404);
  return data;
}

function readMusicAssetLifecycle(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || !("lifecycle_state" in row)) {
    return null;
  }
  const lifecycle = (row as { lifecycle_state?: unknown }).lifecycle_state;
  return typeof lifecycle === "string" ? lifecycle : null;
}

function assertMusicProduct(productKind: string | null | undefined) {
  if (productKind !== "music") {
    throw new MusicMasterUploadError("music_master_not_available", 400);
  }
}

async function materializeMusicMaster(
  location: MusicStorageLocation,
  expectedBytes: number,
): Promise<string> {
  const tempPath = studioAudioTempPath(
    location.storage_path.endsWith(".ogg") ? "audio/ogg" : "audio/wav",
  );
  try {
    await downloadMusicStorageObjectToFile(location, tempPath, { expectedBytes });
    return tempPath;
  } catch (error) {
    await removeTempFile(tempPath);
    if (error instanceof MusicMasterUploadError) throw error;
    throw new MusicMasterUploadError("upload_not_complete", 409);
  }
}

async function markAssetRejected(assetId: string) {
  await createServiceRoleClient()
    .from("music_audio_assets")
    .update({ lifecycle_state: "rejected", updated_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("lifecycle_state", "uploading");
}

export async function startMusicMasterDirectUpload(input: {
  practiceId: string;
  audioId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}) {
  const { supabase, practice } = await requirePracticeMutationAccess(input.practiceId);
  await loadMusicAudioItem(supabase, input.practiceId, input.audioId);
  // t1529u: a sold product may get a new master (replace, not remove).
  assertMusicProduct(practice.product_kind);
  const validation = validateMusicMasterDescriptor({
    name: input.fileName,
    type: input.mimeType,
    size: input.fileSize,
  });
  if (validation) throw new MusicMasterUploadError(validation, 400);

  const assetId = randomUUID();
  const storagePath = buildMusicMasterStoragePath(input.practiceId, input.audioId, assetId, detectProductAudioSourceFormat(input.fileName) === "ogg" ? "ogg" : "wav");
  const storageProvider = newMusicMasterStorageProvider();
  let uploadGeneration: number;
  try {
    uploadGeneration = await claimMusicTrackUploadGeneration({
      practiceId: input.practiceId,
      audioId: input.audioId,
    });
  } catch {
    throw new MusicMasterUploadError("internal_error", 500);
  }
  const service = createServiceRoleClient();
  const { error: assetError } = await service.from("music_audio_assets").insert({
    id: assetId,
    audio_item_id: input.audioId,
    asset_role: "master",
    storage_provider: storageProvider,
    storage_bucket: MUSIC_MASTERS_BUCKET,
    storage_path: storagePath,
    original_file_name: input.fileName,
    accepted_mime_type: detectProductAudioSourceFormat(input.fileName) === "ogg" ? "audio/ogg" : input.mimeType || "application/octet-stream",
    lifecycle_state: "uploading",
    upload_generation: uploadGeneration,
  });
  if (assetError) throw new MusicMasterUploadError("internal_error", 500);

  let uploadTarget: Awaited<ReturnType<typeof createMusicStorageUploadTarget>>;
  try {
    uploadTarget = await createMusicStorageUploadTarget({
      storage_provider: storageProvider,
      storage_bucket: MUSIC_MASTERS_BUCKET,
      storage_path: storagePath,
    }, {
      service,
      contentType: detectProductAudioSourceFormat(input.fileName) === "ogg"
        ? "audio/ogg"
        : input.mimeType || "audio/wav",
    });
  } catch {
    await markAssetRejected(assetId);
    throw new MusicMasterUploadError("upload_failed", 502);
  }
  if (uploadTarget.kind === "supabase_signed_upload") {
    return {
      asset_id: assetId,
      upload_path: uploadTarget.path,
      upload: uploadTarget,
      signedUpload: { path: uploadTarget.path, token: uploadTarget.token },
    };
  }
  return {
    asset_id: assetId,
    upload_path: storagePath,
    upload: uploadTarget,
  };
}

export async function finalizeMusicMasterDirectUpload(input: {
  practiceId: string;
  audioId: string;
  assetId: string;
  uploadPath: string;
  fileSize: number;
}) {
  const { supabase, practice } = await requirePracticeMutationAccess(input.practiceId);
  await loadMusicAudioItem(supabase, input.practiceId, input.audioId);
  // t1529u: a sold product may get a new master (replace, not remove).
  assertMusicProduct(practice.product_kind);
  if (!isOwnedMusicMasterStoragePath(input.uploadPath, input.practiceId, input.audioId, input.assetId)) {
    throw new MusicMasterUploadError("invalid_request", 400);
  }
  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > MAX_MUSIC_MASTER_BYTES) {
    throw new MusicMasterUploadError("invalid_file_size", 400);
  }

  const service = createServiceRoleClient();
  const { data: asset, error: assetError } = await service
    .from("music_audio_assets")
    .select("id, audio_item_id, storage_provider, storage_bucket, storage_path, lifecycle_state, size_bytes")
    .eq("id", input.assetId)
    .maybeSingle<MusicAsset>();
  if (assetError) throw new MusicMasterUploadError("internal_error", 500);
  if (!asset || asset.audio_item_id !== input.audioId || asset.storage_path !== input.uploadPath) {
    throw new MusicMasterUploadError("not_found", 404);
  }
  if (asset.lifecycle_state === "rejected" || asset.lifecycle_state === "abandoned") {
    throw new MusicMasterUploadError("invalid_request", 409);
  }

  try {
    const location = {
      storage_provider: asset.storage_provider,
      storage_bucket: asset.storage_bucket,
      storage_path: asset.storage_path,
    };
    const objectSize = (await headMusicStorageObject(location, service))?.sizeBytes ?? null;
    if (!objectSize || objectSize !== input.fileSize || objectSize > MAX_MUSIC_MASTER_BYTES) {
      throw new MusicMasterUploadError("upload_not_complete", 409);
    }
    const tempPath = await materializeMusicMaster(location, objectSize);
    let media: Awaited<ReturnType<typeof inspectAudioMediaFile>>;
    let contentSha256: string;
    try {
      if ((await stat(tempPath)).size !== objectSize) {
        throw new MusicMasterUploadError("upload_not_complete", 409);
      }
      if (input.uploadPath.endsWith(".ogg")) {
        await assertValidProductSourceFile(tempPath, "ogg").catch(() => {
          throw new MusicMasterUploadError("invalid_file_type", 400);
        });
      }
      media = await inspectAudioMediaFile(tempPath);
      contentSha256 = await sha256File(tempPath);
    } finally {
      await removeTempFile(tempPath);
    }
    if (!media?.durationSeconds || (!input.uploadPath.endsWith(".ogg") && !isVerifiedMusicMasterMedia(media))) {
      throw new MusicMasterUploadError("invalid_file_type", 400);
    }
    const { error: checksumError } = await service
      .from("music_audio_assets")
      .update({
        content_sha256: contentSha256,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.assetId)
      .eq("lifecycle_state", "uploading");
    if (checksumError) throw new MusicMasterUploadError("internal_error", 500);

    const { data: finalizedAsset, error: finalizeError } = await service.rpc(
      "finalize_music_master_asset",
      {
        p_asset_id: input.assetId,
        p_size_bytes: objectSize,
        p_duration_seconds: Math.round(media.durationSeconds),
      },
    );
    if (readMusicAssetLifecycle(finalizedAsset) === "abandoned") {
      await removeMusicStorageObjectsBestEffort(service, [
        {
          provider: musicStorageLocation(location).provider,
          bucket: MUSIC_MASTERS_BUCKET,
          path: input.uploadPath,
        },
      ]);
      throw new MusicMasterUploadError("stale_music_upload", 409);
    }
    if (finalizeError) {
      if (isProductContentLockedDbError(finalizeError)) {
        throw new MusicMasterUploadError(
          PRODUCT_CONTENT_LOCKED_AFTER_SALE,
          409,
          PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
        );
      }
      throw new MusicMasterUploadError("internal_error", 500);
    }
    await recordAuthorSupportAudit({
      action: "product_track_updated",
      resourceType: "audio_item",
      resourceId: input.audioId,
      metadata: {
        practice_id: input.practiceId,
        changed_fields: ["music_master_asset", "music_transcode_job"],
      },
    });
    return { asset_id: input.assetId, lifecycle_state: "verified", transcode_status: "queued" };
  } catch (error) {
    if (
      asset.lifecycle_state === "uploading" &&
      !(error instanceof MusicMasterUploadError && error.code === "stale_music_upload")
    ) {
      await markAssetRejected(input.assetId);
      await removeMusicStorageObject({
        storage_provider: asset.storage_provider,
        storage_bucket: asset.storage_bucket,
        storage_path: asset.storage_path,
      }, service);
    }
    throw error;
  }
}

export async function abandonMusicMasterDirectUpload(input: {
  practiceId: string;
  audioId: string;
  assetId: string;
  uploadPath: string;
}) {
  const { supabase, practice } = await requirePracticeMutationAccess(input.practiceId);
  await loadMusicAudioItem(supabase, input.practiceId, input.audioId);
  assertMusicProduct(practice.product_kind);
  if (!isOwnedMusicMasterStoragePath(input.uploadPath, input.practiceId, input.audioId, input.assetId)) {
    throw new MusicMasterUploadError("invalid_request", 400);
  }
  const service = createServiceRoleClient();
  const { data: asset } = await service
    .from("music_audio_assets")
    .select("id, audio_item_id, lifecycle_state, storage_provider, storage_bucket, storage_path")
    .eq("id", input.assetId)
    .maybeSingle();
  if (!asset || asset.audio_item_id !== input.audioId || asset.storage_path !== input.uploadPath) {
    throw new MusicMasterUploadError("not_found", 404);
  }
  if (
    asset.lifecycle_state !== "uploading" &&
    asset.lifecycle_state !== "rejected"
  ) {
    throw new MusicMasterUploadError("invalid_request", 409);
  }
  await removeMusicStorageObject({
    storage_provider: asset.storage_provider,
    storage_bucket: asset.storage_bucket,
    storage_path: asset.storage_path,
  }, service);
  const { error } = await service.from("music_audio_assets")
    .update({ lifecycle_state: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", input.assetId)
    .in("lifecycle_state", ["uploading", "rejected"]);
  if (error) throw new MusicMasterUploadError("internal_error", 500);
}
