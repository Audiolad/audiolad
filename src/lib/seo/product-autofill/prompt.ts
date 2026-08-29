import { getPracticeSeoUsageHeading } from "@/lib/products/practice-seo-content";
import type { EligibleSecondaryCandidate } from "@/lib/seo/product-autofill/select-secondaries";
import type { ProductSeoAutofillRequest } from "@/lib/seo/product-autofill/types";

export const PRODUCT_SEO_AI_SCHEMA_NAME = "product_seo_draft";

export const PRODUCT_SEO_AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "secondaryQueries",
    "seoTitle",
    "seoDescription",
    "seoAbout",
    "usageItems",
    "faqItems",
  ],
  properties: {
    secondaryQueries: {
      type: "array",
      items: { type: "string" },
    },
    seoTitle: { type: "string" },
    seoDescription: { type: "string" },
    seoAbout: { type: "string" },
    usageItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content"],
        properties: {
          content: { type: "string" },
        },
      },
    },
    faqItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer", "anchor"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          anchor: { type: "string" },
        },
      },
    },
  },
} as const;

export type ProductSeoAiPromptInput = {
  request: ProductSeoAutofillRequest;
  candidates: EligibleSecondaryCandidate[];
};

export function buildProductSeoGrounding(input: ProductSeoAiPromptInput): string {
  const usage = (input.request.usageItems ?? []).filter((item) => item.trim());
  return [
    `Название продукта: ${input.request.title.trim() || "—"}`,
    `Подзаголовок: ${input.request.subtitle.trim() || "—"}`,
    `Описание: ${input.request.description.trim() || "—"}`,
    `Тип продукта: ${input.request.productKind.trim() || "practice"}`,
    `Заголовок блока использования: ${getPracticeSeoUsageHeading(input.request.productKind)}`,
    `Основной запрос: ${input.request.seoPrimaryQuery.trim()}`,
    usage.length > 0
      ? `Уже указанные ситуации использования: ${usage.join("; ")}`
      : "Уже указанные ситуации использования: нет",
    "Кандидаты дополнительных фраз из Яндекса (можно выбрать только из этого списка, частотность уже известна и её нельзя придумывать):",
    input.candidates.length > 0
      ? input.candidates
          .map(
            (item) =>
              `- ${item.phrase} | count=${item.count} | color=${item.color} | source=${item.source}`,
          )
          .join("\n")
      : "нет подходящих кандидатов — верните пустой массив secondaryQueries",
  ].join("\n");
}

export function buildProductSeoSystemPrompt(): string {
  return [
    "Ты помогаешь автору АудиоЛада подготовить черновик SEO для карточки продукта.",
    "Пиши естественным русским языком. Не обещай позиций, индексацию, ТОП или трафик.",
    "Не выдумывай факты, которых нет в исходном контексте: длительность, число треков, голос, конкретную музыку, автора, технику, цену, срок доступа, противопоказания, лечебный эффект.",
    "Запрещены формулировки вроде: лечит, исцеляет, устраняет бессонницу, избавляет от тревоги, гарантирует.",
    "secondaryQueries: выбери 3–5 фраз строго из переданного списка кандидатов Яндекса. Не выдумывай новые фразы и не меняй частотность. Предпочитай green, yellow только если фраза очень уместна, red не выбирай, если есть другие варианты.",
    "seoTitle: естественный заголовок, основной запрос один раз ближе к началу, без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140.",
    "seoDescription: 120–180 символов, максимум 300. Что это, для кого, что получает слушатель. Основной запрос один раз естественно.",
    "seoAbout: 500–1500 символов, 2–4 коротких абзаца. Не копируй обычное описание дословно. Основной запрос естественно; часть дополнительных фраз можно вплести, но не обязательно все.",
    "usageItems: 3–5 конкретных ситуаций, которые следуют из продукта.",
    "faqItems: ровно 3 пары вопрос/ответ. Q1 naturally содержит основной запрос. Q2 и Q3 — разные намерения (когда слушать / как использовать / кому подойдёт), не варианты одного и того же вопроса. Ответы 1–3 коротких предложения. У каждого уникальный якорь-латиница.",
    "Не генерируй связанные продукты и URL.",
  ].join(" ");
}

export function buildProductSeoUserPrompt(input: ProductSeoAiPromptInput): string {
  return [
    "Подготовь полный SEO-черновик продукта по этому контексту.",
    buildProductSeoGrounding(input),
  ].join("\n\n");
}

export function buildProductSeoRepairPrompt(
  input: ProductSeoAiPromptInput,
  previous: unknown,
  issues: string[],
): string {
  return [
    "Предыдущий черновик не прошёл проверку. Исправь только указанные проблемы.",
    "Нельзя придумывать дополнительные фразы вне списка кандидатов Яндекса.",
    `Проблемы: ${issues.join("; ")}`,
    `Предыдущий JSON: ${JSON.stringify(previous)}`,
    buildProductSeoGrounding(input),
  ].join("\n\n");
}
