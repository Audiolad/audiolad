/**
 * Author product audio SOURCE input contract (non-music).
 * Delivery remains canonical MP3 at audio_items.audio_path in practice-audio.
 * Live author UI accepts MP3, WAV, M4A and AAC. Delivery remains MP3.
 */

export const PRACTICE_AUDIO_BUCKET = "practice-audio";

/** Direct Storage upload limit for publication-product audio files. */
export const MAX_PRODUCT_AUDIO_BYTES = 300 * 1024 * 1024;

export const PRODUCT_AUDIO_MAX_MB = MAX_PRODUCT_AUDIO_BYTES / (1024 * 1024);

export const PRODUCT_AUDIO_TOO_LARGE_MESSAGE =
  "Размер аудиофайла не должен превышать 300 МБ.";

export const PRODUCT_AUDIO_WRONG_TYPE_MESSAGE =
  "Загрузите аудиофайл в формате MP3, WAV, M4A или AAC.";

export const PRODUCT_AUDIO_SIZE_HINT = `MP3, WAV, M4A, AAC · до ${PRODUCT_AUDIO_MAX_MB} МБ`;

export const PRODUCT_AUDIO_FILE_ACCEPT =
  ".mp3,.MP3,.wav,.WAV,.m4a,.M4A,.aac,.AAC,audio/mpeg,audio/mp3,audio/x-mpeg,audio/x-mp3,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/mp4,audio/x-m4a,audio/m4a,audio/aac,audio/x-aac";

export type ProductAudioSourceFormat = "mp3" | "wav" | "m4a" | "aac";

export const PRODUCT_AUDIO_DELIVERY_BITRATE_KBPS = 192;
export const PRODUCT_AUDIO_DELIVERY_BITRATE = "192k";

export const ALLOWED_PRODUCT_MP3_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
  "application/octet-stream",
] as const;

export const ALLOWED_PRODUCT_M4A_MIME_TYPES = [
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "application/octet-stream",
] as const;

export const ALLOWED_PRODUCT_WAV_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "application/octet-stream",
] as const;

export const ALLOWED_PRODUCT_AAC_MIME_TYPES = [
  "audio/aac",
  "audio/x-aac",
  "application/octet-stream",
] as const;

/** MIME types that may be sent on signed source upload (no octet-stream). */
export const PRODUCT_AUDIO_SIGNED_UPLOAD_MIME_BY_FORMAT: Record<
  ProductAudioSourceFormat,
  string
> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

const MP3_MIME_SET = new Set<string>(ALLOWED_PRODUCT_MP3_MIME_TYPES);
const WAV_MIME_SET = new Set<string>(ALLOWED_PRODUCT_WAV_MIME_TYPES);
const M4A_MIME_SET = new Set<string>(ALLOWED_PRODUCT_M4A_MIME_TYPES);
const AAC_MIME_SET = new Set<string>(ALLOWED_PRODUCT_AAC_MIME_TYPES);

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const VERSIONED_PRODUCT_AUDIO_PATH = new RegExp(
  `^practices/(${UUID_PATTERN})/audio/(${UUID_PATTERN})-(${UUID_PATTERN})\\.mp3$`,
  "i",
);

const VERSIONED_PRODUCT_AUDIO_SOURCE_PATH = new RegExp(
  `^practices/(${UUID_PATTERN})/audio-sources/(${UUID_PATTERN})-(${UUID_PATTERN})\\.(m4a|aac|wav)$`,
  "i",
);

export type ProductAudioDescriptor = {
  name: string;
  type?: string | null;
  size: number;
};

export type ProductAudioValidationCode =
  | "invalid_file_type"
  | "invalid_file_size";

function extensionOf(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  return dot >= 0 ? trimmed.slice(dot) : "";
}

export function detectProductAudioSourceFormat(
  name: string,
): ProductAudioSourceFormat | null {
  const ext = extensionOf(name);
  if (ext === ".mp3") return "mp3";
  if (ext === ".wav") return "wav";
  if (ext === ".m4a") return "m4a";
  if (ext === ".aac") return "aac";
  return null;
}

export function isAllowedProductMp3Name(name: string): boolean {
  return extensionOf(name) === ".mp3";
}

