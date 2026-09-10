import "server-only";

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";

import { recordAuthorSupportAudit } from "@/lib/author-support/audit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  MAX_STUDIO_ASSET_BYTES,
  MAX_STUDIO_AUDIO_DURATION_SECONDS,
  STUDIO_ASSETS_BUCKET,
} from "../limits";
import {
  probeStudioAudioFile,
  removeTempFile,
  studioAudioTempPath,
  writeStreamToTempFile,
} from "./audio-duration";
import type { StudioAssetPeaksDto, StudioProjectAssetRow } from "./model";
import {
  getStudioProjectAsset,
  requireStudioProjectAccess,
} from "./repository";
import {
  buildStudioAssetPath,
  isStudioStoragePath,
  StudioApiError,
} from "./validation";

export type StudioSignedUpload = {
  path: string;
  token: string;
};

function mapServiceError(error: { message: string }, fallback = "internal_error"): never {
  const message = error.message.toLowerCase();
  if (message.includes("project_asset_quota_exceeded")) {
    throw new StudioApiError("project_asset_quota_exceeded", 413);
  }
  if (message.includes("project_not_found")) {
    throw new StudioApiError("not_found", 404);
  }
  if (message.includes("invalid_asset") || message.includes("invalid_project")) {
    throw new StudioApiError("invalid_asset", 422);
  }
  console.error("studio_service_error", error.message);
  throw new StudioApiError(fallback, 500);
}

async function setUploadState(
  projectId: string,
  assetId: string,
  state: "reserved" | "uploading" | "processing" | "ready" | "failed",
) {
  const service = createServiceRoleClient();
  const { error } = await service.rpc("studio_set_project_asset_upload_state", {
    p_project_id: projectId,
    p_asset_id: assetId,
    p_upload_state: state,
  });
  if (error) mapServiceError(error);
}

async function createSignedUpload(storagePath: string): Promise<StudioSignedUpload> {
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(STUDIO_ASSETS_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.token || !data.path) {
    console.error("studio_signed_upload_error", error?.message);
    throw new StudioApiError("storage_upload_failed", 502);
  }
  return { path: data.path, token: data.token };
}

type StorageObjectInfo = {
  size: number;
  mimetype?: string;
};

export async function readStudioStorageObjectInfo(
  storagePath: string,
): Promise<StorageObjectInfo | null> {
  const service = createServiceRoleClient();
  const directory = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const filename = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await service.storage
    .from(STUDIO_ASSETS_BUCKET)
    .list(directory, { limit: 20, search: filename });
  if (error) {
    console.error("studio_storage_list_error", error.message);
  }
  const object = data?.find((entry) => entry.name === filename);
  const metadata = object?.metadata as { size?: number | string; mimetype?: string } | undefined;
  const listedSize = Number(metadata?.size);
  if (object && Number.isFinite(listedSize) && listedSize > 0) {
    return { size: listedSize, mimetype: metadata?.mimetype };
  }

  const signed = await service.storage.from(STUDIO_ASSETS_BUCKET).createSignedUrl(storagePath, 60);
  if (!signed.data?.signedUrl) return null;
  const head = await fetch(signed.data.signedUrl, { method: "HEAD" });
  const length = Number(head.headers.get("content-length"));
  if (!head.ok || !Number.isFinite(length) || length <= 0) return null;
  return { size: length };
}

function isIncompleteUploadError(error: unknown): boolean {
  return error instanceof StudioApiError && error.code === "upload_not_complete";
}

async function materializeStorageObject(
  storagePath: string,
  mimeType: string,
): Promise<string> {
  const service = createServiceRoleClient();
  const { data, error } = await service.storage
    .from(STUDIO_ASSETS_BUCKET)
    .createSignedUrl(storagePath, 120);
  if (error || !data?.signedUrl) {
    throw new StudioApiError("upload_not_complete", 409);
  }
  const response = await fetch(data.signedUrl);
  if (!response.ok || !response.body) {
    throw new StudioApiError("upload_not_complete", 409);
  }
  const path = studioAudioTempPath(mimeType);
  try {
    await writeStreamToTempFile(response.body, path);
    return path;
  } catch (error) {
    await removeTempFile(path);
    throw error;
  }
}

