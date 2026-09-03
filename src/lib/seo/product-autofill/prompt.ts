import { AUTHOR_DESCRIPTION_LABEL } from "@/lib/products/product-copy";
import { getPracticeSeoUsageHeading } from "@/lib/products/practice-seo-content";
import {
  createDefaultProductSeoStyleProfile,
  productSeoStylePromptLines,
} from "@/lib/seo/product-autofill/style-profile";
import type { ProductSeoAutofillRequest } from "@/lib/seo/product-autofill/types";
import {
  containsSeoPhrase,
  normalizeSeoPhrase,
} from "@/lib/seo/product-metadata";

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
  const secondaryQueries = (input.request.seoSecondaryQueries ?? []).filter(
    (item) => item.trim(),
  );
  return [
    `Название продукта: ${input.request.title.trim() || "—"}`,
    `Подзаголовок: ${input.request.subtitle.trim() || "—"}`,
    `${AUTHOR_DESCRIPTION_LABEL}: ${input.request.description.trim() || "—"}`,
    `Тип продукта: ${input.request.productKind.trim() || "practice"}`,
    `Заголовок блока использования: ${getPracticeSeoUsageHeading(input.request.productKind)}`,
    `Основной запрос: ${input.request.seoPrimaryQuery.trim()}`,
    secondaryQueries.length > 0
      ? `Дополнительные запросы автора: ${secondaryQueries.join("; ")}`
      : "Дополнительные запросы автора: нет",
    usage.length > 0
      ? `Уже указанные ситуации использования: ${usage.join("; ")}`
      : "Уже указанные ситуации использования: нет",
    ...productSeoStylePromptLines(
      input.request.styleProfile ?? createDefaultProductSeoStyleProfile(),
    ),
  ].join("\n");
}

function primaryKeywordBudgetInstruction(
  primaryQuery: string,
  productTitle: string,
): string {
  if (!primaryQuery) {
    return "";
  }

  const titleEqualsPrimary =
    Boolean(productTitle) &&
    normalizeSeoPhrase(productTitle) === normalizeSeoPhrase(primaryQuery);
  const titleEqualsPrimaryNote = titleEqualsPrimary
    ? "Название продукта совпадает с основным запросом: в остальных местах используй естественные отсылки (эта практика, аудиопрактика, материал, она/её) и не повторяй название механически."
    : "";

  return [
    `Точный основной запрос «${primaryQuery}» в черновике обычно должен встретиться только в трёх обязательных местах: ровно один раз в seoTitle, ровно один раз в seoDescription и ровно один раз в одном вопросе FAQ, обычно Q1.`,
    "Не повторяй точный основной запрос специально в usageItems, ответах FAQ, Q2 и Q3.",
    titleEqualsPrimaryNote,
  ]
    .filter(Boolean)
    .join(" ");
}

function secondaryContainsExactPrimary(
  secondary: string,
  primaryQuery: string,
): boolean {
  const primary = normalizeSeoPhrase(primaryQuery);
  const phrase = normalizeSeoPhrase(secondary);
  return Boolean(primary) && phrase !== primary && containsSeoPhrase(secondary, primaryQuery);
}

