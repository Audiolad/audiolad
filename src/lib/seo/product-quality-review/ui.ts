import type { ProductQualityReviewStatus } from "@/lib/seo/product-quality-review/types";

export const PRODUCT_QUALITY_REVIEW_BLOCK_TITLE =
  "Проверка текстов для поиска";

export const PRODUCT_QUALITY_REVIEW_HELPER =
  "Проверьте весь текстовый пакет продукта на естественность, повторы и SEO-переспам.";

export const PRODUCT_QUALITY_REVIEW_CTA = "Проверить тексты";

export const PRODUCT_QUALITY_REVIEW_LOADING = "Проверяем…";

export const PRODUCT_QUALITY_REVIEW_CTA_AGAIN = "Проверить снова";

export const PRODUCT_QUALITY_REVIEW_MISSING_PRIMARY =
  "Сначала выберите основной поисковый запрос.";

export const PRODUCT_QUALITY_REVIEW_STALE_MESSAGE =
  "Тексты изменены — проверьте ещё раз.";

export const PRODUCT_QUALITY_REVIEW_FAIL_OPEN_MESSAGE =
  "Не удалось проверить тексты. Попробуйте ещё раз позже.";

export const PRODUCT_QUALITY_REVIEW_STATUS_COPY: Record<
  ProductQualityReviewStatus,
  { marker: string; title: string; subtitle: string; toneClass: string }
> = {
  green: {
    marker: "Зелёный",
    title: "Тексты выглядят естественно",
    subtitle:
      "Явного SEO-переспама не найдено. Тексты можно оставить как есть.",
    toneClass: "border-[#b7d9b2] bg-[#f3faf1] text-[#2f6b2a]",
  },
  yellow: {
    marker: "Жёлтый",
    title: "Есть риск переоптимизации",
    subtitle:
      "Текст в целом можно оставить, но некоторые повторы или формулировки стоит проверить.",
    toneClass: "border-[#ead48a] bg-[#fff8e6] text-[#7a5b12]",
  },
  red: {
    marker: "Красный",
    title: "Слишком много SEO-повторов",
    subtitle:
      "Текст выглядит переоптимизированным. Уберите лишние повторения поисковых запросов и сделайте формулировки естественнее.",
    toneClass: "border-[#e8b4b4] bg-[#fdf2f2] text-[#8b2d2d]",
  },
};
