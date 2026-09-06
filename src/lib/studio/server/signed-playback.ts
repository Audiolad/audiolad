import "server-only";

import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";

import { STUDIO_PLAYBACK_URL_TTL_SECONDS } from "../signed-playback";
import { STUDIO_ASSETS_BUCKET } from "./model";
import { getStudioProjectAsset } from "./repository";
import { StudioApiError } from "./validation";

export async function createStudioAssetPlaybackUrl(
  projectId: string,
  assetId: string,
  ttlSeconds = STUDIO_PLAYBACK_URL_TTL_SECONDS,
) {
  const { asset, service } = await getStudioProjectAsset(projectId, assetId);
  const expiresIn =
    Number.isFinite(ttlSeconds) && ttlSeconds > 0
      ? Math.floor(ttlSeconds)
      : STUDIO_PLAYBACK_URL_TTL_SECONDS;
  const { data, error } = await service.storage
    .from(STUDIO_ASSETS_BUCKET)
    .createSignedUrl(asset.storage_path, expiresIn);

  if (error || !data?.signedUrl) {
    console.error("studio_asset_playback_sign_error", error?.message);
    throw new StudioApiError("internal_error", 500);
  }

  const url = normalizeStorageSignedUrl(data.signedUrl);
  if (!url) {
    throw new StudioApiError("internal_error", 500);
  }

  return {
    url,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    ttlSeconds: expiresIn,
    durationSeconds: asset.duration_seconds,
    mimeType: asset.mime_type,
    originalName: asset.original_name,
    sizeBytes: Number(asset.size_bytes),
    sourceType: asset.source_type,
  };
}
