export const PRACTICE_AUDIO_BUCKET = "practice-audio";

/** Direct Storage upload limit for publication-product MP3 files. */
export const MAX_PRODUCT_AUDIO_BYTES = 300 * 1024 * 1024;

export const PRODUCT_AUDIO_MAX_MB = MAX_PRODUCT_AUDIO_BYTES / (1024 * 1024);

export const PRODUCT_AUDIO_TOO_LARGE_MESSAGE =
  "Размер аудиофайла не должен превышать 300 МБ.";

export const PRODUCT_AUDIO_WRONG_TYPE_MESSAGE =
  "Загрузите аудиофайл в формате MP3.";

export const PRODUCT_AUDIO_SIZE_HINT = `MP3 · до ${PRODUCT_AUDIO_MAX_MB} МБ`;

export const ALLOWED_PRODUCT_MP3_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
  "application/octet-stream",
] as const;

const ALLOWED_PRODUCT_MP3_MIME_SET = new Set<string>(ALLOWED_PRODUCT_MP3_MIME_TYPES);

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const VERSIONED_PRODUCT_AUDIO_PATH = new RegExp(
  `^practices/(${UUID_PATTERN})/audio/(${UUID_PATTERN})-(${UUID_PATTERN})\\.mp3$`,
  "i",
);

export type ProductMp3Descriptor = {
  name: string;
  type?: string | null;
  size: number;
};

export type ProductMp3ValidationCode =
  | "invalid_file_type"
  | "invalid_file_size";

export function isAllowedProductMp3Name(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".mp3");
}

export function isAllowedProductMp3Mime(mime: string | null | undefined): boolean {
  const normalized = (mime ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return ALLOWED_PRODUCT_MP3_MIME_SET.has(normalized);
}

export function isAllowedProductMp3Type(
  name: string,
  mime?: string | null,
): boolean {
  return isAllowedProductMp3Name(name) && isAllowedProductMp3Mime(mime);
}

export function isProductMp3SizeAllowed(
  size: number,
  maxBytes: number = MAX_PRODUCT_AUDIO_BYTES,
): boolean {
  return Number.isFinite(size) && size > 0 && size <= maxBytes;
}

export function validateProductMp3Descriptor(
  file: ProductMp3Descriptor,
  maxBytes: number = MAX_PRODUCT_AUDIO_BYTES,
): ProductMp3ValidationCode | null {
  if (!isAllowedProductMp3Type(file.name, file.type)) {
    return "invalid_file_type";
  }

  if (!isProductMp3SizeAllowed(file.size, maxBytes)) {
    return "invalid_file_size";
  }

  return null;
}

export function validateProductMp3FileClient(
  file: ProductMp3Descriptor,
): string | null {
  const code = validateProductMp3Descriptor(file);
  if (code === "invalid_file_type") {
    return PRODUCT_AUDIO_WRONG_TYPE_MESSAGE;
  }
  if (code === "invalid_file_size") {
    return PRODUCT_AUDIO_TOO_LARGE_MESSAGE;
  }
  return null;
}

export function buildVersionedProductAudioPath(
  practiceId: string,
  audioId: string,
  versionId: string,
): string {
  return `practices/${practiceId}/audio/${audioId}-${versionId}.mp3`;
}

export function isOwnedVersionedProductAudioPath(
  uploadPath: string,
  practiceId: string,
  audioId: string,
): boolean {
  const match = VERSIONED_PRODUCT_AUDIO_PATH.exec(uploadPath.trim());
  if (!match) {
    return false;
  }

  return (
    match[1].toLowerCase() === practiceId.toLowerCase() &&
    match[2].toLowerCase() === audioId.toLowerCase()
  );
}

export function shouldBlockProductAudioReplacement(
  locked: boolean,
  existingAudioPath: string | null | undefined,
): boolean {
  return Boolean(locked && existingAudioPath);
}

export function canAbandonProductAudioUploadPath(input: {
  uploadPath: string;
  practiceId: string;
  audioId: string;
  liveAudioPath: string | null | undefined;
}): boolean {
  if (
    !isOwnedVersionedProductAudioPath(
      input.uploadPath,
      input.practiceId,
      input.audioId,
    )
  ) {
    return false;
  }

  return input.uploadPath !== input.liveAudioPath;
}
