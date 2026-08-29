import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  AUDIO_POST_KIND_LABEL,
  MUSIC_KIND_LABEL,
  PRACTICE_KIND_LABEL,
} from "@/lib/author-products/product-kind";
import {
  evaluateProductSeoReadiness,
  type ProductSeoReadiness,
} from "@/lib/seo/product-metadata";
import { clipSeoQuery } from "@/lib/seo/wordstat/ui";
import type { PracticeSeoContentInput } from "@/lib/products/practice-seo-content";
import type {
  ProductSeoAccordionBadgeKind,
  ProductSeoSecondaryQueryStatus,
} from "@/lib/seo/product-autofill/types";

export const PRODUCT_SEO_ACCORDION_TITLE = "SEO и продвижение";

export const PRODUCT_SEO_SELLING_COPY =
  "Хотите, чтобы вашу практику или продукт находили в Яндексе и Google? Заполните этот раздел. АудиоЛад поможет подобрать поисковые запросы и подготовить SEO-тексты.";

export const PRODUCT_SEO_CLOSED_TEASER = "Мы можем подготовить SEO за вас.";

export const PRODUCT_SEO_START_HEADING = "Начните с поискового запроса";

export const PRODUCT_SEO_START_TEXT =
  "Выберите фразу, по которой люди могут искать такой продукт. Мы покажем реальные данные Яндекса и поможем подобрать подходящий вариант.";

export const PRODUCT_SEO_PICK_PRIMARY_CTA = "Подобрать основной запрос";

export const PRODUCT_SEO_AFTER_PRIMARY_COPY =
  "Основной запрос выбран. Теперь АудиоЛад может подготовить остальное SEO за вас.";

export const PRODUCT_SEO_GENERATE_CTA = "✨ Сгенерировать SEO для продукта";

export const PRODUCT_SEO_GENERATE_LOADING = "Готовим SEO…";

export const PRODUCT_SEO_GENERATE_STAGE_QUERIES = "Подбираем запросы…";

export const PRODUCT_SEO_GENERATE_STAGE_TEXT = "Готовим текст…";

export const PRODUCT_SEO_READINESS_HINT =
  "Чем полнее заполнен раздел, тем понятнее поисковым системам тема вашего продукта.";

export const PRODUCT_SEO_OVERWRITE_CONFIRM =
  "Часть SEO уже заполнена. Заменить её новым вариантом?";

export const PRODUCT_SEO_OVERWRITE_REPLACE = "Заменить";

export const PRODUCT_SEO_OVERWRITE_CANCEL = "Отмена";

export const PRODUCT_SEO_ADD_OWN_FAQ = "+ Добавить свой вопрос";

export const PRODUCT_SEO_STYLE_LABEL = "Стиль текста";

export const PRODUCT_SEO_STYLE_ADVANCED_CTA = "Настроить стиль";

export const PRODUCT_SEO_STYLE_VARIETY_LABEL = "Разнообразие текстов";

export const PRODUCT_SEO_SECONDARY_LIMITED_COPY =
  "Яндекс нашёл мало подходящих дополнительных фраз. Вы можете добавить другие вручную.";

export const PRODUCT_SEO_SECONDARY_NONE_COPY =
  "Дополнительные поисковые фразы не удалось подобрать. Вы можете добавить их вручную.";

export const PRODUCT_SEO_STYLE_SLIDER_LABELS = {
  warmth: {
    name: "Теплота",
    low: "Сдержанно",
    high: "Тепло и по-человечески",
  },
  expertise: {
    name: "Экспертность",
    low: "Просто",
    high: "Подробно и экспертно",
  },
  conversational: {
    name: "Разговорность",
    low: "Деловой текст",
    high: "Живая речь",
  },
  expressiveness: {
    name: "Выразительность",
    low: "Нейтрально",
    high: "Образно и эмоционально",
  },
} as const;

export const PRODUCT_SEO_ACCORDION_BADGE_COPY: Record<
  ProductSeoAccordionBadgeKind,
  string
> = {
  recommend: "Рекомендуем заполнить для продвижения",
  partial: "SEO заполнено частично",
  ready: "SEO готово к продвижению",
};

