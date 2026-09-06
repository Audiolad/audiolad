import {
  MAX_STUDIO_ASSET_BYTES,
  STUDIO_ASSET_TOO_LARGE_MESSAGE,
  STUDIO_AUDIO_TOO_LONG_MESSAGE,
  isStudioDurationAllowed,
} from "./limits";

const MAX_LOCAL_FILE_SIZE_BYTES = MAX_STUDIO_ASSET_BYTES;
const SUPPORTED_FILE_EXTENSIONS = /\.(mp3|wav|m4a|aac)$/i;

export function validateStudioLocalFile(
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  const hasAudioMimeType = file.type.startsWith("audio/");
  const hasSupportedExtension = SUPPORTED_FILE_EXTENSIONS.test(file.name);

  if (!hasAudioMimeType && !hasSupportedExtension) {
    return "Выберите аудиофайл MP3, WAV, M4A или AAC.";
  }
  if (file.size === 0) {
    return "Выбранный файл пуст.";
  }
  if (file.size > MAX_LOCAL_FILE_SIZE_BYTES) {
    return STUDIO_ASSET_TOO_LARGE_MESSAGE;
  }
  return null;
}

export function validateStudioLocalDuration(durationSeconds: number): string | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "Некорректная длительность файла.";
  }
  if (!isStudioDurationAllowed(durationSeconds)) {
    return STUDIO_AUDIO_TOO_LONG_MESSAGE;
  }
  return null;
}

export {
  MAX_LOCAL_FILE_SIZE_BYTES,
  MAX_STUDIO_ASSET_BYTES,
  STUDIO_ASSET_TOO_LARGE_MESSAGE,
  STUDIO_AUDIO_TOO_LONG_MESSAGE,
  SUPPORTED_FILE_EXTENSIONS,
};
