export const MUSIC_MASTERS_BUCKET = "music-masters";
export const MUSIC_STREAMS_BUCKET = "music-streams";

/**
 * Matches the established 300 MiB product/Studio source ceiling. This supports
 * an individual uncompressed music track without creating a new larger quota.
 */
export const MAX_MUSIC_MASTER_BYTES = 300 * 1024 * 1024;
export const MUSIC_MASTER_MAX_MB = MAX_MUSIC_MASTER_BYTES / (1024 * 1024);

export const MUSIC_MASTER_TOO_LARGE_MESSAGE =
  "Размер WAV-файла не должен превышать 300 МБ.";
export const MUSIC_MASTER_WRONG_TYPE_MESSAGE =
  "Загрузите мастер-файл в формате WAV.";
export const MUSIC_MASTER_SIZE_HINT = `WAV · до ${MUSIC_MASTER_MAX_MB} МБ`;

export const ALLOWED_MUSIC_MASTER_WAV_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "application/octet-stream",
] as const;

const ALLOWED_MUSIC_MASTER_WAV_MIME_SET = new Set<string>(
  ALLOWED_MUSIC_MASTER_WAV_MIME_TYPES,
);
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const VERSIONED_MUSIC_MASTER_PATH = new RegExp(
  `^practices/(${UUID_PATTERN})/audio/(${UUID_PATTERN})/masters/(${UUID_PATTERN})\\.wav$`,
  "i",
);

export type MusicMasterDescriptor = {
  name: string;
  type?: string | null;
  size: number;
};

export type MusicMasterValidationCode = "invalid_file_type" | "invalid_file_size";

export function isAllowedMusicMasterWavName(name: string): boolean {
  return name.trim().toLowerCase().endsWith(".wav");
}

export function isAllowedMusicMasterWavMime(
  mime: string | null | undefined,
): boolean {
  const normalized = (mime ?? "").trim().toLowerCase();
  return !normalized || ALLOWED_MUSIC_MASTER_WAV_MIME_SET.has(normalized);
}

export function isMusicMasterSizeAllowed(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= MAX_MUSIC_MASTER_BYTES;
}

export function validateMusicMasterDescriptor(
  file: MusicMasterDescriptor,
): MusicMasterValidationCode | null {
  if (
    !isAllowedMusicMasterWavName(file.name) ||
    !isAllowedMusicMasterWavMime(file.type)
  ) {
    return "invalid_file_type";
  }
  return isMusicMasterSizeAllowed(file.size) ? null : "invalid_file_size";
}

export function validateMusicMasterFileClient(
  file: MusicMasterDescriptor,
): string | null {
  const code = validateMusicMasterDescriptor(file);
  if (code === "invalid_file_type") return MUSIC_MASTER_WRONG_TYPE_MESSAGE;
  if (code === "invalid_file_size") return MUSIC_MASTER_TOO_LARGE_MESSAGE;
  return null;
}

export function buildMusicMasterStoragePath(
  practiceId: string,
  audioId: string,
  assetId: string,
): string {
  return `practices/${practiceId}/audio/${audioId}/masters/${assetId}.wav`;
}

export function isOwnedMusicMasterStoragePath(
  storagePath: string,
  practiceId: string,
  audioId: string,
  assetId?: string,
): boolean {
  const match = VERSIONED_MUSIC_MASTER_PATH.exec(storagePath.trim());
  if (!match) return false;
  return (
    match[1].toLowerCase() === practiceId.toLowerCase() &&
    match[2].toLowerCase() === audioId.toLowerCase() &&
    (!assetId || match[3].toLowerCase() === assetId.toLowerCase())
  );
}
