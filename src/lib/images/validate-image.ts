import {
  IMAGE_ALLOWED_MIME_TYPES,
  IMAGE_MAX_INPUT_PIXELS,
  IMAGE_MAX_SOURCE_DIMENSION,
} from "@/lib/images/image-constants";
import {
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_MAX_SOURCE_DIMENSION,
} from "@/lib/images/avatar-constants";
import type { ImageProcessErrorCode } from "@/lib/images/image-types";
import { getImageProfileConfig } from "@/lib/images/image-profiles";
import type { ImageProfile } from "@/lib/images/image-types";
import {
  detectImageKindFromBytes,
  type DetectedImageKind,
} from "@/lib/images/image-magic";

export type DetectedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/svg+xml"
  | "image/avif"
  | "image/heic"
  | "image/heif"
  | "video";

const AVATAR_SOURCE_PROFILES = new Set<ImageProfile>([
  "author-avatar",
  "user-avatar",
]);

const AVATAR_SOURCE_MAGIC = new Set<DetectedImageKind>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

export function isAvatarImageProfile(profile: ImageProfile): boolean {
  return AVATAR_SOURCE_PROFILES.has(profile);
}

export function detectMimeFromMagic(buffer: Buffer): DetectedImageMime | null {
  return detectImageKindFromBytes(buffer);
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
    case "image/avif":
    case "image/heic":
    case "image/heif":
      return "webp";
    default:
      return null;
  }
}

export type ValidatedImageInput = {
  magicMime:
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/avif"
    | "image/heic"
    | "image/heif";
  originalExtension: "jpg" | "png" | "webp";
};

export function validateImageBufferForProfile(
  input: Buffer,
  declaredMime: string | null | undefined,
  profile: ImageProfile,
): { ok: true; data: ValidatedImageInput } | { ok: false; code: ImageProcessErrorCode } {
  const config = getImageProfileConfig(profile);
  const avatarProfile = isAvatarImageProfile(profile);

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
    magicMime === "video"
  ) {
    return { ok: false, code: "invalid_file_type" };
  }

  const allowedMagic = avatarProfile ? AVATAR_SOURCE_MAGIC : IMAGE_ALLOWED_MIME_TYPES;

  if (!magicMime || !allowedMagic.has(magicMime)) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (
    !avatarProfile &&
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

export function validateImageSourceBounds(
  width: number,
  height: number,
  profile: ImageProfile,
): ImageProcessErrorCode | null {
  const avatarProfile = isAvatarImageProfile(profile);
  const maxDimension = avatarProfile
    ? AVATAR_MAX_SOURCE_DIMENSION
    : IMAGE_MAX_SOURCE_DIMENSION;
  const maxPixels = avatarProfile ? AVATAR_MAX_INPUT_PIXELS : IMAGE_MAX_INPUT_PIXELS;

  if (width <= 0 || height <= 0) {
    return "corrupt_image";
  }

  if (width > maxDimension || height > maxDimension) {
    return "image_too_large";
  }

  if (width * height > maxPixels) {
    return "image_too_large";
  }

  return null;
}

export function validateImageDimensions(
  width: number,
  height: number,
  profile: ImageProfile,
): ImageProcessErrorCode | null {
  const config = getImageProfileConfig(profile);
  const avatarProfile = isAvatarImageProfile(profile);
  const boundError = validateImageSourceBounds(width, height, profile);

  if (boundError) {
    return boundError;
  }

  if (
    config.minSourceWidth &&
    (width < config.minSourceWidth || height < config.minSourceHeight!)
  ) {
    return "invalid_aspect_ratio";
  }

  // Avatar sources may be raw phone photos; variants use fit:cover to square.
  if (config.requireSquare && !avatarProfile) {
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