export function isAllowedProductMp3Mime(mime: string | null | undefined): boolean {
  const normalized = (mime ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return MP3_MIME_SET.has(normalized);
}

export function isAllowedProductMp3Type(
  name: string,
  mime?: string | null,
): boolean {
  return isAllowedProductMp3Name(name) && isAllowedProductMp3Mime(mime);
}

function mimeAllowedForFormat(
  format: ProductAudioSourceFormat,
  mime: string | null | undefined,
): boolean {
  const normalized = (mime ?? "").trim().toLowerCase();
  if (!normalized) return true;
  if (format === "mp3") return MP3_MIME_SET.has(normalized);
  if (format === "wav") return WAV_MIME_SET.has(normalized);
  if (format === "m4a") return M4A_MIME_SET.has(normalized);
  return AAC_MIME_SET.has(normalized);
}

export function isAllowedProductAudioSourceType(
  name: string,
  mime?: string | null,
): boolean {
  const format = detectProductAudioSourceFormat(name);
  if (!format) return false;
  return mimeAllowedForFormat(format, mime);
}

export function isProductMp3SizeAllowed(
  size: number,
  maxBytes: number = MAX_PRODUCT_AUDIO_BYTES,
): boolean {
  return Number.isFinite(size) && size > 0 && size <= maxBytes;
}

export function validateProductMp3Descriptor(
  file: ProductAudioDescriptor,
  maxBytes: number = MAX_PRODUCT_AUDIO_BYTES,
): ProductAudioValidationCode | null {
  if (!isAllowedProductMp3Type(file.name, file.type)) {
    return "invalid_file_type";
  }
  if (!isProductMp3SizeAllowed(file.size, maxBytes)) {
    return "invalid_file_size";
  }
  return null;
}

/** Server-side source descriptor (MP3 | WAV | M4A | AAC). */
export function validateProductAudioSourceDescriptor(
  file: ProductAudioDescriptor,
  maxBytes: number = MAX_PRODUCT_AUDIO_BYTES,
): ProductAudioValidationCode | null {
  if (!isAllowedProductAudioSourceType(file.name, file.type)) {
    return "invalid_file_type";
  }
  if (!isProductMp3SizeAllowed(file.size, maxBytes)) {
    return "invalid_file_size";
  }
  return null;
}

export function validateProductMp3FileClient(
  file: ProductAudioDescriptor,
): string | null {
  const code = validateProductMp3Descriptor(file);
  if (code === "invalid_file_type") return PRODUCT_AUDIO_WRONG_TYPE_MESSAGE;
  if (code === "invalid_file_size") return PRODUCT_AUDIO_TOO_LARGE_MESSAGE;
  return null;
}

export function validateProductAudioFileClient(
  file: ProductAudioDescriptor,
): string | null {
  const code = validateProductAudioSourceDescriptor(file);
  if (code === "invalid_file_type") return PRODUCT_AUDIO_WRONG_TYPE_MESSAGE;
  if (code === "invalid_file_size") return PRODUCT_AUDIO_TOO_LARGE_MESSAGE;
  return null;
}

export function buildVersionedProductAudioPath(
  practiceId: string,
  audioId: string,
  versionId: string,
): string {
  return `practices/${practiceId}/audio/${audioId}-${versionId}.mp3`;
}

export function buildVersionedProductAudioSourcePath(
  practiceId: string,
  audioId: string,
  versionId: string,
  format: Exclude<ProductAudioSourceFormat, "mp3">,
): string {
  return `practices/${practiceId}/audio-sources/${audioId}-${versionId}.${format}`;
}

export function isOwnedVersionedProductAudioPath(
  uploadPath: string,
  practiceId: string,
  audioId: string,
): boolean {
  const match = VERSIONED_PRODUCT_AUDIO_PATH.exec(uploadPath.trim());
  if (!match) return false;
  return (
    match[1].toLowerCase() === practiceId.toLowerCase() &&
    match[2].toLowerCase() === audioId.toLowerCase()
  );
}

export function isOwnedVersionedProductAudioSourcePath(
  uploadPath: string,
  practiceId: string,
  audioId: string,
): boolean {
  const match = VERSIONED_PRODUCT_AUDIO_SOURCE_PATH.exec(uploadPath.trim());
  if (!match) return false;
  return (
    match[1].toLowerCase() === practiceId.toLowerCase() &&
    match[2].toLowerCase() === audioId.toLowerCase()
  );
}

export function parseProductAudioSourcePath(uploadPath: string): {
  practiceId: string;
  audioId: string;
  versionId: string;
  format: Exclude<ProductAudioSourceFormat, "mp3">;
} | null {
  const match = VERSIONED_PRODUCT_AUDIO_SOURCE_PATH.exec(uploadPath.trim());
  if (!match) return null;
  const format = match[4].toLowerCase();
  if (format !== "m4a" && format !== "aac" && format !== "wav") return null;
  return {
    practiceId: match[1],
    audioId: match[2],
    versionId: match[3],
    format,
  };
}

export type MusicCurrentAudioPointers = {
  audioPath?: string | null | undefined;
  activeMusicDeliveryAssetId?: string | null | undefined;
  desiredMusicMasterAssetId?: string | null | undefined;
};

export function hasExistingMusicCurrentAudio(
  pointers: MusicCurrentAudioPointers,
): boolean {
  const path = typeof pointers.audioPath === "string" ? pointers.audioPath.trim() : "";
  return Boolean(
    path ||
      pointers.activeMusicDeliveryAssetId ||
      pointers.desiredMusicMasterAssetId,
  );
}

export function shouldBlockProductAudioReplacement(
  locked: boolean,
  existingAudioPath: string | null | undefined,
): boolean {
  return Boolean(locked && existingAudioPath);
}

export function shouldBlockMusicAudioReplacement(
  locked: boolean,
  pointers: MusicCurrentAudioPointers,
): boolean {
  return Boolean(locked && hasExistingMusicCurrentAudio(pointers));
}

export function canAbandonProductAudioUploadPath(input: {
  uploadPath: string;
  practiceId: string;
  audioId: string;
  liveAudioPath: string | null | undefined;
}): boolean {
  const ownedDelivery = isOwnedVersionedProductAudioPath(
    input.uploadPath,
    input.practiceId,
    input.audioId,
  );
  const ownedSource = isOwnedVersionedProductAudioSourcePath(
    input.uploadPath,
    input.practiceId,
    input.audioId,
  );
  if (!ownedDelivery && !ownedSource) return false;
  return input.uploadPath !== input.liveAudioPath;
}

/** Canonical MIME for signed Storage PUT of a known source format. */
export function canonicalProductAudioUploadMime(
  format: ProductAudioSourceFormat,
): string {
  return PRODUCT_AUDIO_SIGNED_UPLOAD_MIME_BY_FORMAT[format];
}
