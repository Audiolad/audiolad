import sharp from "sharp";

import {
  USER_AVATAR_ALLOWED_MIME,
  USER_AVATAR_MAX_BYTES,
  USER_AVATAR_MAX_INPUT_PIXELS,
  USER_AVATAR_OUTPUT_SIZE,
  USER_AVATAR_WEBP_QUALITY,
} from "@/lib/profile/avatar";

export type UserAvatarProcessErrorCode =
  | "missing_file"
  | "invalid_file_size"
  | "invalid_file_type"
  | "corrupt_image";

export type UserAvatarProcessResult =
  | {
      ok: true;
      buffer: Buffer;
      contentType: "image/webp";
      width: number;
      height: number;
    }
  | { ok: false; code: UserAvatarProcessErrorCode };

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

export async function processUserAvatarImage(
  input: Buffer,
  declaredMime: string | null | undefined,
): Promise<UserAvatarProcessResult> {
  if (!input || input.length === 0) {
    return { ok: false, code: "missing_file" };
  }

  if (input.length > USER_AVATAR_MAX_BYTES) {
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

  if (!magicMime || !USER_AVATAR_ALLOWED_MIME.has(magicMime)) {
    return { ok: false, code: "invalid_file_type" };
  }

  if (
    normalizedDeclared &&
    USER_AVATAR_ALLOWED_MIME.has(normalizedDeclared) &&
    normalizedDeclared !== magicMime
  ) {
    return { ok: false, code: "invalid_file_type" };
  }

  try {
    const probe = sharp(input, {
      failOn: "error",
      limitInputPixels: USER_AVATAR_MAX_INPUT_PIXELS,
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
      typeof meta.width === "number" &&
      typeof meta.height === "number" &&
      meta.width * meta.height > USER_AVATAR_MAX_INPUT_PIXELS
    ) {
      return { ok: false, code: "corrupt_image" };
    }

    const { data, info } = await sharp(input, {
      failOn: "error",
      limitInputPixels: USER_AVATAR_MAX_INPUT_PIXELS,
      sequentialRead: true,
      animated: false,
    })
      .rotate()
      .resize(USER_AVATAR_OUTPUT_SIZE, USER_AVATAR_OUTPUT_SIZE, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: false,
      })
      .webp({
        quality: USER_AVATAR_WEBP_QUALITY,
        effort: 4,
      })
      .toBuffer({ resolveWithObject: true });

    if (
      !data.length ||
      info.width !== USER_AVATAR_OUTPUT_SIZE ||
      info.height !== USER_AVATAR_OUTPUT_SIZE
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

export function userAvatarProcessErrorMessage(
  code: UserAvatarProcessErrorCode,
): string {
  switch (code) {
    case "missing_file":
      return "Выберите изображение для аватара.";
    case "invalid_file_size":
      return "Размер изображения не должен превышать 5 МБ.";
    case "invalid_file_type":
      return "Можно загрузить изображение JPG, PNG или WebP.";
    case "corrupt_image":
      return "Не удалось обработать изображение. Выберите другой файл.";
    default:
      return "Не удалось загрузить аватар. Попробуйте ещё раз.";
  }
}
