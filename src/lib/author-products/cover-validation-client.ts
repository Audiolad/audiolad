import { MAX_COVER_BYTES } from "@/lib/author-products/limits";
import { isNearlySquare } from "@/lib/images/avatar-crop-math";

export const MIN_COVER_DIMENSION = 400;
export const COVER_SQUARE_TOLERANCE_PX = 2;
/** Largest square written by the cropper. Matches the xl cover variant. */
export const COVER_CROP_MAX_OUTPUT = 1200;
export const COVER_NOT_SQUARE_MESSAGE =
  "Загрузите квадратную обложку (соотношение сторон 1:1)";
export { MAX_COVER_BYTES as COVER_MAX_BYTES };

const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isCoverSquare(width: number, height: number): boolean {
  return isNearlySquare(width, height, COVER_SQUARE_TOLERANCE_PX);
}

export type CoverUploadDecision =
  | { action: "upload" }
  | { action: "crop" }
  | { action: "reject"; message: string };

/**
 * Square files upload as-is. Other files open the 1:1 cropper when the
 * browser can crop; otherwise they are rejected with COVER_NOT_SQUARE_MESSAGE.
 */
export function decideCoverUploadAction(
  width: number,
  height: number,
  cropAvailable: boolean,
): CoverUploadDecision {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < MIN_COVER_DIMENSION ||
    height < MIN_COVER_DIMENSION
  ) {
    return {
      action: "reject",
      message: `Минимальный размер обложки – ${MIN_COVER_DIMENSION} × ${MIN_COVER_DIMENSION} пикселей.`,
    };
  }

  if (isCoverSquare(width, height)) {
    return { action: "upload" };
  }

  if (!cropAvailable) {
    return { action: "reject", message: COVER_NOT_SQUARE_MESSAGE };
  }

  return { action: "crop" };
}

export function canUseInteractiveCoverCrop(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");

    if (typeof canvas.toBlob !== "function") {
      return false;
    }

    return Boolean(canvas.getContext("2d"));
  } catch {
    return false;
  }
}

export function readCoverImageDimensions(
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

export async function validateCoverFile(file: File): Promise<string | null> {
  const fileName = file.name.trim().toLowerCase();
  const hasAllowedExtension =
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".webp");

  if (
    !ALLOWED_COVER_MIME_TYPES.has(file.type.trim().toLowerCase()) ||
    !hasAllowedExtension
  ) {
    return "Загрузите обложку в формате JPG, PNG или WebP.";
  }

  if (file.size > MAX_COVER_BYTES) {
    return "Размер обложки не должен превышать 3 МБ.";
  }

  try {
    const { width, height } = await readCoverImageDimensions(file);

    if (width < MIN_COVER_DIMENSION || height < MIN_COVER_DIMENSION) {
      return `Минимальный размер обложки – ${MIN_COVER_DIMENSION} × ${MIN_COVER_DIMENSION} пикселей.`;
    }
  } catch {
    return "Не удалось прочитать изображение. Проверьте файл и попробуйте снова.";
  }

  return null;
}
