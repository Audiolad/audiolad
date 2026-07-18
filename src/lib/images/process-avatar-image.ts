import {
  AVATAR_MAX_BYTES,
  AVATAR_SQUARE_TOLERANCE_PX,
} from "@/lib/images/avatar-constants";
import { isNearlySquare } from "@/lib/images/avatar-crop-math";
import { processImageForProfile } from "@/lib/images/process-image";
import type { ImageProcessErrorCode } from "@/lib/images/image-types";

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
  },
): Promise<AvatarProcessResult> {
  if (options?.maxBytes && input.length > options.maxBytes) {
    return { ok: false, code: "invalid_file_size" };
  }

  const processed = await processImageForProfile(input, declaredMime, "author-avatar");

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
    // Backward-compatible single-buffer consumers expect capped size.
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
      return "Выберите изображение для аватара.";
    case "invalid_file_size":
      return `Размер изображения не должен превышать ${Math.round(AVATAR_MAX_BYTES / (1024 * 1024))} МБ.`;
    case "invalid_file_type":
      return "Выберите изображение JPG, PNG или WebP";
    case "invalid_aspect_ratio":
      return "Не удалось сохранить фотографию. Попробуйте ещё раз.";
    case "corrupt_image":
      return "Не удалось открыть изображение. Попробуйте выбрать другой файл";
    case "image_too_large":
      return "Изображение слишком большое. Выберите файл меньшего разрешения.";
    default:
      return "Не удалось сохранить фотографию. Попробуйте ещё раз.";
  }
}
