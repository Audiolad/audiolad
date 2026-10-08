export const PRODUCT_VIDEO_EXPORT_BUCKET = "product-video-assets";

export const PRODUCT_VIDEO_EXPORT_AUTHOR_SLUGS = [
  "sergey-and-zoya",
  "sergey-petrov",
  "zoya-petrova",
] as const;

export type ProductVideoOrientation = "landscape_16_9" | "portrait_9_16";

export const PRODUCT_VIDEO_ORIENTATIONS: readonly ProductVideoOrientation[] = [
  "landscape_16_9",
  "portrait_9_16",
];

export const PRODUCT_VIDEO_ORIENTATION_META: Record<
  ProductVideoOrientation,
  {
    width: number;
    height: number;
    ratioLabel: "16:9" | "9:16";
    coverLabel: string;
    buttonLabel: string;
  }
> = {
  landscape_16_9: {
    width: 1920,
    height: 1080,
    ratioLabel: "16:9",
    coverLabel:
      "Видеообложка 16:9 (горизонтальное видео — YouTube / VK Видео)",
    buttonLabel: "Создать видео 16:9",
  },
  portrait_9_16: {
    width: 1080,
    height: 1920,
    ratioLabel: "9:16",
    coverLabel:
      "Видеообложка 9:16 (вертикальное видео — Reels / YouTube Shorts / VK Клипы)",
    buttonLabel: "Создать видео 9:16",
  },
};

export const PRODUCT_VIDEO_EXPORT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const PRODUCT_VIDEO_EXPORT_LEASE_SECONDS = 1800;
export const PRODUCT_VIDEO_EXPORT_MAX_ATTEMPTS = 3;
export const PRODUCT_VIDEO_EXPORT_IDLE_INTERVAL_MS = 5_000;
export const PRODUCT_VIDEO_EXPORT_HEARTBEAT_INTERVAL_MS = 5 * 60_000;
export const PRODUCT_VIDEO_EXPORT_STALL_MS = 10 * 60_000;
/** Author cabinet polls active MP4 jobs. Fast enough to see the bar move. */
export const PRODUCT_VIDEO_EXPORT_PROGRESS_POLL_MS = 2_000;
/**
 * libx264 preset for a static cover. Chosen after the 16-minute still-image
 * benchmark in docs/PRODUCT_VIDEO_RENDER_PRESET.md. Audio stays AAC 192k.
 */
export const PRODUCT_VIDEO_X264_PRESET = "veryfast";
/**
 * Render recipe written to product_video_render_jobs.render_recipe on
 * completion. Bump it whenever the burned-in picture changes, so a completed
 * MP4 made with an older recipe shows «Нужно пересоздать» instead of being
 * offered as current. v1 = scaled cover + bottom-right «это аудио» indicator.
 */
export const PRODUCT_VIDEO_RENDER_RECIPE = "cover-audio-indicator-v1";

/** A completed job is current only if it was rendered with today's recipe. */
export function isProductVideoRenderRecipeCurrent(
  recipe: string | null | undefined,
): boolean {
  return recipe === PRODUCT_VIDEO_RENDER_RECIPE;
}

/**
 * Stale = the job no longer matches the product: audio or cover changed, or a
 * completed MP4 was rendered with an older recipe (e.g. before the audio
 * indicator). Queued/processing jobs are rendered by the current worker, so
 * the recipe check only applies to completed jobs. Stale jobs are not
 * downloadable; the cabinet offers «Создать заново».
 */
export function isProductVideoRenderJobStale(input: {
  status: string;
  sourceAudioPath: string;
  sourceCoverPath: string;
  renderRecipe: string | null | undefined;
  currentAudioPath: string | null | undefined;
  currentCoverPath: string | null | undefined;
}): boolean {
  if (!input.currentAudioPath || input.sourceAudioPath !== input.currentAudioPath) {
    return true;
  }
  if (!input.currentCoverPath || input.sourceCoverPath !== input.currentCoverPath) {
    return true;
  }
  return (
    input.status === "completed" &&
    !isProductVideoRenderRecipeCurrent(input.renderRecipe)
  );
}

export function isProductVideoExportAuthorSlug(
  slug: string | null | undefined,
): boolean {
  const normalized = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  return PRODUCT_VIDEO_EXPORT_AUTHOR_SLUGS.includes(
    normalized as (typeof PRODUCT_VIDEO_EXPORT_AUTHOR_SLUGS)[number],
  );
}

export function parseProductVideoOrientation(
  value: unknown,
): ProductVideoOrientation | null {
  return PRODUCT_VIDEO_ORIENTATIONS.includes(value as ProductVideoOrientation)
    ? (value as ProductVideoOrientation)
    : null;
}

export function productVideoCoverColumn(
  orientation: ProductVideoOrientation,
): "landscape_cover_path" | "portrait_cover_path" {
  return orientation === "landscape_16_9"
    ? "landscape_cover_path"
    : "portrait_cover_path";
}

export function productVideoCoverStoragePath(
  practiceId: string,
  orientation: ProductVideoOrientation,
  token: string,
): string {
  return `practices/${practiceId}/video-covers/${orientation}/${token}.webp`;
}

export function productVideoOutputStoragePath(
  practiceId: string,
  audioItemId: string,
  orientation: ProductVideoOrientation,
  jobId: string,
): string {
  return `practices/${practiceId}/video/${audioItemId}/${orientation}/${jobId}.mp4`;
}
