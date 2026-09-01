import { AUTHOR_DESCRIPTION_LABEL } from "@/lib/products/product-copy";
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
  lockedSecondaryQueries?: string[];
};

type ProductSeoAiSchemaInput = Pick<ProductSeoAiPromptInput, "candidates"> &
  Partial<Pick<ProductSeoAiPromptInput, "request" | "lockedSecondaryQueries">>;

function getLockedSecondaryQueries(input: ProductSeoAiSchemaInput): string[] {
  return input.lockedSecondaryQueries ??
    (input.request?.locked ? input.request.seoSecondaryQueries ?? [] : []);
}

export function buildProductSeoAiJsonSchema(
  input: ProductSeoAiSchemaInput | number,
) {
  const lockedSecondaryQueries =
    typeof input === "number" ? [] : getLockedSecondaryQueries(input);
  const candidateCount =
    typeof input === "number"
      ? input
      : lockedSecondaryQueries.length || input.candidates.length;
  const range = expectedSecondaryRange(candidateCount);
  const { min, max } = lockedSecondaryQueries.length
    ? { min: lockedSecondaryQueries.length, max: lockedSecondaryQueries.length }
    : range;
  const phrases =
    typeof input === "number"
      ? []
      : lockedSecondaryQueries.length
        ? lockedSecondaryQueries
        : input.candidates.map((c) => c.phrase);
  const items =
    phrases.length === 0
      ? { type: "string" as const }
      : { type: "string" as const, enum: phrases };

  return {
    ...PRODUCT_SEO_AI_JSON_SCHEMA,
    properties: {
      ...PRODUCT_SEO_AI_JSON_SCHEMA.properties,
      secondaryQueries: {
        ...PRODUCT_SEO_AI_JSON_SCHEMA.properties.secondaryQueries,
        items,
        minItems: min,
        maxItems: max,
        uniqueItems: true,
      },
    },
  };
}

export function buildProductSeoGrounding(input: ProductSeoAiPromptInput): string {
  const usage = (input.request.usageItems ?? []).filter((item) => item.trim());
  const lockedSecondaryQueries = getLockedSecondaryQueries(input);
  const secondaryRange = expectedSecondaryRange(
    lockedSecondaryQueries.length || input.candidates.length,
  );
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
    lockedSecondaryQueries.length > 0
      ? [
          "Зафиксированные автором дополнительные фразы: сохрани их все в исходном порядке. Не заменяй, не добавляй и не удаляй фразы.",
          ...lockedSecondaryQueries.map((phrase) => `- ${phrase}`),
        ].join("\n")
      : "Кандидаты дополнительных фраз из Яндекса (можно выбрать только из этого списка, частотность уже известна и её нельзя придумывать):",
    lockedSecondaryQueries.length > 0
      ? ""
      : input.candidates.length > 0
      ? input.candidates
          .map(
            (item) =>
              `- ${item.phrase} | count=${item.count} | color=${item.color} | source=${item.source}`,
          )
          .join("\n")
      : "нет подходящих кандидатов — верните пустой массив secondaryQueries",
    lockedSecondaryQueries.length > 0
      ? `secondaryQueries должен содержать ровно ${lockedSecondaryQueries.length} зафиксированных фраз.`
      : `Допустимое число secondaryQueries: ${secondaryRange.min}–${secondaryRange.max}.`,
    ...productSeoStylePromptLines(
      input.request.styleProfile ?? createDefaultProductSeoStyleProfile(),
    ),
  ].join("\n");
}

function faqItemsSystemInstruction(primaryQuery: string): string {
  const verbatimRequirement = primaryQuery
    ? `Q1.question ОБЯЗАТЕЛЬНО должен содержать основной запрос дословно: «${primaryQuery}». Не изменяй слова запроса, их порядок и словоформу. Встрой запрос в вопрос естественно.`
    : "Основной запрос не выбран: не выдумывай его и не добавляй требование включить его в FAQ.";

  return [
    "faqItems: ровно 3 пары вопрос/ответ.",
    `${verbatimRequirement} Q1.question должен быть сформулирован как вопрос и заканчиваться знаком «?».`,
    "Q2 и Q3 — другие намерения (когда слушать / как использовать / кому подойдёт), не варианты одного и того же вопроса. Ответы 1–3 коротких предложения, отвечают по существу и являются утверждениями: не повторяют или не перефразируют question, не содержат знак «?» и не начинаются с вопросительных формулировок. Основной запрос в answer не обязателен. У каждого уникальный якорь-латиница.",
  ].join(" ");
}

