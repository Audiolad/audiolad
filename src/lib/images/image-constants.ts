/** Immutable cache for versioned optimized variants (1 year). */
export const IMAGE_IMMUTABLE_CACHE_CONTROL = "31536000";

/** Default max upload size when profile does not override. */
export const IMAGE_DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Max source dimension (either axis). */
export const IMAGE_MAX_SOURCE_DIMENSION = 8000;

/** Reject decompression bombs (~8000×8000). */
export const IMAGE_MAX_INPUT_PIXELS = 64_000_000;

export const IMAGE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const PLACEHOLDER_MAX_BYTES = 2048;
export const PLACEHOLDER_SIZE = 24;
export const PLACEHOLDER_QUALITY = 20;
