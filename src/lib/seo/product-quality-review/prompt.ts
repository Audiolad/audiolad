import type {
  ProductQualityReviewPackage,
  ProductQualityReviewSignals,
} from "@/lib/seo/product-quality-review/types";
import {
  PRODUCT_QUALITY_REVIEW_FIELDS,
  PRODUCT_QUALITY_REVIEW_ISSUES_MAX,
  PRODUCT_QUALITY_REVIEW_POSITIVE_NOTES_MAX,
  PRODUCT_QUALITY_REVIEW_SCHEMA_NAME,
} from "@/lib/seo/product-quality-review/types";

export { PRODUCT_QUALITY_REVIEW_SCHEMA_NAME };

export const PRODUCT_QUALITY_REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "issues", "positiveNotes"],
  properties: {
    status: {
      type: "string",
      enum: ["green", "yellow", "red"],
    },
    summary: { type: "string" },
    issues: {
      type: "array",
      maxItems: PRODUCT_QUALITY_REVIEW_ISSUES_MAX,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "field", "message", "recommendation"],
        properties: {
          severity: { type: "string", enum: ["warning", "critical"] },
          field: {
            type: "string",
            enum: [...PRODUCT_QUALITY_REVIEW_FIELDS],
          },
          message: { type: "string" },
          recommendation: { type: "string" },
        },
      },
    },
    positiveNotes: {
      type: "array",
      maxItems: PRODUCT_QUALITY_REVIEW_POSITIVE_NOTES_MAX,
      items: { type: "string" },
    },
  },
} as const;

export function buildProductQualityReviewSystemPrompt(): string {
  return [
    "Ты проверяешь русскоязычный текстовый пакет аудиопродукта на БАЛАНС SEO.",
    "Светофор — шкала: недостаточно SEO-сигналов → естественный баланс → переспам.",
    "Оценивай весь пакет вместе: title, subtitle, description, seoTitle, seoDescription, usage, FAQ, primary и secondary queries.",
    "Факты и польза для человека важнее ключей. Текст должен звучать для слушателя.",
    "НЕ используй произвольные пороги keyword density и НЕ вводи fixed occurrence quotas.",
    "НЕ решай цвет только по числу exact matches. CATEGORY FACTS — подсказки, не вердикт.",
    "",
    "GREEN = SEO СБАЛАНСИРОВАНО: достаточно сигналов + естественный текст. Тема страницы понятна, primary (и при необходимости secondary) встроены естественно, нет недостаточной оптимизации и нет stuffing. Exact primary НЕ обязан быть во всех полях. Thematic / semantic wording может поддерживать green.",
    "",
    "YELLOW = SEO СЛИШКОМ СЛАБОЕ (underoptimization): текст естественный, но поисковая тема выражена недостаточно — например primary почти только в title, seoTitle/seoDescription не отражают primary, description не поддерживает тему, secondary выбраны но не отражены в usage/FAQ/описании. YELLOW НЕ означает borderline overoptimization и НЕ «почти переспам».",
    "Для YELLOW давай КОНКРЕТНЫЕ рекомендации: какое поле слабое и куда естественно добавить тему. Хорошо: «Основной запрос есть только в заголовке. Добавьте его естественно в описание или SEO-описание.» Плохо: «Добавьте ключ 3 раза», «плотность слишком низкая», «нужно 2,5%». Не предлагай набивать exact phrase everywhere.",
    "",
    "RED = SEO ПЕРЕОПТИМИЗИРОВАНО: только материальная переоптимизация — неестественные точные повторы, near-synonym stuffing, перечисления ключевых вариантов, FAQ ради ключей, повтор SEO-фраз в соседних блоках, текст явно для поисковика. Exact-match repetition alone is not enough for red.",
    "",
    "Не штрафуй автоматически: название = primary; один естественный primary в SEO title или description; морфологию; естественные синонимы; пустые optional поля; обычные тематические слова (спа, массаж, отдых).",
    "Не выдумывай факты продукта. Не суди ранжирование, индексацию и обещания SEO-результатов.",
    "Верни строго JSON по схеме. Без HTML. Без numeric SEO score. Максимум 5 issues и 3 positiveNotes.",
    "Если GREEN — не выдумывай проблемы; positiveNotes optional.",
  ].join("\n");
}

export function buildProductQualityReviewUserPrompt(input: {
  package: ProductQualityReviewPackage;
  signals: ProductQualityReviewSignals;
}): string {
  const pkg = input.package;
  const signals = input.signals;
  return [
    "Проанализируй текстовый пакет продукта на баланс SEO (underoptimization / balanced / overoptimization).",
    "",
    "CATEGORY FACTS (deterministic signals, NOT the final verdict):",
    JSON.stringify(signals),
    "",
    "TEXT PACKAGE:",
    JSON.stringify({
      title: pkg.title,
      subtitle: pkg.subtitle,
      description: pkg.description,
      productKind: pkg.productKind,
      seoPrimaryQuery: pkg.seoPrimaryQuery,
      seoSecondaryQueries: pkg.seoSecondaryQueries,
      seoTitle: pkg.seoTitle,
      seoDescription: pkg.seoDescription,
      usageItems: pkg.usageItems,
      faqItems: pkg.faqItems,
    }),
    "",
    "Верни status/summary/issues/positiveNotes. Для yellow указывай конкретные полезные placements, без density/quotas.",
  ].join("\n");
}
