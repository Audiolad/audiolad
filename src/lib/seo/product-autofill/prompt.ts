import {
  AUTHOR_DESCRIPTION_LABEL,
  SEO_ABOUT_LABEL,
} from "@/lib/products/product-copy";
import { getPracticeSeoUsageHeading } from "@/lib/products/practice-seo-content";
import type { EligibleSecondaryCandidate } from "@/lib/seo/product-autofill/select-secondaries";
import {
  createDefaultProductSeoStyleProfile,
  productSeoStylePromptLines,
} from "@/lib/seo/product-autofill/style-profile";
import type { ProductSeoAutofillRequest } from "@/lib/seo/product-autofill/types";
import { expectedSecondaryRange } from "@/lib/seo/product-autofill/validate";

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

export function buildProductSeoAiJsonSchema(
  input: Pick<ProductSeoAiPromptInput, "candidates"> | number,
) {
  const candidateCount =
    typeof input === "number" ? input : input.candidates.length;
  const { min, max } = expectedSecondaryRange(candidateCount);

  return {
    ...PRODUCT_SEO_AI_JSON_SCHEMA,
    properties: {
      ...PRODUCT_SEO_AI_JSON_SCHEMA.properties,
      secondaryQueries: {
        ...PRODUCT_SEO_AI_JSON_SCHEMA.properties.secondaryQueries,
        minItems: min,
        maxItems: max,
      },
    },
  };
}

export function buildProductSeoGrounding(input: ProductSeoAiPromptInput): string {
  const usage = (input.request.usageItems ?? []).filter((item) => item.trim());
  const secondaryRange = expectedSecondaryRange(input.candidates.length);
  return [
    `Название продукта: ${input.request.title.trim() || "—"}`,
    `Подзаголовок: ${input.request.subtitle.trim() || "—"}`,
    `${AUTHOR_DESCRIPTION_LABEL}: ${input.request.description.trim() || "—"}`,
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
    `Допустимое число secondaryQueries: ${secondaryRange.min}–${secondaryRange.max}.`,
    ...productSeoStylePromptLines(
      input.request.styleProfile ?? createDefaultProductSeoStyleProfile(),
    ),
  ].join("\n");
}

export function buildProductSeoSystemPrompt(
  input?: ProductSeoAiPromptInput,
): string {
  const candidateCount = input?.candidates.length ?? 0;
  const secondaryRange = expectedSecondaryRange(candidateCount);
  const styleLines = input
    ? productSeoStylePromptLines(
        input.request.styleProfile ?? createDefaultProductSeoStyleProfile(),
      )
    : [];

  return [
    "Ты помогаешь автору АудиоЛада подготовить черновик SEO для карточки продукта.",
    "Пиши естественным русским языком. Не обещай позиций, индексацию, ТОП или трафик.",
    "Не выдумывай факты, которых нет в исходном контексте: длительность, число треков, голос, конкретную музыку, автора, технику, цену, срок доступа, противопоказания, лечебный эффект.",
    "Запрещены формулировки вроде: лечит, исцеляет, устраняет бессонницу, избавляет от тревоги, гарантирует.",
    `secondaryQueries: выбери ${secondaryRange.min}–${secondaryRange.max} фраз строго из переданного списка кандидатов Яндекса. Если кандидатов нет, верни пустой массив. Не выдумывай новые фразы и не меняй частотность. Предпочитай green, yellow только если фраза очень уместна, red не выбирай, если есть другие варианты.`,
    "seoTitle: естественный заголовок, основной запрос один раз ближе к началу, без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140. Стиль почти не влияет на заголовок.",
    "seoDescription: 120–180 символов, максимум 300. Что это, для кого, что получает слушатель. Основной запрос один раз естественно.",
    "Короткое описание продукта уже будет показано выше на публичной странице. Используй его только как источник фактов. Не пересказывай и не перефразируй его. Блок “Подробнее о продукте” должен продолжать короткое описание и добавлять новую полезную информацию.",
    `seoAbout (${SEO_ABOUT_LABEL}): ориентир 500–1500 символов, 2–4 коротких абзаца, если есть новая информация. Не начинай с того же предложения, что и короткое описание. Не копируй его структуру и не повторяй те же мысли в другом порядке. Не растягивай текст ради длины. Дополнительные запросы вплетай естественно. Не выдумывай факты.`,
    "Если исходного контекста мало, напиши более короткий блок «Подробнее о продукте». Новая полезная информация важнее длины. Не повторяй, не выдумывай и не растягивай текст.",
    "usageItems: 3–5 конкретных ситуаций, которые следуют из продукта.",
    "faqItems: ровно 3 пары вопрос/ответ. Q1 naturally содержит основной запрос. Q2 и Q3 — разные намерения (когда слушать / как использовать / кому подойдёт), не варианты одного и того же вопроса. Ответы 1–3 коротких предложения. У каждого уникальный якорь-латиница.",
    "Не генерируй связанные продукты и URL.",
    "Не используй одну универсальную структуру для всех продуктов.",
    "Не начинай каждый seoAbout автоматически с «Эта медитация создана для тех, кто…», «Этот продукт создан для тех, кто…» или «Эта практика поможет вам…», если это не самый естественный вариант.",
    "Меняй первые предложения, синтаксис, длину абзацев, порядок раскрытия, переходы и конструкции FAQ.",
    "Не создавай ложное разнообразие ценой смысла.",
    ...styleLines,
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
    "Не пересказывай короткое описание. Используй его только как источник фактов и добавь новую информацию.",
    `Проблемы: ${issues.join("; ")}`,
    `Предыдущий JSON: ${JSON.stringify(previous)}`,
    buildProductSeoGrounding(input),
  ].join("\n\n");
}
