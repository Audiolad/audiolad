import type { ProductAudioSourceFormat } from "@/lib/author-products/product-audio-upload-contract";

export const PRODUCT_AUDIO_NORMALIZE_LEASE_SECONDS = 1800;
export const PRODUCT_AUDIO_NORMALIZE_MAX_ATTEMPTS = 3;
export const PRODUCT_AUDIO_NORMALIZE_IDLE_INTERVAL_MS = 2_000;
export const PRODUCT_AUDIO_NORMALIZE_HEARTBEAT_INTERVAL_MS = 30_000;
export const PRODUCT_AUDIO_NORMALIZE_SHUTDOWN_DRAIN_MS = 15_000;

/** Speech/meditation delivery bitrate (matches Studio render convention). */
export {
  PRODUCT_AUDIO_DELIVERY_BITRATE,
  PRODUCT_AUDIO_DELIVERY_BITRATE_KBPS,
} from "@/lib/author-products/product-audio-upload-contract";

export const PRODUCT_AUDIO_DURATION_TOLERANCE_RATIO = 0.08;
export const PRODUCT_AUDIO_DURATION_TOLERANCE_ABS_SECONDS = 2;

export type ProductNormalizeSourceFormat = Exclude<ProductAudioSourceFormat, "mp3">;

export function durationWithinTolerance(
  actual: number,
  expected: number,
): boolean {
  if (!(actual > 0) || !(expected > 0)) return false;
  const delta = Math.abs(actual - expected);
  const allowed = Math.max(
    PRODUCT_AUDIO_DURATION_TOLERANCE_ABS_SECONDS,
    expected * PRODUCT_AUDIO_DURATION_TOLERANCE_RATIO,
  );
  return delta <= allowed;
}

export function classifyProductNormalizeError(error: unknown): {
  code: string;
  safeMessage: string;
} {
  const raw =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : error instanceof Error
        ? error.message
        : "normalize_failed";
  const code = raw || "normalize_failed";
  return {
    code,
    safeMessage: "Не удалось подготовить аудиофайл.",
  };
}