async function inspectUploadedAudio(input: {
  storagePath: string;
  mimeType: string;
  reservedBytes: number;
}): Promise<{
  sizeBytes: number;
  durationSeconds: number;
  peaks: StudioAssetPeaksDto | null;
}> {
  const object = await readStudioStorageObjectInfo(input.storagePath);
  if (!object) {
    throw new StudioApiError("upload_not_complete", 409);
  }
  if (object.size > MAX_STUDIO_ASSET_BYTES) {
    throw new StudioApiError("asset_too_large", 413);
  }
  if (object.size !== input.reservedBytes) {
    await deleteStoragePaths([input.storagePath]);
    throw new StudioApiError("upload_not_complete", 409);
  }

  const tempPath = await materializeStorageObject(input.storagePath, input.mimeType);
  try {
    const fileStat = await stat(tempPath);
    if (fileStat.size !== object.size) {
      throw new StudioApiError("upload_not_complete", 409);
    }
    const durationSeconds = await probeStudioAudioFile(tempPath);
    if (durationSeconds == null) {
      throw new StudioApiError("invalid_audio_duration", 422);
    }
    if (durationSeconds > MAX_STUDIO_AUDIO_DURATION_SECONDS) {
      throw new StudioApiError("audio_too_long", 422);
    }
    // Peaks V1 generation is optional and must never block ready. PR3b.
    return {
      sizeBytes: object.size,
      durationSeconds,
      peaks: null,
    };
  } finally {
    await removeTempFile(tempPath);
  }
}

async function deleteStoragePaths(paths: readonly string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  const service = createServiceRoleClient();
  const { error } = await service.storage.from(STUDIO_ASSETS_BUCKET).remove(unique);
  if (error) {
    console.error("studio_direct_upload_cleanup_error", error.message);
  }
}

export async function reserveStudioDirectUpload(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sourceType: "upload" | "recording";
}): Promise<{ asset: StudioProjectAssetRow; signedUpload: StudioSignedUpload }> {
  const { ownerId, ownerKind, service } = await requireStudioProjectAccess(input.projectId);
  await cleanupStaleStudioUploads();
  const assetId = randomUUID();
  await recordAuthorSupportAudit({
    action: "studio_asset_uploaded",
    resourceType: "studio_project_asset",
    resourceId: assetId,
    metadata: { project_id: input.projectId },
  });
  const storagePath = buildStudioAssetPath(
    ownerId,
    input.projectId,
    assetId,
    input.filename,
    ownerKind,
  );
  const { data, error } = await service.rpc("studio_reserve_project_asset", {
    p_project_id: input.projectId,
    p_asset_id: assetId,
    p_storage_path: storagePath,
    p_original_name: input.filename,
    p_mime_type: input.mimeType,
    p_size_bytes: input.byteSize,
    p_source_type: input.sourceType,
    p_duration_seconds: null,
  });
  if (error) mapServiceError(error);
  const asset = data as StudioProjectAssetRow;
  try {
    const signedUpload = await createSignedUpload(asset.storage_path);
    await setUploadState(input.projectId, asset.id, "uploading");
    return { asset: { ...asset, upload_state: "uploading" }, signedUpload };
  } catch (error) {
    await failAndReleaseStudioUpload(input.projectId, asset.id, asset.storage_path);
    throw error;
  }
}

export async function retryStudioDirectUpload(
  projectId: string,
  assetId: string,
): Promise<{
  asset: StudioProjectAssetRow;
  signedUpload: StudioSignedUpload | null;
  alreadyUploaded: boolean;
}> {
  const { asset, ownerId, ownerKind } = await getStudioProjectAsset(projectId, assetId, {
    allowedStates: ["reserved", "uploading", "failed"],
  });
  if (
    !isStudioStoragePath(asset.storage_path, ownerId, projectId, asset.id, ownerKind)
  ) {
    throw new StudioApiError("invalid_asset", 500);
  }
  const object = await readStudioStorageObjectInfo(asset.storage_path);
  if (object && object.size === Number(asset.size_bytes)) {
    return { asset, signedUpload: null, alreadyUploaded: true };
  }
  if (object) {
    await deleteStoragePaths([asset.storage_path]);
  }
  const signedUpload = await createSignedUpload(asset.storage_path);
  await setUploadState(projectId, assetId, "uploading");
  return { asset: { ...asset, upload_state: "uploading" }, signedUpload, alreadyUploaded: false };
}

