import { AUTHOR_DESCRIPTION_LABEL } from "@/lib/products/product-copy";
import { getPracticeSeoUsageHeading } from "@/lib/products/practice-seo-content";
import {
  createDefaultProductSeoStyleProfile,
  productSeoStylePromptLines,
} from "@/lib/seo/product-autofill/style-profile";
import type { ProductSeoAutofillRequest } from "@/lib/seo/product-autofill/types";

export const PRODUCT_SEO_AI_SCHEMA_NAME = "product_seo_draft";

export const PRODUCT_SEO_AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["seoTitle", "seoDescription", "usageItems", "faqItems"],
  properties: {
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
};

export function buildProductSeoGrounding(input: ProductSeoAiPromptInput): string {
  const usage = (input.request.usageItems ?? []).filter((item) => item.trim());
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
  const query = primaryQuery.trim();
  const primaryFields = [
    issues.includes("primary_missing_from_title") ? "seoTitle" : null,
    issues.includes("primary_missing_from_description") ? "seoDescription" : null,
  ].filter((field): field is "seoTitle" | "seoDescription" => Boolean(field));
  if (query && primaryFields.length > 0) {
    instructions.push(
      [
        "Исправление основного запроса обязательно:",
        `дословно включи полный основной запрос «${query}» в ${primaryFields.join(" и ")}.`,
        "Не изменяй слова запроса, их порядок или словоформу.",
        `Исправь только ${primaryFields.join(" и ")}.`,
      ].join(" "),
    );
  }

  if (issues.includes("primary_missing_from_faq")) {
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
      "Исправление FAQ обязательно: измени только faqItems.answer, который повторяет или перефразирует свой question либо сформулирован как вопрос. Ответь по существу коротким утверждением: без знака «?», без вопросительной формулировки и без начала с вопросительных конструкций («что», «как», «когда», «кому», «можно ли» и подобных). Сохрани faqItems.question и anchor дословно, а также не меняй другие поля, если для них нет отдельной указанной проблемы.",
    );
  }

  return instructions;
}

export function buildProductSeoSystemPrompt(
  input?: ProductSeoAiPromptInput,
): string {
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
    primaryQuery
      ? `seoTitle: естественный заголовок, дословно содержит полный основной запрос «${primaryQuery}» отдельной последовательностью слов один раз ближе к началу. Не изменяй слова запроса, их порядок или словоформу. Без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140. Стиль почти не влияет на заголовок.`
      : "seoTitle: естественный заголовок без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140. Не выдумывай основной запрос.",
    primaryQuery
      ? `seoDescription: 120–180 символов, максимум 300. Что это, для кого, что получает слушатель. Дословно содержит полный основной запрос «${primaryQuery}» отдельной последовательностью слов один раз естественно. Не изменяй слова запроса, их порядок или словоформу.`
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
    "Не переписывай описание продукта. Используй его только как источник фактов.",
    ...buildRepairIssueInstructions(issues, input.request.seoPrimaryQuery),
    `Проблемы: ${issues.join("; ")}`,
    `Предыдущий JSON: ${JSON.stringify(previous)}`,
    buildProductSeoGrounding(input),
  ].join("\n\n");
}
