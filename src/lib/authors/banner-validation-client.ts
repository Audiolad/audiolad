export const AUTHOR_BANNER_IMAGE_CONFIG = {
  type: "author-banner" as const,
  recommendedAspectRatio: 3 / 1,
  minWidth: 1200,
  minHeight: 400,
  maxFileSize: 3 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
};

export const AUTHOR_BANNER_UPLOAD_HINT =
  "Широкое изображение, рекомендуемое соотношение около 3:1. JPG, PNG или WebP до 3 МБ. Минимальный размер — 1200 × 400 пикселей.";

export const AUTHOR_BANNER_ERROR_MESSAGES = {
  unsupportedFormat: "Загрузите баннер в формате JPG, PNG или WebP.",
  fileTooLarge: "Размер баннера не должен превышать 3 МБ.",
  tooSmall: "Минимальный размер баннера — 1200 × 400 пикселей.",
  readFailed:
    "Не удалось прочитать изображение. Проверьте файл и попробуйте снова.",
  saveFailed: "Не удалось сохранить баннер. Попробуйте ещё раз.",
} as const;

const ALLOWED_MIME_TYPES = new Set<string>(
  AUTHOR_BANNER_IMAGE_CONFIG.allowedMimeTypes,
);

function hasAllowedExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();

  return (
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".png") ||
    normalized.endsWith(".webp")
  );
}

export function validateAuthorBannerDimensions(
  width: number,
  height: number,
): string | null {
  if (
    width < AUTHOR_BANNER_IMAGE_CONFIG.minWidth ||
    height < AUTHOR_BANNER_IMAGE_CONFIG.minHeight
  ) {
    return AUTHOR_BANNER_ERROR_MESSAGES.tooSmall;
  }

  return null;
}

export function validateAuthorBannerFileMeta(
  file: Pick<File, "name" | "type" | "size">,
): string | null {
  const mime = file.type.trim().toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mime) || !hasAllowedExtension(file.name)) {
    return AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat;
  }

  if (file.size <= 0 || file.size > AUTHOR_BANNER_IMAGE_CONFIG.maxFileSize) {
    return AUTHOR_BANNER_ERROR_MESSAGES.fileTooLarge;
  }

  return null;
}

function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image_decode_failed"));
    };

    image.src = objectUrl;
  });
}

export async function validateAuthorBannerFile(
  file: File,
): Promise<string | null> {
  const metaError = validateAuthorBannerFileMeta(file);

  if (metaError) {
    return metaError;
  }

  try {
    const { width, height } = await readImageDimensions(file);
    return validateAuthorBannerDimensions(width, height);
  } catch {
    return AUTHOR_BANNER_ERROR_MESSAGES.readFailed;
  }
}