export async function finalizeStudioDirectUpload(
  projectId: string,
  assetId: string,
): Promise<{ asset: StudioProjectAssetRow; peaks: StudioAssetPeaksDto | null }> {
  const { asset } = await getStudioProjectAsset(projectId, assetId, {
    allowedStates: ["reserved", "uploading", "processing", "ready"],
  });
  if (asset.upload_state === "ready" && asset.duration_seconds != null) {
    return { asset, peaks: await readStoredPeaks(asset) };
  }

  await setUploadState(projectId, assetId, "processing");
  try {
    const inspected = await inspectUploadedAudio({
      storagePath: asset.storage_path,
      mimeType: asset.mime_type,
      reservedBytes: Number(asset.size_bytes),
    });
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("studio_finalize_project_asset", {
      p_project_id: projectId,
      p_asset_id: assetId,
      p_size_bytes: inspected.sizeBytes,
      p_duration_seconds: inspected.durationSeconds,
      p_peaks_version: inspected.peaks?.version ?? null,
      p_peaks_columns: inspected.peaks?.columns ?? null,
      p_peaks_data: inspected.peaks
        ? Buffer.from(inspected.peaks.dataBase64, "base64")
        : null,
    });
    if (error) mapServiceError(error);
    return { asset: data as StudioProjectAssetRow, peaks: inspected.peaks };
  } catch (error) {
    if (isIncompleteUploadError(error)) {
      await setUploadState(projectId, assetId, "uploading").catch(() => undefined);
      throw error;
    }
    await failAndReleaseStudioUpload(projectId, assetId, asset.storage_path);
    throw error;
  }
}

export async function reserveStudioDirectReplacement(input: {
  projectId: string;
  assetId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
}): Promise<{ asset: StudioProjectAssetRow; signedUpload: StudioSignedUpload }> {
  const { ownerId, ownerKind, service } = await requireStudioProjectAccess(input.projectId);
  await cleanupStaleStudioUploads();
  const existing = await getStudioProjectAsset(input.projectId, input.assetId, {
    allowedStates: ["ready"],
  });
  if (existing.asset.source_type === "catalog") {
    throw new StudioApiError("invalid_asset", 422);
  }
  if (existing.asset.pending_storage_path) {
    await abandonStudioDirectReplacement(input.projectId, input.assetId);
  }
  await recordAuthorSupportAudit({
    action: "studio_asset_replaced",
    resourceType: "studio_project_asset",
    resourceId: input.assetId,
    metadata: { project_id: input.projectId },
  });
  const sourceId = randomUUID();
  const storagePath = buildStudioAssetPath(
    ownerId,
    input.projectId,
    sourceId,
    input.filename,
    ownerKind,
  );
  const { data, error } = await service.rpc("studio_reserve_project_asset_replacement", {
    p_project_id: input.projectId,
    p_asset_id: input.assetId,
    p_source_id: sourceId,
    p_storage_path: storagePath,
    p_original_name: input.filename,
    p_mime_type: input.mimeType,
    p_size_bytes: input.byteSize,
  });
  if (error) mapServiceError(error);
  try {
    const signedUpload = await createSignedUpload(storagePath);
    return { asset: data as StudioProjectAssetRow, signedUpload };
  } catch (error) {
    await service.rpc("studio_clear_project_asset_replacement", {
      p_project_id: input.projectId,
      p_asset_id: input.assetId,
    });
    throw error;
  }
}

