import {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_MAX_INPUT_PIXELS,
  IMAGE_MAX_SOURCE_DIMENSION,
} from "@/lib/images/image-constants";
import type { ImageProcessErrorCode } from "@/lib/images/image-types";
import { getImageProfileConfig } from "@/lib/images/image-profiles";
import type { ImageProfile } from "@/lib/images/image-types";

const MAGIC_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const MAGIC_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAGIC_WEBP_RIFF = Buffer.from("RIFF", "ascii");
const MAGIC_WEBP_WEBP = Buffer.from("WEBP", "ascii");
const MAGIC_GIF = Buffer.from("GIF8", "ascii");
const MAGIC_SVG_HINTS = ["<svg", "<?xml"];

export type DetectedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/svg+xml";

export function detectMimeFromMagic(buffer: Buffer): DetectedImageMime | null {
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

export function mimeToExtension(
  mime: DetectedImageMime,
): "jpg" | "png" | "webp" | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export type ValidatedImageInput = {
  magicMime: "image/jpeg" | "image/png" | "image/webp";
  originalExtension: "jpg" | "png" | "webp";
};

export function validateImageBufferForProfile(
  input: Buffer,
  declaredMime: string | null | undefined,
  profile: ImageProfile,
): { ok: true; data: ValidatedImageInput } | { ok: false; code: ImageProcessErrorCode } {
  const config = getImageProfileConfig(profile);

  if (!input || input.length === 0) {
    return { ok: false, code: "missing_file" };
  }

  if (input.length > config.maxUploadBytes) {
    return { ok: false, code: "invalid_file_size" };
  }

  const magicMime = detectMimeFromMagic(input);
  const normalizedDeclared = (declaredMime ?? "").toLowerCase().trim();

  if (
    magicMime === "image/gif" ||
    magicMime === "image/svg+xml" ||
    normalizedDeclared === "image/gif" ||
    normalizedDeclared === "image/svg+xml"
  ) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (!magicMime || !IMAGE_ALLOWED_MIME_TYPES.has(magicMime)) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (
    normalizedDeclared &&
    IMAGE_ALLOWED_MIME_TYPES.has(normalizedDeclared) &&
    normalizedDeclared !== magicMime
  ) {
    return { ok: false, code: "invalid_file_type" };
  }

  const originalExtension = mimeToExtension(magicMime);

  if (!originalExtension) {
    return { ok: false, code: "invalid_file_type" };
  }

  return {
    ok: true,
    data: {
      magicMime,
      originalExtension,
    },
  };
}

export function validateImageDimensions(
  width: number,
  height: number,
  profile: ImageProfile,
): ImageProcessErrorCode | null {
  const config = getImageProfileConfig(profile);

  if (width <= 0 || height <= 0) {
    return "corrupt_image";
  }

  if (width > IMAGE_MAX_SOURCE_DIMENSION || height > IMAGE_MAX_SOURCE_DIMENSION) {
    return "image_too_large";
  }

  if (width * height > IMAGE_MAX_INPUT_PIXELS) {
    return "image_too_large";
  }

  if (
    config.minSourceWidth &&
    (width < config.minSourceWidth || height < config.minSourceHeight!)
  ) {
    return "invalid_aspect_ratio";
  }

  if (config.requireSquare) {
    const tolerance = 2;
    if (Math.abs(width - height) > tolerance) {
      return "invalid_aspect_ratio";
    }
  }

  if (config.targetAspectRatio) {
    const ratio = width / height;
    const tolerance = config.aspectTolerance ?? 0.1;
    const target = config.targetAspectRatio;

    if (Math.abs(ratio - target) / target > tolerance) {
      // Soft aspect check for covers/banners — server will center-crop.
      if (profile === "author-banner" && width >= 1200 && height >= 400) {
        return null;
      }

      if (
        (profile === "product-cover" || profile === "track-cover") &&
        width >= 400 &&
        height >= 400
      ) {
        return null;
      }
    }
  }

  return null;
}
