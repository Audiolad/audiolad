import {
  validatePositionReorderBatch,
  type ReorderBatchItem,
} from "@/lib/author-products/reorder-batch";

export type AuthorGallerySlide = {
  id: string;
  publication_id: string;
  image_url: string;
  image_manifest: unknown;
  position: number;
  alt: string | null;
  created_at: string;
};

export type GalleryReorderSlideInput = ReorderBatchItem;

export function nextGalleryPosition(
  existing: ReadonlyArray<{ position: number }>,
): number {
  if (existing.length === 0) {
    return 0;
  }

  return Math.max(...existing.map((slide) => slide.position)) + 1;
}

export function validateGalleryReorderBatch(
  existingIds: readonly string[],
  slides: readonly GalleryReorderSlideInput[],
):
  | { ok: true; ordered: GalleryReorderSlideInput[] }
  | { ok: false } {
  return validatePositionReorderBatch(existingIds, slides);
}

export function buildGallerySlideReplacePatch(input: {
  imageUrl: string;
  imageManifest: unknown;
}): { image_url: string; image_manifest: unknown } {
  return {
    image_url: input.imageUrl,
    image_manifest: input.imageManifest,
  };
}

export const GALLERY_NOT_SUPPORTED_ERROR = "gallery_not_supported";

export function getAuthorGalleryErrorMessage(code: string | undefined): string {
  switch (code) {
    case "gallery_limit_exceeded":
      return "Можно добавить не больше 30 слайдов.";
    case "invalid_file_size":
      return "Размер изображения не должен превышать 3 МБ.";
    case "invalid_file_type":
      return "Загрузите квадратное изображение в формате JPG, PNG или WebP.";
    case "invalid_aspect_ratio":
      return "Загрузите квадратное изображение 1:1 не меньше 400 × 400 пикселей.";
    case "corrupt_image":
      return "Не удалось открыть изображение. Проверьте файл и попробуйте снова.";
    case "not_found":
      return "Слайд не найден.";
    case GALLERY_NOT_SUPPORTED_ERROR:
      return "Галерея продукта доступна только для практики, курса и аудиокниги.";
    default:
      return "Не удалось сохранить слайд галереи.";
  }
}
