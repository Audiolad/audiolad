import { MAX_COVER_BYTES } from "@/lib/author-products/limits";
import { CATALOG_GALLERY_MAX_SLIDES } from "@/lib/catalog/gallery";

export const MIN_GALLERY_DIMENSION = 400;
export const GALLERY_SQUARE_TOLERANCE_PX = 2;
export { MAX_COVER_BYTES as GALLERY_MAX_BYTES };
export { CATALOG_GALLERY_MAX_SLIDES };

const ALLOWED_GALLERY_MIME_TYPES = new Set([
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

export async function validateGallerySlideFile(
  file: File,
): Promise<string | null> {
  const fileName = file.name.trim().toLowerCase();
  const hasAllowedExtension =
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".webp");

  if (
    !ALLOWED_GALLERY_MIME_TYPES.has(file.type.trim().toLowerCase()) ||
    !hasAllowedExtension
  ) {
    return "Загрузите квадратное изображение в формате JPG, PNG или WebP.";
  }

  if (file.size > MAX_COVER_BYTES) {
    return "Размер изображения не должен превышать 3 МБ.";
  }

  try {
    const { width, height } = await readImageDimensions(file);

    if (
      width < MIN_GALLERY_DIMENSION ||
      height < MIN_GALLERY_DIMENSION
    ) {
      return `Минимальный размер слайда — ${MIN_GALLERY_DIMENSION} × ${MIN_GALLERY_DIMENSION} пикселей.`;
    }

    if (Math.abs(width - height) > GALLERY_SQUARE_TOLERANCE_PX) {
      return "Загрузите квадратное изображение 1:1.";
    }
  } catch {
    return "Не удалось прочитать изображение. Проверьте файл и попробуйте снова.";
  }

  return null;
}
