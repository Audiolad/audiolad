import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  containsSeoPhrase,
  normalizeSeoPhrase,
} from "@/lib/seo/product-metadata";
import { getPracticeSeoUsageHeading } from "@/lib/products/practice-seo-content";
import {
  PRODUCT_SEO_FAQ_GENERATED_COUNT,
  PRODUCT_SEO_USAGE_MAX,
  PRODUCT_SEO_USAGE_MIN,
  type ProductSeoAiRawDraft,
  type ProductSeoAutofillDraft,
} from "@/lib/seo/product-autofill/types";

export const BANNED_SEO_CLAIM_PATTERNS: RegExp[] = [
  /лечит/i,
  /исцеляет/i,
  /устраняет бессонницу/i,
  /избавляет от тревоги/i,
  /гарантирует/i,
  /гарантирован/i,
  /вылечит/i,
  /исцеление/i,
  /снимет тревогу/i,
  /уберёт бессонницу/i,
];

const UNGROUNDED_SPECIFIC_PATTERNS = [
  { label: "duration", pattern: /(\d+)\s*(мин(?:ут[аы]?)?|час(?:а|ов)?)/gi, sourceHints: ["мин", "час"] },
  { label: "tracks", pattern: /(\d+)\s*(трек(?:а|ов)?|дорожк)/gi, sourceHints: ["трек", "дорожк"] },
  { label: "price", pattern: /(\d+)\s*(₽|руб(?:\.|лей)?)/gi, sourceHints: ["₽", "руб"] },
];

export type ProductSeoValidationInput = {
  primaryQuery: string;
  title: string;
  subtitle: string;
  description: string;
  productKind: string;
  usageItems: string[];
  manualSecondaryQueries: string[];
};

export type ProductSeoValidationResult =
  | { ok: true; draft: ProductSeoAutofillDraft }
  | { ok: false; issues: string[] };

/**
 * Category-only form of a local validation issue for safe server logs.
 * Does not change validator issue strings. Strips generated/user text
 * after known dynamic suffixes:
 * - invented_secondary:<phrase> → invented_secondary
 * - banned_claim:<pattern> → banned_claim
 * - ungrounded:<label>:<snippet> → ungrounded:<label>
 * Static codes (secondary_count, title_too_long, malformed, …) stay as-is.
 */
export function normalizeProductSeoValidationIssue(issue: string): string {
  if (issue.startsWith("invented_secondary:")) {
    return "invented_secondary";
  }

  if (issue.startsWith("banned_claim:")) {
    return "banned_claim";
  }

  if (issue.startsWith("ungrounded:")) {
    const [prefix, label] = issue.split(":");
    return label ? `${prefix}:${label}` : prefix;
  }

  return issue;
}

