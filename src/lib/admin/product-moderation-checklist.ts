import { PRODUCT_LANGUAGE_MODERATION } from "@/lib/author-products/language-guidelines";

export type AdminProductModerationChecklistSection = {
  id: string;
  title: string;
  checks: readonly string[];
};

/**
 * Review checklist for admin product moderation UI.
 * Language checks stay aligned with PRODUCT_LANGUAGE_MODERATION.
 */
export const ADMIN_PRODUCT_MODERATION_CHECKLIST: readonly AdminProductModerationChecklistSection[] =
  [
    {
      id: "language",
      title: PRODUCT_LANGUAGE_MODERATION.sectionTitle,
      checks: PRODUCT_LANGUAGE_MODERATION.checks,
    },
    {
      id: "cover",
      title: "Обложка",
      checks: [
        "обложка загружена и читается",
        "основные надписи на обложке выполнены кириллицей",
        "название на странице соответствует названию на обложке",
        "нет обрезки важного текста и визуального шума",
      ],
    },
    {
      id: "audio",
      title: "Аудио",
      checks: [
        "все треки прослушиваются без обрывов",
        "названия треков понятны",
        "состав и длительность соответствуют описанию",
        "нет явных технических дефектов записи",
      ],
    },
    {
      id: "format_price",
      title: "Формат, цена и состав",
      checks: [
        "вид продукта и формат соответствуют содержанию",
        "цена и признак бесплатности корректны",
        "темы выбраны и соответствуют материалу",
        "описание не содержит запрещённых или вводящих в заблуждение обещаний",
      ],
    },
    {
      id: "technical",
      title: "Техническая готовность",
      checks: [
        "нет незавершённых загрузок",
        "все обязательные поля заполнены",
        "продукт готов к публикации без скрытых черновиков",
      ],
    },
  ] as const;
