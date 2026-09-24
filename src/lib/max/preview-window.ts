import { resolvePlaybackPreviewWindow } from "@/lib/listen/preview-window";

export const MAX_STOREFRONT_PREVIEW_MAX_DURATION_MS = 60_000;

export type CappedMaxPreviewWindow = {
  startMs: number;
  endMs: number;
  durationMs: number;
  durationSeconds: number;
};

/**
 * Preserve configured start. Never extend a shorter window.
 * Never serve more than 60 seconds in MAX.
 */
export function capMaxStorefrontPreviewWindow(input: {
  startMs: number;
  endMs: number;
}): CappedMaxPreviewWindow {
  const startMs = Math.max(0, Math.floor(input.startMs));
  const rawEnd = Math.floor(input.endMs);
  const endMs = Math.min(
    rawEnd,
    startMs + MAX_STOREFRONT_PREVIEW_MAX_DURATION_MS,
  );
  const durationMs = Math.max(0, endMs - startMs);

  return {
    startMs,
    endMs,
    durationMs,
    durationSeconds: Math.max(0, Math.round(durationMs / 1000)),
  };
}

export function resolveCappedMaxPreviewWindow(
  window: {
    previewStartMs: number | null;
    previewEndMs: number | null;
  },
  trackDurationMs?: number | null,
): CappedMaxPreviewWindow {
  const resolved = resolvePlaybackPreviewWindow(window, trackDurationMs);
  return capMaxStorefrontPreviewWindow(resolved);
}
