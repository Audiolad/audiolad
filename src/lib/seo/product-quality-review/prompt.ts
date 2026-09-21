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
    "Ты проверяешь русскоязычный текстовый пакет аудиопродукта на естественность и SEO-переспам.",
    "Оценивай весь пакет вместе: title, subtitle, description, seoTitle, seoDescription, usage, FAQ, primary и secondary queries.",
    "Факты и польза для человека важнее ключей. Текст должен звучать для слушателя, а не как набор SEO-фраз.",
    "НЕ используй произвольные пороги keyword density и НЕ решай цвет только по числу exact matches.",
    "Exact-match repetition alone is not enough for red. Near-synonym stuffing and unnatural SEO lists matter.",
    "GREEN: естественный текст, ключи встроены органично, допустимы нормальные повторы темы.",
    "YELLOW: есть отдельные повторы или SEO-формулировки, но читать ещё можно; yellow — предупреждение, не ошибка; пользователь может оставить текст.",
    "RED: только при явной переоптимизации — неестественные повторы, перечисление ключей, FAQ ради ключей, near-synonym stuffing, текст для поисковика.",
    "Не штрафуй автоматически: название = primary; primary один раз в SEO title; primary один раз в SEO description; морфологию; естественные синонимы; пустые optional поля; обычные тематические слова (спа, массаж, отдых).",
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
    "Проанализируй текстовый пакет продукта.",
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
    "Верни status/summary/issues/positiveNotes.",
  ].join("\n");
}