function secondaryQuerySystemInstruction(
  secondaryQueries: readonly string[],
  primaryQuery: string,
): string {
  const owned = [
    "Дополнительные поисковые фразы принадлежат автору и заданы вручную.",
    "Это SEO-ориентиры, а не факты о продукте: не используй их как источник фактов и не делай из них утверждения о продукте.",
    "Сохранённые значения дополнительных запросов никогда не редактируй, не удаляй, не переставляй и не возвращай изменённым списком или отдельным полем.",
  ].join(" ");

  const count = secondaryQueries.filter((item) => item.trim()).length;
  if (count === 0) {
    return owned;
  }

  const storageVsProse = [
    "Это правило относится только к сохранённым значениям запросов, а не к прозе черновика.",
    "В сгенерированной прозе можно грамматически склонять или естественно перефразировать смысловое направление.",
  ].join(" ");

  const coverage =
    count === 1
      ? "Используй это направление естественно один раз."
      : count === 2
        ? "Используй оба направления естественно, каждое не больше одного раза."
        : "Используй 2–3 РАЗНЫХ дополнительных направления естественно. Приоритет выбора: (1) смысловая релевантность (2) естественный русский (3) порядок автора как разрешающий критерий.";

  const overlapping = secondaryQueries.filter((item) =>
    secondaryContainsExactPrimary(item, primaryQuery),
  );
  const overlapRule = overlapping.length
    ? [
        `Дополнительный запрос «${overlapping.join("»; «")}» содержит точный основной запрос непрерывной фразой.`,
        "Не используй такой дополнительный запрос дословно вне трёх обязательных мест основного запроса: seoTitle, seoDescription и один вопрос FAQ, обычно Q1.",
        "Предпочитай другие релевантные дополнительные направления, которые не повторяют точный основной запрос.",
        "Если это смысловое направление полезно или это единственный дополнительный запрос, склони или естественно перефразируй его так, чтобы точная фраза основного запроса не повторилась.",
        "Пример: не «Для настройки на канал денежная энергия...», а «Для работы с темой денежного канала...».",
        "Бюджет точного основного запроса важнее дословной формулировки дополнительного запроса.",
        "Никакой дополнительный запрос не должен создавать ещё одно точное вхождение основного запроса вне seoTitle, seoDescription и Q1.",
      ].join(" ")
    : "";

  return [
    owned,
    storageVsProse,
    coverage,
    "Максимум 3 использования дополнительных запросов во всём черновике. Каждую выбранную фразу — не больше одного раза.",
    "Предпочтительные места: usageItems, Q2/Q3 и ответы FAQ, когда это звучит естественно.",
    "Не набивай дополнительные запросы в seoTitle и seoDescription: там уже есть основной запрос.",
    "Дополнительные запросы — SEO-направления, а не факты. Не выводи из них утверждения, которых нет в описании продукта.",
    overlapRule,
  ]
    .filter(Boolean)
    .join(" ");
}

