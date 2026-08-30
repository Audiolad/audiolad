import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import type { PrimaryQuerySuggestInput } from "@/lib/seo/primary-query-suggestions/types";
import { PRIMARY_QUERY_AI_SUGGESTION_COUNT } from "@/lib/seo/primary-query-suggestions/types";

export const PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      minItems: PRIMARY_QUERY_AI_SUGGESTION_COUNT,
      maxItems: PRIMARY_QUERY_AI_SUGGESTION_COUNT,
      uniqueItems: true,
      items: { type: "string" },
    },
  },
} as const;

export function buildPrimaryQuerySuggestionsSystemPrompt(): string {
  return [
    "Ты подбираешь короткие поисковые фразы, которые человек сам ввёл бы в Яндекс или Google.",
    "Это не SEO-заголовки, не рекламные объявления и не названия продуктов.",
    "Пиши по-русски, примерно 2–7 слов, с конкретным поисковым намерением.",
    "Не используй символ «|», кавычки, имя автора, бренд, рекламные обещания, утверждения про частотность и слово «лучший».",
    "Не копируй художественное название механически, если оно не похоже на реальный поисковый запрос.",
    "Различай близкие намерения. Самую релевантную фразу ставь первой.",
    "Не предлагай медицинские обещания вроде «вылечить депрессию» или «лечение тревоги».",
    "Это аудиопрактика, а не медицинская услуга.",
  ].join(" ");
}

function clipLine(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function buildPrimaryQuerySuggestionsUserPrompt(
  input: PrimaryQuerySuggestInput,
): string {
  const lines: string[] = [];
  const title = clipLine(input.title, 200);
  if (title) {
    lines.push(`Название: ${title}`);
  }

  const subtitle = clipLine(input.subtitle, PRODUCT_CONTENT_LIMITS.subtitle);
  if (subtitle) {
    lines.push(`Подзаголовок: ${subtitle}`);
  }

  const description = clipLine(
    input.description,
    PRODUCT_CONTENT_LIMITS.description,
  );
  if (description) {
    lines.push(`Описание: ${description}`);
  }

  const productKind = clipLine(input.productKind, 40);
  if (productKind) {
    lines.push(`Тип продукта: ${productKind}`);
  }

  const failedSeed = clipLine(
    input.failedSeed,
    PRODUCT_CONTENT_LIMITS.seoPrimaryQuery,
  );
  if (failedSeed) {
    lines.push(
      `Фраза, по которой Яндекс Wordstat ничего не нашёл: ${failedSeed}`,
    );
  }

  lines.push("Верни ровно 3 разные короткие поисковые фразы.");
  return lines.join("\n");
}