export function normalizeProductSeoValidationIssues(issues: string[]): string[] {
  return issues.map(normalizeProductSeoValidationIssue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseProductSeoAiRawDraft(
  value: unknown,
): ProductSeoAiRawDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const seoTitle = readString(value.seoTitle);
  const seoDescription = readString(value.seoDescription);
  if (
    seoTitle === null ||
    seoDescription === null ||
    !Array.isArray(value.usageItems) ||
    !Array.isArray(value.faqItems)
  ) {
    return null;
  }

  const usageItems: ProductSeoAiRawDraft["usageItems"] = [];
  for (const item of value.usageItems) {
    if (!isRecord(item) || typeof item.content !== "string") {
      return null;
    }
    usageItems.push({ content: item.content });
  }

  const faqItems: ProductSeoAiRawDraft["faqItems"] = [];
  for (const item of value.faqItems) {
    if (
      !isRecord(item) ||
      typeof item.question !== "string" ||
      typeof item.answer !== "string" ||
      typeof item.anchor !== "string"
    ) {
      return null;
    }
    faqItems.push({
      question: item.question,
      answer: item.answer,
      anchor: item.anchor,
    });
  }

  return {
    seoTitle,
    seoDescription,
    usageItems,
    faqItems,
  };
}

function collectBannedClaims(text: string): string[] {
  return BANNED_SEO_CLAIM_PATTERNS.filter((pattern) => pattern.test(text)).map(
    (pattern) => `banned_claim:${pattern.source}`,
  );
}

function collectUngroundedSpecifics(text: string, source: string): string[] {
  const sourceNorm = source.toLocaleLowerCase("ru-RU");
  const issues: string[] = [];

  for (const rule of UNGROUNDED_SPECIFIC_PATTERNS) {
    const matches = text.matchAll(rule.pattern);
    for (const match of matches) {
      const snippet = match[0].toLocaleLowerCase("ru-RU");
      const number = match[1];
      const hinted = rule.sourceHints.some((hint) => sourceNorm.includes(hint));
      if (!hinted || (number && !sourceNorm.includes(number))) {
        issues.push(`ungrounded:${rule.label}:${snippet}`);
      }
    }
  }

  return issues;
}

function containsPrimaryInFaqQuestion(
  question: string,
  primary: string,
): boolean {
  if (containsSeoPhrase(question, primary)) {
    return true;
  }

  const words = normalizeSeoPhrase(primary).split(" ").filter(Boolean);
  const source = normalizeSeoPhrase(question);
  if (!words.length || !source) {
    return false;
  }

  return words.every((word) => {
    if (word.length <= 3) {
      return source.includes(word);
    }

    const stem = word.slice(0, Math.max(4, word.length - 2));
    return source.includes(stem);
  });
}

function uniqueAnchors(faqItems: ProductSeoAiRawDraft["faqItems"]): boolean {
  const anchors = faqItems
    .map((item) => item.anchor.trim().toLocaleLowerCase())
    .filter(Boolean);
  return anchors.length === faqItems.length && new Set(anchors).size === anchors.length;
}

export function faqAnswerRepeatsQuestion(question: string, answer: string): boolean {
  const words = (text: string) =>
    normalizeSeoPhrase(text)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter(Boolean);
  const questionWords = words(question);
  const answerWords = words(answer);
  if (!questionWords.length || !answerWords.length) {
    return false;
  }

  if (questionWords.join(" ") === answerWords.join(" ")) {
    return true;
  }

  // Reject only the narrow tautology "<semantic question core> — это
  // <semantic question core>". The recognized "как использовать …" scaffold
  // is removed so that "Как использовать практику?" and "Использовать
  // практику — это использовать практику." are caught. This is intentionally
  // not an overlap check: a direct answer can naturally reuse the question's
  // subject words in a different sentence.
  const questionText = questionWords.join(" ");
  const questionCore =
    questionWords[0] === "как" && questionWords[1] === "использовать"
      ? questionWords.slice(1).join(" ")
      : questionText;
  if (answerWords.join(" ") === `${questionCore} это ${questionCore}`) {
    return true;
  }

  // A repeated FAQ question normally preserves word order. Compare that
  // sequence directly, allowing only one omitted or changed word for a
  // near-exact restatement. Set overlap is deliberately not used: a direct
  // answer naturally shares the question's subject terms but changes the
  // sentence structure and adds useful information.
  const maximumDistance = 1;
  if (Math.abs(questionWords.length - answerWords.length) > maximumDistance) {
    return false;
  }

  let previous = Array.from(
    { length: answerWords.length + 1 },
    (_, index) => index,
  );
  for (let questionIndex = 1; questionIndex <= questionWords.length; questionIndex += 1) {
    const current = [questionIndex];
    let rowMinimum = current[0];

    for (let answerIndex = 1; answerIndex <= answerWords.length; answerIndex += 1) {
      const distance = questionWords[questionIndex - 1] === answerWords[answerIndex - 1]
        ? previous[answerIndex - 1]
        : 1 + Math.min(
            previous[answerIndex - 1],
            previous[answerIndex],
            current[answerIndex - 1],
          );
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > maximumDistance) {
      return false;
    }
    previous = current;
  }

  return previous[answerWords.length] <= maximumDistance;
}

const FAQ_ANSWER_QUESTION_LEAD_PATTERN =
  /^[\s«“"(\[]*(?:(?:что\s+(?:такое|значит|означает|делать)|как\s+(?:работает|использовать|слушать|выбрать)|когда\s+(?:лучше|нужно|стоит)|кому\s+(?:подходит|подойд[её]т)|(?:можно|нужно|стоит|следует)\s+ли|почему\s+(?:это|так|нужно|следует)|зачем\s+(?:это|нужно|следует))(?:\s|[,.!?:;]|$))/iu;

export function faqAnswerIsQuestion(answer: string): boolean {
  return answer.includes("?") || FAQ_ANSWER_QUESTION_LEAD_PATTERN.test(answer.trim());
}

export function validateProductSeoAiDraft(
  raw: unknown,
  input: ProductSeoValidationInput,
): ProductSeoValidationResult {
  const parsed = parseProductSeoAiRawDraft(raw);
  if (!parsed) {
    return { ok: false, issues: ["malformed"] };
  }

  const issues: string[] = [];
  const primary = input.primaryQuery.trim();

  const seoTitle = parsed.seoTitle.trim();
  const seoDescription = parsed.seoDescription.trim();

  if (!seoTitle) {
    issues.push("empty_title");
  }

  if (seoTitle.length > PRODUCT_CONTENT_LIMITS.seoTitle) {
    issues.push("title_too_long");
  }

  if (primary && !containsSeoPhrase(seoTitle, primary)) {
    issues.push("primary_missing_from_title");
  }

  if (/\|/.test(seoTitle) || /,\s*[^,]+\s*,/.test(seoTitle)) {
    issues.push("title_stuffing");
  }

  if (!seoDescription) {
    issues.push("empty_description");
  }

  if (seoDescription.length > PRODUCT_CONTENT_LIMITS.seoDescription) {
    issues.push("description_too_long");
  }

  if (primary && !containsSeoPhrase(seoDescription, primary)) {
    issues.push("primary_missing_from_description");
  }

  const usageItems = parsed.usageItems
    .map((item) => ({ content: item.content.trim() }))
    .filter((item) => item.content);
  const usageKeys = new Set(
    usageItems.map((item) => item.content.toLocaleLowerCase("ru-RU")),
  );

  if (usageItems.length < PRODUCT_SEO_USAGE_MIN || usageItems.length > PRODUCT_SEO_USAGE_MAX) {
    issues.push("usage_count");
  }

  if (usageKeys.size !== usageItems.length) {
    issues.push("duplicate_usage");
  }

  if (
    usageItems.some((item) => item.content.length > PRODUCT_CONTENT_LIMITS.seoUsageItem)
  ) {
    issues.push("usage_too_long");
  }

  if (parsed.faqItems.length !== PRODUCT_SEO_FAQ_GENERATED_COUNT) {
    issues.push("faq_count");
  }

  const faqItems = parsed.faqItems.map((item) => ({
    question: item.question.trim(),
    answer: item.answer.trim(),
    anchor: item.anchor.trim(),
  }));

  if (faqItems.some((item) => !item.question || !item.answer || !item.anchor)) {
    issues.push("empty_faq");
  }

  const faqQuestionKeys = new Set(
    faqItems.map((item) => item.question.toLocaleLowerCase("ru-RU")),
  );
  if (faqQuestionKeys.size !== faqItems.length) {
    issues.push("duplicate_faq");
  }

  if (!uniqueAnchors(faqItems)) {
    issues.push("duplicate_or_empty_anchor");
  }

  if (
    faqItems.some(
      (item) =>
        item.question.length > PRODUCT_CONTENT_LIMITS.seoFaqQuestion ||
        item.answer.length > PRODUCT_CONTENT_LIMITS.seoFaqAnswer,
    )
  ) {
    issues.push("faq_too_long");
  }

  if (
    primary &&
    !faqItems.some((item) => containsPrimaryInFaqQuestion(item.question, primary))
  ) {
    issues.push("primary_missing_from_faq");
  }

  if (
    faqItems.some((item) => faqAnswerRepeatsQuestion(item.question, item.answer))
  ) {
    issues.push("faq_answer_repeats_question");
  }

  if (faqItems.some((item) => faqAnswerIsQuestion(item.answer))) {
    issues.push("faq_answer_is_question");
  }

  const allText = [
    seoTitle,
    seoDescription,
    ...usageItems.map((item) => item.content),
    ...faqItems.map((item) => `${item.question} ${item.answer}`),
  ].join("\n");
  const source = [
    input.title,
    input.subtitle,
    input.description,
    input.productKind,
    getPracticeSeoUsageHeading(input.productKind),
    primary,
    ...input.manualSecondaryQueries,
    ...input.usageItems,
  ].join("\n");

  issues.push(...collectBannedClaims(allText));
  issues.push(...collectUngroundedSpecifics(allText, source));

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    draft: {
      seoSecondaryQueries: input.manualSecondaryQueries,
      seoTitle,
      seoDescription,
      usageItems,
      faqItems,
    },
  };
}
