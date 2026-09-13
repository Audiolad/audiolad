import "server-only";

import { randomUUID } from "node:crypto";
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
  getPracticeSaleLock,
} from "@/lib/author-products/sale-lock";
import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  probeStudioAudioFile,
  removeTempFile,
  studioAudioTempPath,
  writeStreamToTempFile,
} from "@/lib/studio/server/audio-duration";

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

type OwnedMusicAudioItem = { id: string; audio_path: string | null };
type MusicAsset = {
  id: string;
  audio_item_id: string;
  storage_path: string;
  lifecycle_state: string;
};

async function loadMusicAudioItem(
  supabase: SupabaseClient,
  practiceId: string,
  audioId: string,
): Promise<OwnedMusicAudioItem> {
  const { data, error } = await supabase
    .from("audio_items")
    .select("id, audio_path")
    .eq("id", audioId)
    .eq("practice_id", practiceId)
    .maybeSingle();
  if (error) throw new MusicMasterUploadError("internal_error", 500);
  if (!data?.id) throw new MusicMasterUploadError("not_found", 404);
  return data;
}

async function assertMusicProductAndSaleLock(
  practiceId: string,
  productKind: string | null | undefined,
  audioPath: string | null,
) {
  if (productKind !== "music") {
    throw new MusicMasterUploadError("music_master_not_available", 400);
  }
  const saleLock = await getPracticeSaleLock(createServiceRoleClient(), practiceId);
  if (saleLock.locked && audioPath) {
    throw new MusicMasterUploadError(
      PRODUCT_CONTENT_LOCKED_AFTER_SALE,
      409,
      PRODUCT_AUDIO_LOCKED_AFTER_SALE_MESSAGE,
    );
  }
}

async function readMusicMasterObjectSize(storagePath: string): Promise<number | null> {
  const service = createServiceRoleClient();
  const slash = storagePath.lastIndexOf("/");
  const directory = storagePath.slice(0, Math.max(0, slash));
  const filename = storagePath.slice(slash + 1);
  const { data, error } = await service.storage
    .from(MUSIC_MASTERS_BUCKET)
    .list(directory, { limit: 20, search: filename });
  if (error) return null;
  const object = data?.find((entry) => entry.name === filename);
  const size = Number((object?.metadata as { size?: number | string } | undefined)?.size);
  return Number.isFinite(size) && size > 0 ? size : null;
}

async function materializeMusicMaster(storagePath: string): Promise<string> {
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(MUSIC_MASTERS_BUCKET)
    .createSignedUrl(storagePath, 120);
  if (error || !data?.signedUrl) {
    throw new MusicMasterUploadError("upload_not_complete", 409);
  }
  const response = await fetch(data.signedUrl);
  if (!response.ok || !response.body) {
    throw new MusicMasterUploadError("upload_not_complete", 409);
  }
  const tempPath = studioAudioTempPath("audio/wav");
  try {
    await writeStreamToTempFile(response.body, tempPath);
    return tempPath;
  } catch (error) {
    await removeTempFile(tempPath);
    throw error;
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
  const audioItem = await loadMusicAudioItem(supabase, input.practiceId, input.audioId);
  await assertMusicProductAndSaleLock(input.practiceId, practice.product_kind, audioItem.audio_path);
  const validation = validateMusicMasterDescriptor({
    name: input.fileName,
    type: input.mimeType,
    size: input.fileSize,
  });
  if (validation) throw new MusicMasterUploadError(validation, 400);

  const assetId = randomUUID();
  const storagePath = buildMusicMasterStoragePath(input.practiceId, input.audioId, assetId);
  const service = createServiceRoleClient();
  const { error: assetError } = await service.from("music_audio_assets").insert({
    id: assetId,
    audio_item_id: input.audioId,
    asset_role: "master",
    storage_bucket: MUSIC_MASTERS_BUCKET,
    storage_path: storagePath,
    original_file_name: input.fileName,
    accepted_mime_type: input.mimeType || "application/octet-stream",
    lifecycle_state: "uploading",
  });
  if (assetError) throw new MusicMasterUploadError("internal_error", 500);

  const { data, error } = await service.storage
    .from(MUSIC_MASTERS_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.token || !data.path) {
    await markAssetRejected(assetId);
    throw new MusicMasterUploadError("upload_failed", 502);
  }
  return { asset_id: assetId, upload_path: data.path, signedUpload: { path: data.path, token: data.token } };
}

export async function finalizeMusicMasterDirectUpload(input: {
  practiceId: string;
  audioId: string;
  assetId: string;
  uploadPath: string;
  fileSize: number;
}) {
  const { supabase, practice } = await requirePracticeMutationAccess(input.practiceId);
  const audioItem = await loadMusicAudioItem(supabase, input.practiceId, input.audioId);
  await assertMusicProductAndSaleLock(input.practiceId, practice.product_kind, audioItem.audio_path);
  if (!isOwnedMusicMasterStoragePath(input.uploadPath, input.practiceId, input.audioId, input.assetId)) {
    throw new MusicMasterUploadError("invalid_request", 400);
  }
  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0 || input.fileSize > MAX_MUSIC_MASTER_BYTES) {
    throw new MusicMasterUploadError("invalid_file_size", 400);
  }

  const service = createServiceRoleClient();
  const { data: asset, error: assetError } = await service
    .from("music_audio_assets")
    .select("id, audio_item_id, storage_path, lifecycle_state")
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
    const objectSize = await readMusicMasterObjectSize(input.uploadPath);
    if (!objectSize || objectSize !== input.fileSize || objectSize > MAX_MUSIC_MASTER_BYTES) {
      throw new MusicMasterUploadError("upload_not_complete", 409);
    }
    const tempPath = await materializeMusicMaster(input.uploadPath);
    let duration: number | null;
    try {
      if ((await stat(tempPath)).size !== objectSize) {
        throw new MusicMasterUploadError("upload_not_complete", 409);
      }
      duration = await probeStudioAudioFile(tempPath);
    } finally {
      await removeTempFile(tempPath);
    }
    if (!duration || duration <= 0) throw new MusicMasterUploadError("invalid_audio_duration", 400);

    const { error: finalizeError } = await service.rpc("finalize_music_master_asset", {
      p_asset_id: input.assetId,
      p_size_bytes: objectSize,
      p_duration_seconds: Math.round(duration),
    });
    if (finalizeError) throw new MusicMasterUploadError("internal_error", 500);
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
    if (asset.lifecycle_state === "uploading") await markAssetRejected(input.assetId);
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
  const audioItem = await loadMusicAudioItem(supabase, input.practiceId, input.audioId);
  await assertMusicProductAndSaleLock(input.practiceId, practice.product_kind, audioItem.audio_path);
  if (!isOwnedMusicMasterStoragePath(input.uploadPath, input.practiceId, input.audioId, input.assetId)) {
    throw new MusicMasterUploadError("invalid_request", 400);
  }
  const service = createServiceRoleClient();
  const { data: asset } = await service
    .from("music_audio_assets")
    .select("id, audio_item_id, lifecycle_state, storage_path")
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
  await service.storage.from(MUSIC_MASTERS_BUCKET).remove([input.uploadPath]);
  const { error } = await service.from("music_audio_assets")
    .update({ lifecycle_state: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", input.assetId)
    .in("lifecycle_state", ["uploading", "rejected"]);
  if (error) throw new MusicMasterUploadError("internal_error", 500);
}
