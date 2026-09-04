export type PreviewPlayerTimeline = {
  mediaStartSeconds: number;
  mediaEndSeconds: number;
  displayDurationSeconds: number;
};

/**
 * Storefront preview audio is an extracted clip, not the original file.
 * The media element timeline is 0-based over the allowed window only.
 */
export function resolvePreviewClipMediaTimeline(input: {
  previewStartMs: number;
  previewEndMs: number;
}): PreviewPlayerTimeline {
  const start =
    Number.isFinite(input.previewStartMs) && input.previewStartMs > 0
      ? input.previewStartMs / 1000
      : 0;
  const end =
    Number.isFinite(input.previewEndMs) && input.previewEndMs > start * 1000
      ? input.previewEndMs / 1000
      : 0;
  const span = Math.max(0, end - start);

  return {
    mediaStartSeconds: 0,
    mediaEndSeconds: span,
    displayDurationSeconds: span,
  };
}
