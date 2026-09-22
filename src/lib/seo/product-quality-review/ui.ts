import type {
  ProductQualityReviewField,
  ProductQualityReviewStatus,
} from "@/lib/seo/product-quality-review/types";

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

export const PRODUCT_QUALITY_REVIEW_FIELD_LABELS: Record<
  ProductQualityReviewField,
  string
> = {
  title: "Название",
  subtitle: "Подназвание",
  description: "Описание продукта",
  seoTitle: "Заголовок для поиска",
  seoDescription: "Описание для поиска",
  usage: "Когда слушать",
  faq: "Вопросы и ответы",
  whole_package: "Весь текст продукта",
};

export function getProductQualityReviewFieldLabel(
  field: ProductQualityReviewField,
): string {
  return PRODUCT_QUALITY_REVIEW_FIELD_LABELS[field];
}

const INTERNAL_FIELD_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bseoSecondaryQueries\b/gi, "дополнительные поисковые запросы"],
  [/\bseoPrimaryQuery\b/gi, "основной поисковый запрос"],
  [/\bsecondary\s*queries?\b/gi, "дополнительные поисковые запросы"],
  [/\bprimary\s*quer(?:y|ies)\b/gi, "основной поисковый запрос"],
  [/\bsecondary[12]\b/gi, "дополнительный поисковый запрос"],
  [/\bwhole_package\b/gi, "весь текст продукта"],
  [/\bseoDescription\b/g, "описание для поиска"],
  [/\bseoTitle\b/g, "заголовок для поиска"],
  [/\busageItems\b/gi, "блок «Когда слушать»"],
  [/\bfaqItems\b/gi, "блок «Вопросы и ответы»"],
  [/\bпунктах списка usage\b/gi, "пунктах блока «Когда слушать»"],
  [/\bсписка usage\b/gi, "блока «Когда слушать»"],
  [/\bin usage\b/gi, "в блоке «Когда слушать»"],
  [/\bв usage\b/gi, "в блоке «Когда слушать»"],
  [/\busage\b/g, "блок «Когда слушать»"],
  [/\bFAQ\b/g, "блок «Вопросы и ответы»"],
  [/\bfaq\b/g, "блок «Вопросы и ответы»"],
  [/`description`/g, "«Описание продукта»"],
  [/`subtitle`/g, "«Подназвание»"],
  [/`title`/g, "«Название»"],
  [/\bfield\s*[:=]\s*description\b/gi, "поле «Описание продукта»"],
  [/\bfield\s*[:=]\s*subtitle\b/gi, "поле «Подназвание»"],
  [/\bfield\s*[:=]\s*title\b/gi, "поле «Название»"],
  [/\bin description\b/gi, "в описании продукта"],
  [/\bв description\b/gi, "в описании продукта"],
  [/\bdescription\b/g, "описание продукта"],
  [/\bsubtitle\b/g, "подназвание"],
  [/\btitle\b/g, "название"],
  [/\bprimary\b/gi, "основной поисковый запрос"],
  [/\bsecondary\b/gi, "дополнительный поисковый запрос"],
];

/**
 * Replace known internal field tokens in model/user-facing prose.
 * Token-aware only — not an arbitrary substring scrubber.
 */
export function humanizeProductQualityReviewText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of INTERNAL_FIELD_PHRASE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  out = out
    .replace(/блок «Когда слушать» блок «Когда слушать»/g, "блок «Когда слушать»")
    .replace(
      /блок «Вопросы и ответы» блок «Вопросы и ответы»/g,
      "блок «Вопросы и ответы»",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

