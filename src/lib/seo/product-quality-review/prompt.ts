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
    "",
    "Внутренние ключи JSON (можно читать) и русские названия (ТОЛЬКО их пиши пользователю):",
    "- title = Название",
    "- subtitle = Подназвание",
    "- description = основное описание продукта",
    "- seoTitle = заголовок для поиска",
    "- seoDescription = описание для поиска",
    "- usageItems / usage = блок «Когда слушать»",
    "- faqItems / faq = блок «Вопросы и ответы»",
    "- seoPrimaryQuery = основной поисковый запрос",
    "- seoSecondaryQueries = дополнительные поисковые запросы",
    "- whole_package = весь текст продукта",
    "В summary, message и recommendation НИКОГДА не используй внутренние имена полей",
    "(usage, FAQ, faq, seoDescription, seoTitle, description, title, subtitle, primary, secondary, whole_package).",
    "Пиши только русские названия из таблицы выше. Вместо FAQ всегда «Вопросы и ответы».",
    "",
    "Оценивай весь пакет вместе. CATEGORY FACTS — подсказки, не вердикт.",
    "НЕ используй произвольные пороги keyword density и НЕ вводи fixed occurrence quotas.",
    "НЕ решай цвет только по числу exact matches.",
    "",
    "ПРИОРИТЕТ ВЕРДИКТА:",
    "1) явный материальный переспам (overoptimization) в ЛЮБОМ важном текстовом блоке → RED",
    "2) иначе underoptimization → YELLOW",
    "3) иначе balanced → GREEN",
    "RED имеет приоритет над coverage. Нельзя ставить GREEN только потому, что остальные SEO-поля заполнены хорошо,",
    "если один большой блок сильно переспамлен.",
    "",
    "ОСНОВНОЕ ОПИСАНИЕ ПРОДУКТА — один из главных текстовых блоков страницы.",
    "Явный переспам в основном описании не может считаться GREEN, даже если заголовок для поиска,",
    "описание для поиска, блок «Когда слушать» и блок «Вопросы и ответы» выглядят хорошо.",
    "Не компенсируй переспам в основном описании тем, что другие поля хорошо сбалансированы.",
    "",
    "GREEN = SEO СБАЛАНСИРОВАНО: достаточно сигналов + естественный текст. Тема страницы понятна,",
    "основной (и при необходимости дополнительные) поисковые запросы встроены естественно,",
    "нет недостаточной оптимизации и нет stuffing. Exact primary НЕ обязан быть во всех полях.",
    "Thematic / semantic wording может поддерживать green.",
    "",
    "YELLOW = SEO СЛИШКОМ СЛАБОЕ (underoptimization): текст естественный, но поисковая тема выражена недостаточно —",
    "например основной запрос почти только в названии, заголовок/описание для поиска не отражают тему,",
    "описание продукта не поддерживает тему, дополнительные запросы выбраны но почти не используются",
    "в блоке «Когда слушать» / «Вопросы и ответы» / описании. YELLOW НЕ означает borderline overoptimization.",
    "Для YELLOW давай КОНКРЕТНЫЕ рекомендации человеческим языком. Хорошо:",
    "«Основной поисковый запрос есть только в названии. Добавьте его естественно в описание продукта или описание для поиска.»",
    "Хорошо: «Основной поисковый запрос можно естественно использовать в одном из пунктов блока «Когда слушать».»",
    "Плохо: «Добавьте ключ 3 раза», «плотность слишком низкая», «нужно 2,5%», «добавьте в usage», «не отражены в FAQ», «нужно exact phrase everywhere».",
    "",
    "RED = SEO ПЕРЕОПТИМИЗИРОВАНО: только материальная переоптимизация — неестественные точные повторы,",
    "near-synonym stuffing, перечисления ключевых вариантов, цепочки вроде",
    "«музыка для сна, музыка для крепкого сна, музыка для глубокого сна, … слушать онлайн»,",
    "блок «Вопросы и ответы» ради ключей, повтор SEO-фраз в соседних предложениях,",
    "основное описание выглядит как набор поисковых запросов, а не текст для человека.",
    "При RED сначала рекомендуй уменьшить переспам. НЕ советуй «добавьте ещё поисковый запрос», если уже есть material stuffing.",
    "Exact-match repetition alone is not enough for red without structural stuffing patterns.",
    "",
    "Не штрафуй автоматически: название = основной запрос; один естественный основной запрос в заголовке или описании для поиска;",
    "один естественный раз в описании продукта; морфологию; естественные синонимы без query-chain;",
    "пустые optional поля; обычные тематические слова; длинный текст сам по себе.",
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
    "Помни: явный переспам в основном описании продукта не может быть GREEN.",
    "В ответах пользователю только русские названия полей, без usage/FAQ/seoTitle/seoDescription/description/title.",
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
