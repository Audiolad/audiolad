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
