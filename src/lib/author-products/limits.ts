export const MAX_COVER_BYTES = 3 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

const ALLOWED_MP3_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3"]);

export function validateMp3FileClient(file: File): string | null {
  const fileName = file.name.trim().toLowerCase();
  const mime = file.type.trim().toLowerCase();

  if (!fileName.endsWith(".mp3") || !ALLOWED_MP3_MIME_TYPES.has(mime)) {
    return "Загрузите аудиофайл в формате MP3.";
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return "Размер аудиофайла не должен превышать 50 МБ.";
  }

  return null;
}

export function getAudioUploadErrorMessage(
  code: string | undefined,
  status: number,
): string {
  switch (code) {
    case "invalid_file_type":
      return "Загрузите аудиофайл в формате MP3.";
    case "invalid_file_size":
      return "Размер аудиофайла не должен превышать 50 МБ.";
    case "invalid_audio_duration":
      return "Не удалось определить длительность аудио. Проверьте файл и попробуйте снова.";
    default:
      if (status === 413) {
        return "Размер аудиофайла не должен превышать 50 МБ.";
      }

      return "Не удалось загрузить MP3.";
  }
}

export function getAudioPreviewErrorMessage(code: string | undefined): string {
  switch (code) {
    case "not_found":
      return "Файл для прослушивания не найден.";
    case "preview_failed":
      return "Не удалось подготовить прослушивание. Попробуйте ещё раз.";
    default:
      return "Не удалось подготовить прослушивание.";
  }
}

export const PRODUCT_CONTENT_LIMITS = {
  title: 70,
  subtitle: 120,
  description: 1000,
  audioTitle: 100,
  audioDescription: 500,
} as const;

export type ProductFieldErrorCode =
  | "title_too_long"
  | "subtitle_too_long"
  | "description_too_long"
  | "audio_title_too_long"
  | "audio_description_too_long";

export function validateTitleLength(value: string): ProductFieldErrorCode | null {
  if (value.trim().length > PRODUCT_CONTENT_LIMITS.title) {
    return "title_too_long";
  }

  return null;
}

export function validateSubtitleLength(
  value: string,
): ProductFieldErrorCode | null {
  if (value.trim().length > PRODUCT_CONTENT_LIMITS.subtitle) {
    return "subtitle_too_long";
  }

  return null;
}

export function validateDescriptionLength(
  value: string,
): ProductFieldErrorCode | null {
  if (value.trim().length > PRODUCT_CONTENT_LIMITS.description) {
    return "description_too_long";
  }

  return null;
}

export function validateAudioTitleLength(
  value: string,
): ProductFieldErrorCode | null {
  if (value.trim().length > PRODUCT_CONTENT_LIMITS.audioTitle) {
    return "audio_title_too_long";
  }

  return null;
}

export function validateAudioDescriptionLength(
  value: string,
): ProductFieldErrorCode | null {
  if (value.trim().length > PRODUCT_CONTENT_LIMITS.audioDescription) {
    return "audio_description_too_long";
  }

  return null;
}

export function getProductFieldErrorMessage(code: string): string | null {
  switch (code) {
    case "title_too_long":
      return "Название не должно превышать 70 символов.";
    case "subtitle_too_long":
      return "Подзаголовок не должен превышать 120 символов.";
    case "description_too_long":
      return "Описание не должно превышать 1000 символов.";
    case "audio_title_too_long":
      return "Название аудио не должно превышать 100 символов.";
    case "audio_description_too_long":
      return "Краткое описание аудио не должно превышать 500 символов.";
    default:
      return null;
  }
}

export function getProductFieldKeyForError(
  code: ProductFieldErrorCode,
): "title" | "subtitle" | "description" | "audioTitle" | "audioDescription" {
  switch (code) {
    case "title_too_long":
      return "title";
    case "subtitle_too_long":
      return "subtitle";
    case "description_too_long":
      return "description";
    case "audio_title_too_long":
      return "audioTitle";
    case "audio_description_too_long":
      return "audioDescription";
  }
}
