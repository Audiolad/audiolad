import { processImageForProfile } from "@/lib/images/process-image";
import type { ImageProcessErrorCode } from "@/lib/images/image-types";
import {
  PLAYLIST_COVER_OUTPUT_SIZE,
  PLAYLIST_COVER_WEBP_QUALITY,
} from "@/lib/playlists/covers";

export type PlaylistCoverProcessErrorCode = ImageProcessErrorCode;

export type PlaylistCoverProcessResult =
  | {
      ok: true;
      buffer: Buffer;
      contentType: "image/webp";
      width: number;
      height: number;
    }
  | { ok: false; code: PlaylistCoverProcessErrorCode };

/** @deprecated Prefer processImageForProfile('playlist-cover') + upload-image-set. */
export async function processPlaylistCoverImage(
  input: Buffer,
  declaredMime: string | null | undefined,
): Promise<PlaylistCoverProcessResult> {
  const processed = await processImageForProfile(input, declaredMime, "playlist-cover");

  if (!processed.ok) {
    return processed;
  }

  const xl =
    processed.data.variants.find((variant) => variant.key === "xl") ??
    processed.data.variants.find((variant) => variant.key === "lg");

  if (!xl) {
    return { ok: false, code: "corrupt_image" };
  }

  return {
    ok: true,
    buffer: xl.buffer,
    contentType: "image/webp",
    width: xl.width,
    height: xl.height,
  };
}

export function playlistCoverProcessErrorMessage(
  code: PlaylistCoverProcessErrorCode,
): string {
  switch (code) {
    case "missing_file":
      return "Не удалось сохранить обложку. Попробуйте ещё раз.";
    case "invalid_file_size":
      return "Размер изображения не должен превышать 5 МБ.";
    case "invalid_file_type":
      return "Можно загрузить изображение JPG, PNG или WebP.";
    case "corrupt_image":
      return "Не удалось обработать изображение. Выберите другой файл.";
    case "invalid_aspect_ratio":
      return "Минимальный размер обложки — 320 × 320 пикселей.";
    case "image_too_large":
      return "Изображение слишком большое. Выберите файл меньшего разрешения.";
    default:
      return "Не удалось сохранить обложку. Попробуйте ещё раз.";
  }
}

export { PLAYLIST_COVER_OUTPUT_SIZE, PLAYLIST_COVER_WEBP_QUALITY };
