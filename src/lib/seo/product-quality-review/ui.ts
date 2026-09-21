import type { ProductQualityReviewStatus } from "@/lib/seo/product-quality-review/types";

export const PRODUCT_QUALITY_REVIEW_BLOCK_TITLE =
  "Финальная проверка SEO";

export const PRODUCT_QUALITY_REVIEW_HELPER =
  "Проверьте оформление продукта перед сохранением. Система покажет, достаточно ли поисковых запросов и нет ли переспама.";

export const PRODUCT_QUALITY_REVIEW_HELPER_WHY =
  "Это важно, чтобы Яндексу было проще правильно определить тему страницы и чтобы переоптимизация не ухудшала её видимость в поиске.";

export const PRODUCT_QUALITY_REVIEW_CTA = "Проверить SEO";

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
    title: "SEO в норме",
    subtitle:
      "Поисковые запросы используются естественно. Текст хорошо передаёт тему продукта без лишних повторов.",
    toneClass: "border-[#b7d9b2] bg-[#f3faf1] text-[#2f6b2a]",
  },
  yellow: {
    marker: "Жёлтый",
    title: "SEO слишком слабое",
    subtitle:
      "Поисковая тема выражена недостаточно. Добавьте основной или дополнительный запрос в подходящие места текста естественным языком.",
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
