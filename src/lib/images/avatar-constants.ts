export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
export const AVATAR_OUTPUT_SIZE = 1000;
export const AVATAR_WEBP_QUALITY = 90;
export const AVATAR_JPEG_QUALITY = 0.9;
export const AVATAR_MAX_INPUT_PIXELS = 25_000_000;
export const AVATAR_SQUARE_TOLERANCE_PX = 2;

export const AVATAR_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const AVATAR_UPLOAD_HINT =
  "JPG, PNG или WebP до 3 МБ. После загрузки вы сможете выбрать нужную область изображения.";

export const AVATAR_ERROR_MESSAGES = {
  unsupportedFormat: "Выберите изображение JPG, PNG или WebP",
  fileTooLarge: "Размер изображения не должен превышать 3 МБ",
  readFailed: "Не удалось открыть изображение. Попробуйте выбрать другой файл",
  saveFailed: "Не удалось сохранить фотографию. Попробуйте ещё раз",
} as const;
