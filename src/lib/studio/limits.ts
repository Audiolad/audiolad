export const STUDIO_ASSETS_BUCKET = "studio-draft-assets" as const;

export const MAX_STUDIO_AUDIO_DURATION_SECONDS = 10_800;
export const MAX_STUDIO_ASSET_BYTES = 314_572_800;
export const MAX_STUDIO_PROJECT_BYTES = 750 * 1024 * 1024;

export const STUDIO_LIMITS = {
  maxAudioDurationSeconds: MAX_STUDIO_AUDIO_DURATION_SECONDS,
  maxAssetBytes: MAX_STUDIO_ASSET_BYTES,
  maxProjectAssetBytes: MAX_STUDIO_PROJECT_BYTES,
} as const;

export const STUDIO_AUDIO_TOO_LONG_MESSAGE =
  "Максимальная продолжительность одной аудиодорожки — 3 часа.";

export const STUDIO_ASSET_TOO_LARGE_MESSAGE =
  "Размер одной дорожки превышает лимит Studio — 300 МБ.";

export const STUDIO_PROJECT_TOO_LARGE_MESSAGE =
  "Общий размер дорожек не может превышать 750 МБ.";

/** Abandoned reserve that never started a PUT. */
export const STUDIO_STALE_RESERVED_INTERVAL = "30 minutes";
/** Active PUT of a 300 MiB file can be slow; do not use created_at. */
export const STUDIO_STALE_UPLOADING_INTERVAL = "8 hours";
/** Finalize download + ffprobe should finish well before this. */
export const STUDIO_STALE_PROCESSING_INTERVAL = "45 minutes";
export const STUDIO_STALE_FAILED_INTERVAL = "15 minutes";
/** Pending replacement PUT can be a full 300 MiB file. */
export const STUDIO_STALE_PENDING_REPLACEMENT_INTERVAL = "8 hours";

export const STUDIO_STALE_RESERVED_MS = 30 * 60 * 1000;
export const STUDIO_STALE_UPLOADING_MS = 8 * 60 * 60 * 1000;
export const STUDIO_STALE_PROCESSING_MS = 45 * 60 * 1000;
export const STUDIO_STALE_FAILED_MS = 15 * 60 * 1000;
export const STUDIO_STALE_PENDING_REPLACEMENT_MS = 8 * 60 * 60 * 1000;

export function studioPeaksColumnCount(durationSeconds: number): number {
  const safeDuration =
    Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  return Math.min(32_768, Math.max(8_192, Math.ceil(safeDuration * 10)));
}

export function isStudioDurationAllowed(durationSeconds: number): boolean {
  return (
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    durationSeconds <= MAX_STUDIO_AUDIO_DURATION_SECONDS
  );
}

export function isStudioAssetSizeAllowed(sizeBytes: number): boolean {
  return Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_STUDIO_ASSET_BYTES;
}