export async function finalizeStudioDirectReplacement(
  projectId: string,
  assetId: string,
): Promise<{ asset: StudioProjectAssetRow; peaks: StudioAssetPeaksDto | null }> {
  const { asset, service } = await getStudioProjectAsset(projectId, assetId, {
    allowedStates: ["ready"],
  });
  if (
    !asset.pending_source_id ||
    !asset.pending_storage_path ||
    !asset.pending_size_bytes ||
    !asset.pending_original_name ||
    !asset.pending_mime_type
  ) {
    throw new StudioApiError("upload_not_complete", 409);
  }
  try {
    const inspected = await inspectUploadedAudio({
      storagePath: asset.pending_storage_path,
      mimeType: asset.pending_mime_type,
      reservedBytes: Number(asset.pending_size_bytes),
    });
    const { data: released, error } = await service.rpc("replace_studio_project_asset", {
      p_project_id: projectId,
      p_asset_id: assetId,
      p_source_id: asset.pending_source_id,
      p_storage_path: asset.pending_storage_path,
      p_original_name: asset.pending_original_name,
      p_mime_type: asset.pending_mime_type,
      p_size_bytes: inspected.sizeBytes,
      p_duration_seconds: inspected.durationSeconds,
    });
    if (error) mapServiceError(error);
    await deleteStoragePaths(
      (released ?? []).map((row: { storage_path: string }) => row.storage_path),
    );
    await service.rpc("studio_clear_project_asset_replacement", {
      p_project_id: projectId,
      p_asset_id: assetId,
    });
    if (inspected.peaks) {
      await service
        .from("studio_asset_sources")
        .update({
          peaks_version: inspected.peaks.version,
          peaks_columns: inspected.peaks.columns,
          peaks_data: Buffer.from(inspected.peaks.dataBase64, "base64"),
        })
        .eq("id", asset.pending_source_id);
    }
    return {
      asset: {
        ...asset,
        storage_path: asset.pending_storage_path,
        original_name: asset.pending_original_name,
        mime_type: asset.pending_mime_type,
        size_bytes: inspected.sizeBytes,
        duration_seconds: inspected.durationSeconds,
        upload_state: "ready",
        pending_source_id: null,
        pending_storage_path: null,
        pending_size_bytes: null,
        pending_original_name: null,
        pending_mime_type: null,
      },
      peaks: inspected.peaks,
    };
  } catch (error) {
    if (isIncompleteUploadError(error)) {
      throw error;
    }
    await abandonStudioDirectReplacement(projectId, assetId);
    throw error;
  }
}

export async function abandonStudioDirectUpload(projectId: string, assetId: string) {
  const { asset } = await getStudioProjectAsset(projectId, assetId, {
    allowedStates: ["reserved", "uploading", "processing", "failed"],
  });
  await failAndReleaseStudioUpload(projectId, assetId, asset.storage_path);
}

export async function abandonStudioDirectReplacement(projectId: string, assetId: string) {
  const { asset, service } = await getStudioProjectAsset(projectId, assetId, {
    allowedStates: ["ready"],
  });
  const pendingPath = asset.pending_storage_path;
  await service.rpc("studio_clear_project_asset_replacement", {
    p_project_id: projectId,
    p_asset_id: assetId,
  });
  if (pendingPath) await deleteStoragePaths([pendingPath]);
}

export async function failAndReleaseStudioUpload(
  projectId: string,
  assetId: string,
  storagePath?: string,
) {
  const service = createServiceRoleClient();
  await service.rpc("studio_fail_project_asset", {
    p_project_id: projectId,
    p_asset_id: assetId,
  }).then(({ error }) => {
    if (error && !error.message.includes("project_not_found")) {
      console.error("studio_fail_asset_error", error.message);
    }
  });
  const { data } = await service.rpc("release_studio_project_asset", {
    p_project_id: projectId,
    p_asset_id: assetId,
  });
  await deleteStoragePaths([
    ...(storagePath ? [storagePath] : []),
    ...((data ?? []) as Array<{ storage_path: string }>).map((row) => row.storage_path),
  ]);
}

export async function cleanupStaleStudioUploads() {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("studio_cleanup_stale_asset_uploads", {
    p_max_age: "2 hours",
  });
  if (error) {
    console.error("studio_stale_upload_cleanup_error", error.message);
    return;
  }
  await deleteStoragePaths(
    (data ?? []).map((row: { storage_path: string }) => row.storage_path),
  );
}

async function readStoredPeaks(
  asset: StudioProjectAssetRow,
): Promise<StudioAssetPeaksDto | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("studio_asset_sources")
    .select("peaks_version, peaks_columns, peaks_data")
    .eq("id", asset.source_id ?? asset.id)
    .maybeSingle();
  if (error || !data || data.peaks_version !== 1 || !data.peaks_data || !data.peaks_columns) {
    return null;
  }
  const bytes = data.peaks_data as string | Uint8Array;
  const dataBase64 = typeof bytes === "string"
    ? bytes
    : Buffer.from(bytes).toString("base64");
  return {
    version: 1,
    columns: Number(data.peaks_columns),
    dataBase64,
  };
}

export { setUploadState };
