import {
  MAX_STUDIO_ASSET_BYTES,
  STUDIO_ASSET_TOO_LARGE_MESSAGE,
  STUDIO_AUDIO_TOO_LONG_MESSAGE,
  isStudioDurationAllowed,
} from "./limits";

const MAX_LOCAL_FILE_SIZE_BYTES = MAX_STUDIO_ASSET_BYTES;
const SUPPORTED_FILE_EXTENSIONS = /\.(mp3|wav|m4a|aac)$/i;

export const STUDIO_MEDIA_OPEN_FAILED_MESSAGE =
  "Браузеру не удалось открыть выбранное аудио.";

export type StudioLocalValidationCode = "audio_too_long" | "invalid_duration";

export class StudioLocalValidationError extends Error {
  readonly code: StudioLocalValidationCode;

  constructor(code: StudioLocalValidationCode, message: string) {
    super(message);
    this.name = "StudioLocalValidationError";
    this.code = code;
  }
}

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

export function createStudioLocalDurationError(
  durationSeconds: number,
): StudioLocalValidationError | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return new StudioLocalValidationError(
      "invalid_duration",
      "Некорректная длительность файла.",
    );
  }
  if (!isStudioDurationAllowed(durationSeconds)) {
    return new StudioLocalValidationError(
      "audio_too_long",
      STUDIO_AUDIO_TOO_LONG_MESSAGE,
    );
  }
  return null;
}

export function validateStudioLocalDuration(durationSeconds: number): string | null {
  return createStudioLocalDurationError(durationSeconds)?.message ?? null;
}

export function formatStudioLocalIngestError(error: unknown): string {
  if (
    error instanceof StudioLocalValidationError &&
    error.code === "audio_too_long"
  ) {
    return STUDIO_AUDIO_TOO_LONG_MESSAGE;
  }
  return STUDIO_MEDIA_OPEN_FAILED_MESSAGE;
}

export {
  MAX_LOCAL_FILE_SIZE_BYTES,
  MAX_STUDIO_ASSET_BYTES,
  STUDIO_ASSET_TOO_LARGE_MESSAGE,
  STUDIO_AUDIO_TOO_LONG_MESSAGE,
  SUPPORTED_FILE_EXTENSIONS,
};
