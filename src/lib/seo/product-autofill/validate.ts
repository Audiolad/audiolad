import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  containsSeoPhrase,
  normalizeSeoPhrase,
} from "@/lib/seo/product-metadata";
import { clipSeoQuery, isSameSeoQuery } from "@/lib/seo/wordstat/ui";
import { wordstatPhraseKey } from "@/lib/seo/wordstat/phrase";
import { getPracticeSeoUsageHeading } from "@/lib/products/practice-seo-content";
import type { EligibleSecondaryCandidate } from "@/lib/seo/product-autofill/select-secondaries";
import {
  PRODUCT_SEO_ABOUT_SOFT_MAX,
  PRODUCT_SEO_FAQ_GENERATED_COUNT,
  PRODUCT_SEO_SECONDARY_MAX,
  PRODUCT_SEO_SECONDARY_MIN,
  PRODUCT_SEO_USAGE_MAX,
  PRODUCT_SEO_USAGE_MIN,
  type ProductSeoAiRawDraft,
  type ProductSeoAutofillDraft,
  type ProductSeoSecondaryQueryStatus,
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
  candidates: EligibleSecondaryCandidate[];
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

export function expectedSecondaryRange(candidateCount: number): {
  min: number;
  max: number;
} {
  if (candidateCount <= 0) {
    return { min: 0, max: 0 };
  }

  if (candidateCount < PRODUCT_SEO_SECONDARY_MIN) {
    return { min: 1, max: candidateCount };
  }

  return {
    min: PRODUCT_SEO_SECONDARY_MIN,
    max: Math.min(PRODUCT_SEO_SECONDARY_MAX, candidateCount),
  };
}

export function resolveSecondaryQueryStatus(
  selectedCount: number,
): ProductSeoSecondaryQueryStatus {
  if (selectedCount <= 0) {
    return "none";
  }

  if (selectedCount < PRODUCT_SEO_SECONDARY_MIN) {
    return "limited";
  }

  return "complete";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (value.some((item) => typeof item !== "string")) {
    return null;
  }

  return value as string[];
}

export function parseProductSeoAiRawDraft(
  value: unknown,
): ProductSeoAiRawDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const secondaryQueries = readStringArray(value.secondaryQueries);
  const seoTitle = readString(value.seoTitle);
  const seoDescription = readString(value.seoDescription);
  const seoAbout = readString(value.seoAbout);
  if (
    !secondaryQueries ||
    seoTitle === null ||
    seoDescription === null ||
    seoAbout === null ||
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
    secondaryQueries,
    seoTitle,
    seoDescription,
    seoAbout,
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

export function normalizeProductCopyText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ru-RU")
    .replace(/[.!?…]+$/g, "")
    .trim();
}

function firstSubstantialParagraph(value: string): string {
  for (const paragraph of value.split(/\n+/)) {
    const normalized = normalizeProductCopyText(paragraph);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function hasWordBoundaryAfterPrefix(text: string, prefix: string): boolean {
  if (!text.startsWith(prefix)) {
    return false;
  }

  const rest = text.slice(prefix.length);
  return rest === "" || /^[\s.,;:!?…"—–-]/.test(rest);
}

export function collectSeoAboutDuplicationIssues(
  seoAbout: string,
  description: string,
): string[] {
  const about = normalizeProductCopyText(seoAbout);
  const source = normalizeProductCopyText(description);
  if (!about || !source) {
    return [];
  }

  const issues: string[] = [];
  if (about === source) {
    issues.push("about_duplicates_description");
  }

  if (
    about !== source &&
    hasWordBoundaryAfterPrefix(about, source)
  ) {
    issues.push("about_starts_with_description");
  }

  const aboutOpening = firstSubstantialParagraph(seoAbout);
  const descriptionOpening = firstSubstantialParagraph(description);
  if (
    aboutOpening &&
    (aboutOpening === source || aboutOpening === descriptionOpening)
  ) {
    if (
      !issues.includes("about_duplicates_description") &&
      !issues.includes("about_starts_with_description")
    ) {
      issues.push("about_opening_copies_description");
    }
  }

  return issues;
}

function uniqueAnchors(faqItems: ProductSeoAiRawDraft["faqItems"]): boolean {
  const anchors = faqItems
    .map((item) => item.anchor.trim().toLocaleLowerCase())
    .filter(Boolean);
  return anchors.length === faqItems.length && new Set(anchors).size === anchors.length;
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
  if (!primary) {
    issues.push("missing_primary");
  }

  const allowed = new Set(
    input.candidates.map((item) => wordstatPhraseKey(item.phrase)),
  );
  const secondaries: string[] = [];
  const secondaryKeys = new Set<string>();

  for (const phrase of parsed.secondaryQueries) {
    const clipped = clipSeoQuery(phrase, PRODUCT_CONTENT_LIMITS.seoSecondaryQuery);
    if (!clipped) {
      issues.push("empty_secondary");
      continue;
    }

    if (clipped.length > PRODUCT_CONTENT_LIMITS.seoSecondaryQuery) {
      issues.push("secondary_too_long");
    }

    const key = wordstatPhraseKey(clipped);
    if (!allowed.has(key)) {
      issues.push(`invented_secondary:${clipped}`);
      continue;
    }

    if (isSameSeoQuery(clipped, primary)) {
      issues.push("secondary_equals_primary");
      continue;
    }

    if (secondaryKeys.has(key)) {
      issues.push("duplicate_secondary");
      continue;
    }

    secondaryKeys.add(key);
    secondaries.push(clipped);
  }

  if (secondaries.length > PRODUCT_SEO_SECONDARY_MAX) {
    issues.push("too_many_secondaries");
  }

  if (secondaries.length > PRODUCT_CONTENT_LIMITS.seoSecondaryQueries) {
    issues.push("secondary_limit");
  }

  const expectedSecondaries = expectedSecondaryRange(input.candidates.length);
  if (
    secondaries.length < expectedSecondaries.min ||
    secondaries.length > expectedSecondaries.max
  ) {
    issues.push("secondary_count");
  }

  const seoTitle = parsed.seoTitle.trim();
  const seoDescription = parsed.seoDescription.trim();
  const seoAbout = parsed.seoAbout.trim();

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

  if (seoAbout.length > PRODUCT_CONTENT_LIMITS.seoAbout) {
    issues.push("about_too_long");
  }

  if (seoAbout.length > PRODUCT_SEO_ABOUT_SOFT_MAX + 400) {
    issues.push("about_far_over_soft_max");
  }

  issues.push(
    ...collectSeoAboutDuplicationIssues(seoAbout, input.description),
  );

  const substantialStart = seoAbout.slice(0, 250);
  if (
    primary &&
    !containsSeoPhrase(seoDescription, primary) &&
    !containsSeoPhrase(substantialStart, primary)
  ) {
    issues.push("primary_missing_from_description_or_about");
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

  const allText = [
    seoTitle,
    seoDescription,
    seoAbout,
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
    ...secondaries,
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
      seoSecondaryQueries: secondaries.slice(0, PRODUCT_SEO_SECONDARY_MAX),
      seoTitle,
      seoDescription,
      seoAbout,
      usageItems,
      faqItems,
      secondaryQueryStatus: resolveSecondaryQueryStatus(secondaries.length),
    },
  };
}
