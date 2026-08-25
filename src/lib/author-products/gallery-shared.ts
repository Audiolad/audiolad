export type AuthorGallerySlide = {
  id: string;
  publication_id: string;
  image_url: string;
  image_manifest: unknown;
  position: number;
  alt: string | null;
  created_at: string;
};

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
      return "Не удалось открыть изображение. Попробуйте выбрать другой файл.";
    case "not_found":
      return "Слайд не найден.";
    default:
      return "Не удалось сохранить слайд галереи.";
  }
}