function faqItemsSystemInstruction(primaryQuery: string): string {
  const verbatimRequirement = primaryQuery
    ? `Q1.question ОБЯЗАТЕЛЬНО должен содержать основной запрос дословно: «${primaryQuery}». Не изменяй слова запроса, их порядок и словоформу. Встрой запрос в вопрос естественно. Не повторяй точный основной запрос в Q2, Q3 и в ответах FAQ.`
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
  ].filter((field): field is "seoTitle" => Boolean(field));
  if (query && primaryFields.length > 0) {
    instructions.push(
      [
        "Исправление основного запроса обязательно:",
        `дословно включи полный основной запрос «${query}» в ${primaryFields.join(" и ")}.`,
        "Не изменяй слова запроса, их порядок или словоформу.",
        `Измени ${primaryFields.join(" и ")} для этой проблемы; также исправь другие поля, если для них перечислены отдельные проблемы.`,
      ].join(" "),
    );
  }

  if (
    issues.includes("description_too_long") ||
    issues.includes("primary_missing_from_description")
  ) {
    const descriptionRepair = [
      "Исправление seoDescription обязательно:",
      "измени seoDescription так, чтобы его длина была 120–180 символов и не превышала 300 символов.",
    ];
    if (query && issues.includes("primary_missing_from_description")) {
      descriptionRepair.push(
        `Включи полный основной запрос «${query}» дословно ровно один раз естественно в первое предложение seoDescription; он не обязан стоять с позиции 0.`,
        "Не изменяй слова запроса, их порядок или словоформу.",
        "Не оборачивай поисковый запрос в кавычки только ради SEO и не создавай искусственную конструкцию «ключ – это...», если она не звучит естественно.",
      );
    } else if (query) {
      descriptionRepair.push(
        `Сохрани уже имеющееся дословное вхождение основного запроса «${query}» ровно один раз.`,
        "Не переставляй его в начало и не собирай фразу заново вокруг запроса только ради длины.",
      );
    }
    descriptionRepair.push(
      "Также исправь другие поля, если для них перечислены отдельные проблемы.",
    );
    instructions.push(descriptionRepair.join(" "));
  }

  if (issues.includes("primary_missing_from_faq")) {
    if (query) {
      instructions.push(
        [
          "Исправление FAQ обязательно:",
          `один faqItems.question, предпочтительно Q1, должен дословно содержать основной запрос: «${query}».`,
          "Измени необходимый вопрос FAQ для этой проблемы и сохрани его anchor дословно.",
          "Также исправь другие поля, если для них перечислены отдельные проблемы.",
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
      "Исправление FAQ обязательно: для каждого ответа, который повторяет или перефразирует свой question либо сформулирован как вопрос, измени только его faqItems.answer. Ответь по существу коротким утверждением: без знака «?», без вопросительной формулировки и без начала с вопросительных конструкций («что», «как», «когда», «кому», «можно ли» и подобных). Сохрани faqItems.question и anchor таких пунктов дословно. Исправь другие поля только при наличии отдельной перечисленной проблемы; не меняй ответы FAQ без этой проблемы.",
    );
  }

  return instructions;
}

export function buildProductSeoSystemPrompt(
  input?: ProductSeoAiPromptInput,
): string {
  const primaryQuery = input?.request.seoPrimaryQuery.trim() ?? "";
  const productTitle = input?.request.title.trim() ?? "";
  const secondaryQueries = (input?.request.seoSecondaryQueries ?? []).filter(
    (item) => item.trim(),
  );
  const styleLines = input
    ? productSeoStylePromptLines(
        input.request.styleProfile ?? createDefaultProductSeoStyleProfile(),
      )
    : [];
  const primaryBudget = primaryKeywordBudgetInstruction(
    primaryQuery,
    productTitle,
  );

  return [
    "Ты помогаешь автору АудиоЛада подготовить черновик SEO для карточки продукта.",
    "Пиши естественным русским языком. Не обещай позиций, индексацию, ТОП или трафик.",
    "Для тире используй короткое тире «–», а парные кавычки вокруг русских названий оформляй как «ёлочки». Не заменяй символы внутри дословно заданного основного запроса.",
    "Не выдумывай факты, которых нет в исходном контексте: длительность, число треков, голос, конкретную музыку, автора, технику, цену, срок доступа, противопоказания, лечебный эффект.",
    "Запрещены формулировки вроде: лечит, исцеляет, устраняет бессонницу, избавляет от тревоги, гарантирует.",
    primaryBudget,
    primaryQuery
      ? `seoTitle: естественный заголовок, дословно содержит полный основной запрос «${primaryQuery}» отдельной последовательностью слов один раз ближе к началу. Не изменяй слова запроса, их порядок или словоформу. Без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140. Стиль почти не влияет на заголовок.`
      : "seoTitle: естественный заголовок без набивки и без «| ключ | ключ», ориентир 50–70 символов, максимум 140. Не выдумывай основной запрос.",
    primaryQuery
      ? `seoDescription: 120–180 символов, максимум 300. Что это, для кого, что получает слушатель. Содержит полный основной запрос «${primaryQuery}» дословно ровно один раз: встрой его естественно в первое предложение, предпочтительно ближе к началу; он не обязан быть первыми символами. Не оборачивай поисковый запрос в кавычки только ради SEO. Оборачивать название продукта в «ёлочки» можно, если точный основной запрос всё равно остаётся непрерывной фразой. Не создавай искусственную конструкцию «ключ – это...», если она не звучит естественно. Не изменяй слова запроса, их порядок или словоформу.`
      : "seoDescription: 120–180 символов, максимум 300. Что это, для кого, что получает слушатель. Не выдумывай основной запрос.",
    secondaryQuerySystemInstruction(secondaryQueries, primaryQuery),
    `Поле description («${AUTHOR_DESCRIPTION_LABEL}») уже задано автором и будет показано на публичной странице. Используй его только как источник фактов. Не переписывай, не пересказывай и не заменяй его. Не генерируй отдельный текст «о продукте» и не возвращай поле seoAbout.`,
    primaryQuery
      ? "usageItems: ровно 3 конкретные ситуации, которые следуют из продукта. Не вставляй точный основной запрос в usageItems специально."
      : "usageItems: ровно 3 конкретные ситуации, которые следуют из продукта.",
    faqItemsSystemInstruction(primaryQuery),
    "Не генерируй связанные продукты и URL.",
    "Не используй одну универсальную структуру для всех продуктов.",
    "Меняй первые предложения, синтаксис, длину абзацев, порядок раскрытия, переходы и конструкции FAQ.",
    "Не создавай ложное разнообразие ценой смысла.",
    ...styleLines,
  ]
    .filter(Boolean)
    .join(" ");
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
    "Если проблем несколько, исправь все поля, затронутые каждой из них; ограничения для одной проблемы не запрещают изменения, необходимые для другой.",
    "Не переписывай описание продукта. Используй его только как источник фактов.",
    ...buildRepairIssueInstructions(issues, input.request.seoPrimaryQuery),
    `Проблемы: ${issues.join("; ")}`,
    `Предыдущий JSON: ${JSON.stringify(previous)}`,
    buildProductSeoGrounding(input),
  ].join("\n\n");
}
