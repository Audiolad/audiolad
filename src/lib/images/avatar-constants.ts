export const AVATAR_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** @deprecated Use AVATAR_MAX_SOURCE_BYTES. Kept as an alias for persist callers. */
export const AVATAR_MAX_BYTES = AVATAR_MAX_SOURCE_BYTES;
export const AVATAR_OUTPUT_SIZE = 1000;
export const AVATAR_WEBP_QUALITY = 90;
export const AVATAR_JPEG_QUALITY = 0.9;
/**
 * Decompression-bomb cap. Not raised automatically for 108MP/200MP phones.
 * 48MP (e.g. 8000×6000) passes. 108MP (≈12000×9000 = 108e6) and 200MP
 * (side typically > 12000) reject with resolutionTooLarge.
 */
export const AVATAR_MAX_INPUT_PIXELS = 64_000_000;
export const AVATAR_MAX_SOURCE_DIMENSION = 12_000;
export const AVATAR_SQUARE_TOLERANCE_PX = 2;
export const AVATAR_HEIC_CONVERT_TIMEOUT_MS = 15_000;
export const AVATAR_PREVIEW_MAX_EDGE = 4096;

export const AVATAR_SOURCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export const AVATAR_INPUT_ACCEPT =
  "image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif";

export const AVATAR_UPLOAD_HINT =
  "Выберите фотографию. После загрузки вы сможете выбрать нужную область изображения.";

export const AVATAR_ERROR_MESSAGES = {
  fileTooLarge: "Фото слишком большое. Выберите изображение размером до 20 МБ.",
  notImage: "Не удалось распознать файл как изображение. Выберите другую фотографию.",
  processFailed:
    "Не удалось обработать фотографию. Попробуйте выбрать другое изображение.",
  resolutionTooLarge:
    "Фото слишком большого разрешения. Выберите другое изображение.",
  choosePhoto: "Выберите фотографию из галереи",
  readFailed:
    "Не удалось обработать фотографию. Попробуйте выбрать другое изображение.",
  saveFailed: "Не удалось сохранить фотографию. Попробуйте ещё раз",
  saveIncomplete:
    "Фотография загружена, но не удалось получить ссылку. Обновите страницу или попробуйте ещё раз.",
} as const;
