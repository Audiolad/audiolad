export const PREVIEW_DURATION_MIN_MS = 30_000;
export const PREVIEW_DURATION_MAX_MS = 90_000;
/**
 * Temporary first-N-seconds clip for existing paid products that have no
 * author-selected storefront window. Not a normal storefront preview.
 */
export const COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS = 60_000;
/** @deprecated Use COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS. */
export const DEFAULT_PREVIEW_DURATION_MS =
  COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS;

export type StorefrontPreviewSource = "configured" | "compatibility_fallback";

export type ResolvedPlaybackPreviewWindow = {
  startMs: number;
  endMs: number;
  needsSetup: boolean;
  source: StorefrontPreviewSource;
};

export type AudioPreviewWindow = {
  previewStartMs: number | null;
  previewEndMs: number | null;
};

export type AudioPreviewWindowColumns = {
  preview_start_ms: number | null;
  preview_end_ms: number | null;
};

export type AudioPreviewWindowValidation =
  | { ok: true; window: AudioPreviewWindow }
  | { ok: false; reason: string };

function isIntegerMs(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function toAudioPreviewWindowColumns(
  window: AudioPreviewWindow,
): AudioPreviewWindowColumns {
  return {
    preview_start_ms: window.previewStartMs,
    preview_end_ms: window.previewEndMs,
  };
}

export function fromAudioPreviewWindowColumns(
  row: Partial<AudioPreviewWindowColumns> | null | undefined,
): AudioPreviewWindow {
  return {
    previewStartMs:
      row && isIntegerMs(row.preview_start_ms) ? row.preview_start_ms : null,
    previewEndMs:
      row && isIntegerMs(row.preview_end_ms) ? row.preview_end_ms : null,
  };
}

export function previewWindowDurationMs(
  window: AudioPreviewWindow,
): number | null {
  if (window.previewStartMs == null || window.previewEndMs == null) {
    return null;
  }

  return window.previewEndMs - window.previewStartMs;
}

export function validateAudioPreviewWindow(
  window: AudioPreviewWindow,
): AudioPreviewWindowValidation {
  const start = window.previewStartMs;
  const end = window.previewEndMs;

  if (start == null && end == null) {
    return { ok: true, window };
  }

  if (start == null || end == null) {
    return { ok: false, reason: "preview_window_incomplete" };
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { ok: false, reason: "preview_window_not_integer_ms" };
  }

  if (start < 0) {
    return { ok: false, reason: "preview_start_negative" };
  }

  if (end <= start) {
    return { ok: false, reason: "preview_end_not_after_start" };
  }

  const duration = end - start;

  if (duration < PREVIEW_DURATION_MIN_MS || duration > PREVIEW_DURATION_MAX_MS) {
    return { ok: false, reason: "preview_duration_out_of_range" };
  }

  return { ok: true, window };
}

/**
 * A normal storefront preview is an author-selected 30–90s fragment.
 * Missing or invalid windows are not storefront-ready.
 */
export function isConfiguredStorefrontPreviewWindow(
  window: AudioPreviewWindow,
): boolean {
  const validated = validateAudioPreviewWindow(window);

  return (
    validated.ok &&
    window.previewStartMs != null &&
    window.previewEndMs != null
  );
}

export function audioPreviewNeedsSetup(window: AudioPreviewWindow): boolean {
  return !isConfiguredStorefrontPreviewWindow(window);
}

/**
 * Resolve the window the player should clip to.
 * Configured 30–90s author windows win. Otherwise a temporary first-60s
 * compatibility clip is used for existing products and `needsSetup` is true.
 */
export function resolvePlaybackPreviewWindow(
  window: AudioPreviewWindow,
  trackDurationMs?: number | null,
): ResolvedPlaybackPreviewWindow {
  if (isConfiguredStorefrontPreviewWindow(window)) {
    const startMs = window.previewStartMs ?? 0;
    const endMs = window.previewEndMs ?? startMs;

    return {
      startMs,
      endMs,
      needsSetup: false,
      source: "configured",
    };
  }

  const trackMs =
    typeof trackDurationMs === "number" &&
    Number.isFinite(trackDurationMs) &&
    trackDurationMs > 0
      ? Math.trunc(trackDurationMs)
      : null;
  const endMs =
    trackMs == null
      ? COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS
      : Math.min(
          COMPATIBILITY_FALLBACK_PREVIEW_DURATION_MS,
          Math.max(trackMs, 1),
        );

  return {
    startMs: 0,
    endMs,
    needsSetup: true,
    source: "compatibility_fallback",
  };
}