export function buildRepairIssueInstructions(
  issues: string[],
  primaryQuery: string,
): string[] {
  const instructions: string[] = [];
  if (issues.includes("primary_missing_from_faq")) {
    const query = primaryQuery.trim();
    if (query) {
      instructions.push(
        [
          "Исправление FAQ обязательно:",
          `один faqItems.question, предпочтительно Q1, должен дословно содержать основной запрос: «${query}».`,
          "Измени только необходимый вопрос FAQ.",
          "Не переноси запрос только в answer.",
        ].join(" "),
      );
    }
  }

  if (
    issues.includes("faq_answer_repeats_question") ||
    issues.includes("faq_answer_is_question")
  ) {
    instructions.push(
      "Исправление FAQ обязательно: измени только faqItems.answer, который повторяет или перефразирует свой question либо сформулирован как вопрос. Ответь по существу утверждением; не меняй question, anchor и другие поля.",
    );
  }

  return instructions;
}

export function buildProductSeoSystemPrompt(
  input?: ProductSeoAiPromptInput,
): string {
  const candidateCount = input?.candidates.length ?? 0;
  const lockedSecondaryQueries = input ? getLockedSecondaryQueries(input) : [];
  const secondaryRange = expectedSecondaryRange(
    lockedSecondaryQueries.length || candidateCount,
  );
  const primaryQuery = input?.request.seoPrimaryQuery.trim() ?? "";
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
    lockedSecondaryQueries.length > 0
      ? `secondaryQueries: верни ровно зафиксированные автором ${lockedSecondaryQueries.length} фразы в том же порядке. Не заменяй, не добавляй и не удаляй их.`
      : `secondaryQueries: выбери ${secondaryRange.min}–${secondaryRange.max} фраз строго из переданного списка кандидатов Яндекса. Если кандидатов нет, верни пустой массив. Не выдумывай новые фразы и не меняй частотность. Предпочитай green, yellow только если фраза очень уместна, red не выбирай, если есть другие варианты.`,
    primaryQuery
      ? "seoTitle: естественный заголовок, основной запрос один раз ближе к началу, без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140. Стиль почти не влияет на заголовок."
      : "seoTitle: естественный заголовок без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140. Не выдумывай основной запрос.",
    primaryQuery
      ? "seoDescription: 120–180 символов, максимум 300. Что это, для кого, что получает слушатель. Основной запрос один раз естественно."
      : "seoDescription: 120–180 символов, максимум 300. Что это, для кого, что получает слушатель. Не выдумывай основной запрос.",
    `Поле description («${AUTHOR_DESCRIPTION_LABEL}») уже задано автором и будет показано на публичной странице. Используй его только как источник фактов. Не переписывай, не пересказывай и не заменяй его. Не генерируй отдельный текст «о продукте» и не возвращай поле seoAbout.`,
    "usageItems: ровно 3 конкретные ситуации, которые следуют из продукта.",
    faqItemsSystemInstruction(primaryQuery),
    "Не генерируй связанные продукты и URL.",
    "Не используй одну универсальную структуру для всех продуктов.",
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
    getLockedSecondaryQueries(input).length
      ? "Зафиксированные автором дополнительные фразы нельзя заменять, удалять или менять местами."
      : "Нельзя придумывать дополнительные фразы вне списка кандидатов Яндекса.",
    "Не переписывай описание продукта. Используй его только как источник фактов.",
    ...buildRepairIssueInstructions(issues, input.request.seoPrimaryQuery),
    `Проблемы: ${issues.join("; ")}`,
    `Предыдущий JSON: ${JSON.stringify(previous)}`,
    buildProductSeoGrounding(input),
  ].join("\n\n");
}
