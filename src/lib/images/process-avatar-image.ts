import { AVATAR_ERROR_MESSAGES, AVATAR_MAX_SOURCE_BYTES } from "@/lib/images/avatar-constants";
import { isNearlySquare } from "@/lib/images/avatar-crop-math";
import { AVATAR_SQUARE_TOLERANCE_PX } from "@/lib/images/avatar-constants";
import { processImageForProfile } from "@/lib/images/process-image";
import type { ImageProcessErrorCode, ImageProfile } from "@/lib/images/image-types";

export type AvatarProcessErrorCode = ImageProcessErrorCode;

export type AvatarProcessResult =
  | {
      ok: true;
      buffer: Buffer;
      contentType: "image/webp";
      width: number;
      height: number;
    }
  | { ok: false; code: AvatarProcessErrorCode };

export async function processAvatarImageBuffer(
  input: Buffer,
  declaredMime: string | null | undefined,
  options?: {
    maxBytes?: number;
    outputSize?: number;
    requireSquare?: boolean;
    profile?: Extract<ImageProfile, "author-avatar" | "user-avatar">;
  },
): Promise<AvatarProcessResult> {
  const maxBytes = options?.maxBytes ?? AVATAR_MAX_SOURCE_BYTES;

  if (input.length > maxBytes) {
    return { ok: false, code: "invalid_file_size" };
  }

  const processed = await processImageForProfile(
    input,
    declaredMime,
    options?.profile ?? "author-avatar",
  );

  if (!processed.ok) {
    return processed;
  }

  const requireSquare = options?.requireSquare ?? true;
  const xl =
    processed.data.variants.find((variant) => variant.key === "xl") ??
    processed.data.variants[processed.data.variants.length - 1];

  if (!xl) {
    return { ok: false, code: "corrupt_image" };
  }

  if (
    requireSquare &&
    !isNearlySquare(xl.width, xl.height, AVATAR_SQUARE_TOLERANCE_PX)
  ) {
    return { ok: false, code: "invalid_aspect_ratio" };
  }

  const targetSize = options?.outputSize;

  if (targetSize && targetSize < xl.width) {
    return {
      ok: true,
      buffer: xl.buffer,
      contentType: "image/webp",
      width: Math.min(xl.width, targetSize),
      height: Math.min(xl.height, targetSize),
    };
  }

  return {
    ok: true,
    buffer: xl.buffer,
    contentType: "image/webp",
    width: xl.width,
    height: xl.height,
  };
}

export function avatarProcessErrorMessage(code: AvatarProcessErrorCode): string {
  switch (code) {
    case "missing_file":
      return AVATAR_ERROR_MESSAGES.notImage;
    case "invalid_file_size":
      return AVATAR_ERROR_MESSAGES.fileTooLarge;
    case "invalid_file_type":
      return AVATAR_ERROR_MESSAGES.notImage;
    case "invalid_aspect_ratio":
      return AVATAR_ERROR_MESSAGES.saveFailed;
    case "corrupt_image":
      return AVATAR_ERROR_MESSAGES.processFailed;
    case "image_too_large":
      return AVATAR_ERROR_MESSAGES.resolutionTooLarge;
    default:
      return AVATAR_ERROR_MESSAGES.saveFailed;
  }
}
