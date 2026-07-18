import sharp from "sharp";

import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_OUTPUT_SIZE,
  AVATAR_SQUARE_TOLERANCE_PX,
  AVATAR_WEBP_QUALITY,
} from "@/lib/images/avatar-constants";
import { isNearlySquare } from "@/lib/images/avatar-crop-math";

export type AvatarProcessErrorCode =
  | "missing_file"
  | "invalid_file_size"
  | "invalid_file_type"
  | "corrupt_image"
  | "invalid_aspect_ratio";

export type AvatarProcessResult =
  | {
      ok: true;
      buffer: Buffer;
      contentType: "image/webp";
      width: number;
      height: number;
    }
  | { ok: false; code: AvatarProcessErrorCode };

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

export async function processAvatarImageBuffer(
  input: Buffer,
  declaredMime: string | null | undefined,
  options?: {
    maxBytes?: number;
    outputSize?: number;
    requireSquare?: boolean;
  },
): Promise<AvatarProcessResult> {
  const maxBytes = options?.maxBytes ?? AVATAR_MAX_BYTES;
  const outputSize = options?.outputSize ?? AVATAR_OUTPUT_SIZE;
  const requireSquare = options?.requireSquare ?? true;

  if (!input || input.length === 0) {
    return { ok: false, code: "missing_file" };
  }

  if (input.length > maxBytes) {
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

  if (!magicMime || !AVATAR_ALLOWED_MIME_TYPES.has(magicMime)) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (
    normalizedDeclared &&
    AVATAR_ALLOWED_MIME_TYPES.has(normalizedDeclared) &&
    normalizedDeclared !== magicMime
  ) {
    return { ok: false, code: "invalid_file_type" };
  }

  try {
    const probe = sharp(input, {
      failOn: "error",
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
      sequentialRead: true,
      animated: false,
    });

    const meta = await probe.metadata();

    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
      return { ok: false, code: "invalid_file_type" };
    }

    if (meta.pages && meta.pages > 1) {
      return { ok: false, code: "invalid_file_type" };
    }

    if (
      typeof meta.width !== "number" ||
      typeof meta.height !== "number" ||
      meta.width <= 0 ||
      meta.height <= 0
    ) {
      return { ok: false, code: "corrupt_image" };
    }

    if (meta.width * meta.height > AVATAR_MAX_INPUT_PIXELS) {
      return { ok: false, code: "corrupt_image" };
    }

    if (
      requireSquare &&
      !isNearlySquare(meta.width, meta.height, AVATAR_SQUARE_TOLERANCE_PX)
    ) {
      return { ok: false, code: "invalid_aspect_ratio" };
    }

    const targetSize = Math.min(
      outputSize,
      Math.max(meta.width, meta.height),
    );

    const hasAlpha = meta.hasAlpha === true;
    const pipeline = sharp(input, {
      failOn: "error",
      limitInputPixels: AVATAR_MAX_INPUT_PIXELS,
      sequentialRead: true,
      animated: false,
    })
      .rotate()
      .resize(targetSize, targetSize, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      });

    const { data, info } = await (hasAlpha
      ? pipeline.webp({
          quality: AVATAR_WEBP_QUALITY,
          effort: 4,
          lossless: false,
          alphaQuality: 100,
        })
      : pipeline.webp({
          quality: AVATAR_WEBP_QUALITY,
          effort: 4,
        })
    ).toBuffer({ resolveWithObject: true });

    if (
      !data.length ||
      !isNearlySquare(info.width, info.height, AVATAR_SQUARE_TOLERANCE_PX)
    ) {
      return { ok: false, code: "corrupt_image" };
    }

    return {
      ok: true,
      buffer: data,
      contentType: "image/webp",
      width: info.width,
      height: info.height,
    };
  } catch {
    return { ok: false, code: "corrupt_image" };
  }
}

export function avatarProcessErrorMessage(code: AvatarProcessErrorCode): string {
  switch (code) {
    case "missing_file":
      return "Выберите изображение для аватара.";
    case "invalid_file_size":
      return "Размер изображения не должен превышать 3 МБ.";
    case "invalid_file_type":
      return "Выберите изображение JPG, PNG или WebP";
    case "invalid_aspect_ratio":
      return "Не удалось сохранить фотографию. Попробуйте ещё раз.";
    case "corrupt_image":
      return "Не удалось открыть изображение. Попробуйте выбрать другой файл";
    default:
      return "Не удалось сохранить фотографию. Попробуйте ещё раз.";
  }
}