const MAIN_READINESS_IDS = new Set([
  "primary_query",
  "query_in_title",
  "query_in_description",
  "about",
  "usage",
  "faq",
]);

export function resolveProductSeoAccordionBadge(
  readiness: ProductSeoReadiness,
  seoFields: {
    seoPrimaryQuery?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    seoAbout?: string | null;
  } = {},
): ProductSeoAccordionBadgeKind {
  const mainDone = readiness.checks.filter(
    (check) => MAIN_READINESS_IDS.has(check.id) && check.done,
  ).length;
  const hasExplicitSeo =
    Boolean(seoFields.seoPrimaryQuery?.trim()) ||
    Boolean(seoFields.seoTitle?.trim()) ||
    Boolean(seoFields.seoDescription?.trim()) ||
    Boolean(seoFields.seoAbout?.trim());

  if (mainDone >= MAIN_READINESS_IDS.size) {
    return "ready";
  }

  if (!hasExplicitSeo && mainDone === 0) {
    return "recommend";
  }

  if (!hasExplicitSeo && mainDone <= 1) {
    return "recommend";
  }

  return "partial";
}

export function resolveProductSeoAccordionBadgeFromInput(input: {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  productKind?: string | null;
  seoPrimaryQuery?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoAbout?: string | null;
  seoUsageItems?: string[] | null;
  seoFaqCount?: number;
  seoRelatedCount?: number;
}): ProductSeoAccordionBadgeKind {
  return resolveProductSeoAccordionBadge(evaluateProductSeoReadiness(input), {
    seoPrimaryQuery: input.seoPrimaryQuery,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    seoAbout: input.seoAbout,
  });
}

export function hasFilledGeneratedSeoFields(input: {
  seoSecondaryQueries: string[];
  seoTitle: string;
  seoDescription: string;
  seoAbout: string;
  seoContent: PracticeSeoContentInput;
}): boolean {
  if (input.seoSecondaryQueries.some((item) => item.trim())) {
    return true;
  }

  if (
    input.seoTitle.trim() ||
    input.seoDescription.trim() ||
    input.seoAbout.trim()
  ) {
    return true;
  }

  if (input.seoContent.usageItems.some((item) => item.content.trim())) {
    return true;
  }

  return input.seoContent.faqItems.some(
    (item) => item.question.trim() || item.answer.trim(),
  );
}

function uniquePhrases(values: string[]): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];

  for (const value of values) {
    const clipped = clipSeoQuery(value, PRODUCT_CONTENT_LIMITS.seoPrimaryQuery);
    if (clipped.length < 3) {
      continue;
    }

    const key = clipped.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    phrases.push(clipped);
  }

  return phrases;
}

function productKindSeed(productKind: string): string {
  if (productKind === "music") {
    return MUSIC_KIND_LABEL;
  }

  if (productKind === "audio_post") {
    return AUDIO_POST_KIND_LABEL;
  }

  return PRACTICE_KIND_LABEL;
}

function descriptionSeeds(description: string): string[] {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.replace(/[.!?…]+$/g, "").trim())
    .filter((sentence) => sentence.length >= 8 && sentence.length <= 80);
}

export function suggestPrimaryQuerySeeds(input: {
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
}): string[] {
  const kind = productKindSeed(input.productKind);
  const title = input.title.trim();
  const combined =
    title && kind && !title.toLocaleLowerCase("ru-RU").includes(kind.toLocaleLowerCase("ru-RU"))
      ? `${title} ${kind.toLocaleLowerCase("ru-RU")}`
      : "";

  return uniquePhrases([
    title,
    input.subtitle,
    ...descriptionSeeds(input.description),
    combined,
    kind,
  ]).slice(0, 5);
}

export function productSeoPrimarySelectedLabel(primaryQuery: string): string {
  return `Основной запрос: «${primaryQuery.trim()}»`;
}

export function productSeoSecondaryStatusCopy(
  status: ProductSeoSecondaryQueryStatus | null,
): string | null {
  if (status === "limited") {
    return PRODUCT_SEO_SECONDARY_LIMITED_COPY;
  }

  if (status === "none") {
    return PRODUCT_SEO_SECONDARY_NONE_COPY;
  }

  return null;
}
