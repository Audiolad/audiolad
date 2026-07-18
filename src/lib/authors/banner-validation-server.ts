import sharp from "sharp";

import {
  AUTHOR_BANNER_ERROR_MESSAGES,
  AUTHOR_BANNER_IMAGE_CONFIG,
  validateAuthorBannerDimensions,
} from "@/lib/authors/banner-validation-client";

export type AuthorBannerBufferValidationResult =
  | { ok: true; width: number; height: number }
  | {
      ok: false;
      code: "invalid_file_size" | "invalid_file_type" | "corrupt_image" | "too_small";
      message: string;
    };

const ALLOWED_MIME_TYPES = new Set<string>(
  AUTHOR_BANNER_IMAGE_CONFIG.allowedMimeTypes,
);

const MAGIC_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const MAGIC_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAGIC_WEBP_RIFF = Buffer.from("RIFF", "ascii");
const MAGIC_WEBP_WEBP = Buffer.from("WEBP", "ascii");
const MAGIC_GIF = Buffer.from("GIF8", "ascii");
const MAGIC_SVG_HINTS = ["<svg", "<?xml"];

function detectMimeFromMagic(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(MAGIC_JPEG)) {
    return "image/jpeg";
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(MAGIC_PNG)) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(MAGIC_WEBP_RIFF) &&
    buffer.subarray(8, 12).equals(MAGIC_WEBP_WEBP)
  ) {
    return "image/webp";
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(MAGIC_GIF)) {
    return "image/gif";
  }

  const head = buffer
    .subarray(0, Math.min(buffer.length, 256))
    .toString("utf8")
    .toLowerCase();

  if (MAGIC_SVG_HINTS.some((hint) => head.includes(hint))) {
    return "image/svg+xml";
  }

  return null;
}

export async function validateAuthorBannerBuffer(
  input: Buffer,
  declaredMime: string | null | undefined,
): Promise<AuthorBannerBufferValidationResult> {
  if (!input || input.length === 0) {
    return {
      ok: false,
      code: "invalid_file_type",
      message: AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
    };
  }

  if (input.length > AUTHOR_BANNER_IMAGE_CONFIG.maxFileSize) {
    return {
      ok: false,
      code: "invalid_file_size",
      message: AUTHOR_BANNER_ERROR_MESSAGES.fileTooLarge,
    };
  }

  const magicMime = detectMimeFromMagic(input);
  const normalizedDeclared = (declaredMime ?? "").toLowerCase().trim();

  if (
    magicMime === "image/gif" ||
    magicMime === "image/svg+xml" ||
    normalizedDeclared === "image/gif" ||
    normalizedDeclared === "image/svg+xml"
  ) {
    return {
      ok: false,
      code: "invalid_file_type",
      message: AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
    };
  }

  if (!magicMime || !ALLOWED_MIME_TYPES.has(magicMime)) {
    return {
      ok: false,
      code: "invalid_file_type",
      message: AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
    };
  }

  if (
    normalizedDeclared &&
    ALLOWED_MIME_TYPES.has(normalizedDeclared) &&
    normalizedDeclared !== magicMime
  ) {
    return {
      ok: false,
      code: "invalid_file_type",
      message: AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
    };
  }

  try {
    const meta = await sharp(input, {
      failOn: "error",
      sequentialRead: true,
      animated: false,
    }).metadata();

    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      return {
        ok: false,
        code: "invalid_file_type",
        message: AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
      };
    }

    if (meta.pages && meta.pages > 1) {
      return {
        ok: false,
        code: "invalid_file_type",
        message: AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
      };
    }

    if (
      typeof meta.width !== "number" ||
      typeof meta.height !== "number" ||
      meta.width <= 0 ||
      meta.height <= 0
    ) {
      return {
        ok: false,
        code: "corrupt_image",
        message: AUTHOR_BANNER_ERROR_MESSAGES.readFailed,
      };
    }

    const dimensionError = validateAuthorBannerDimensions(
      meta.width,
      meta.height,
    );

    if (dimensionError) {
      return {
        ok: false,
        code: "too_small",
        message: dimensionError,
      };
    }

    return {
      ok: true,
      width: meta.width,
      height: meta.height,
    };
  } catch {
    return {
      ok: false,
      code: "corrupt_image",
      message: AUTHOR_BANNER_ERROR_MESSAGES.readFailed,
    };
  }
}
