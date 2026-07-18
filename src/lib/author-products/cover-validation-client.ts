import { MAX_COVER_BYTES } from "@/lib/author-products/limits";

export const MIN_COVER_DIMENSION = 400;
export { MAX_COVER_BYTES as COVER_MAX_BYTES };

const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
    const { width, height } = await readImageDimensions(file);

    if (width < MIN_COVER_DIMENSION || height < MIN_COVER_DIMENSION) {
      return `Минимальный размер обложки — ${MIN_COVER_DIMENSION} × ${MIN_COVER_DIMENSION} пикселей.`;
    }
  } catch {
    return "Не удалось прочитать изображение. Проверьте файл и попробуйте снова.";
  }

  return null;
}
