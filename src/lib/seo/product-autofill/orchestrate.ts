import "server-only";

import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  getProductSeoAiConfig,
  type ProductSeoAiConfig,
} from "@/lib/seo/product-autofill/config";
import {
  productSeoAiError,
  productSeoAiInvalidOutputError,
} from "@/lib/seo/product-autofill/errors";
import {
  createProductSeoAiProvider,
  type ProductSeoAiProvider,
} from "@/lib/seo/product-autofill/provider";
import type { ProductSeoAiPromptInput } from "@/lib/seo/product-autofill/prompt";
import {
  createDefaultProductSeoStyleProfile,
  requestHasForbiddenStyleKeys,
  sanitizeProductSeoStyleProfile,
} from "@/lib/seo/product-autofill/style-profile";
import {
  faqAnswerIsQuestion,
  faqAnswerRepeatsQuestion,
  normalizeProductSeoValidationIssues,
  validateProductSeoAiDraft,
} from "@/lib/seo/product-autofill/validate";
import {
  containsSeoPhrase,
  PRODUCT_SEO_TITLE_SEPARATOR,
} from "@/lib/seo/product-metadata";
import { applyProductSeoDraftRussianTypography } from "@/lib/seo/product-autofill/typography";
import {
  evaluateListenOnlineFaqIntent,
  type ListenOnlineFaqIntent,
} from "@/lib/seo/listen-online-faq-intent";
import {
  productSeoAccessModeFromIsFree,
  type ProductSeoAiErrorCode,
  type ProductSeoAiRawDraft,
  type ProductSeoAiResult,
  type ProductSeoAutofillDraft,
  type ProductSeoAutofillRequest,
} from "@/lib/seo/product-autofill/types";
import {
  evaluatePrimaryQueryOveruse,
  type PrimaryQueryOveruse,
} from "@/lib/seo/primary-query-overuse";
import {
  evaluateSecondaryQueryCoverage,
  isSecondaryCoverageComplete,
  selectActiveSecondaryQueries,
  type ProductSeoQualityRepairInput,
  type SecondaryQueryCoverage,
} from "@/lib/seo/secondary-query-coverage";

const BLOCKED_LOG_FIELDS = new Set([
  "token",
  "apikey",
  "api_key",
  "authorization",
  "openai_api_key",
  "openaiapikey",
  "yandex_ai_api_key",
  "yandexaiapikey",
  "yandex_search_api_key",
  "yandex_ai_folder_id",
  "folderid",
  "folder_id",
  "userid",
  "user_id",
]);

type ProductSeoAiLogField =
  | string
  | number
  | boolean
  | readonly string[]
  | null
  | undefined;

function logProductSeoAiEvent(
  message: string,
  fields: Record<string, ProductSeoAiLogField>,
): void {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(
      ([field]) => !BLOCKED_LOG_FIELDS.has(field.toLowerCase()),
    ),
  );
  console.info(`[product-seo-ai] ${message}`, safe);
}

function logProductSeoAiValidationFailed(input: {
  provider: ProductSeoAiConfig["provider"];
  model: string;
  stage:
    | "generate"
    | "repair"
    | "finalizer"
    | "third_repair"
    | "quality_repair";
  issues: string[];
}): void {
  logProductSeoAiEvent("product_seo_ai_validation_failed", {
    provider: input.provider,
    model: input.model,
    stage: input.stage,
    issues: normalizeProductSeoValidationIssues(input.issues),
    issueCount: input.issues.length,
  });
}

export type GenerateProductSeoDraftOptions = {
  userId: string;
  env?: NodeJS.ProcessEnv;
  config?: ProductSeoAiConfig;
  provider?: ProductSeoAiProvider;
};

export type ParseProductSeoAutofillRequestResult =
  | { ok: true; request: ProductSeoAutofillRequest }
  | { ok: false; code: Extract<ProductSeoAiErrorCode, "INVALID_PRIMARY" | "INVALID_STYLE_PROFILE"> };

function secondaryQueryKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function normalizeManualSecondaryQueries(
  value: unknown,
  primaryQuery: string,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const primaryKey = secondaryQueryKey(primaryQuery);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const phrase = item.trim().replace(/\s+/g, " ");
    const key = secondaryQueryKey(phrase);
    if (
      !phrase ||
      phrase.length > PRODUCT_CONTENT_LIMITS.seoSecondaryQuery ||
      key === primaryKey ||
      seen.has(key) ||
      normalized.length >= PRODUCT_CONTENT_LIMITS.seoSecondaryQueries
    ) {
      continue;
    }
    seen.add(key);
    normalized.push(phrase);
  }

  return normalized;
}

function readAutofillRequest(body: unknown): ParseProductSeoAutofillRequestResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "INVALID_PRIMARY" };
  }

  const record = body as Record<string, unknown>;
  if (requestHasForbiddenStyleKeys(record)) {
    return { ok: false, code: "INVALID_STYLE_PROFILE" };
  }

  if (
    typeof record.title !== "string" ||
    typeof record.subtitle !== "string" ||
    typeof record.description !== "string" ||
    typeof record.productKind !== "string" ||
    typeof record.seoPrimaryQuery !== "string"
  ) {
    return { ok: false, code: "INVALID_PRIMARY" };
  }

  const style = sanitizeProductSeoStyleProfile(record.styleProfile);
  if (!style.ok) {
    return { ok: false, code: "INVALID_STYLE_PROFILE" };
  }

  const usageItems = Array.isArray(record.usageItems)
    ? record.usageItems.filter((item): item is string => typeof item === "string")
    : [];
  const seoSecondaryQueries = normalizeManualSecondaryQueries(
    record.seoSecondaryQueries,
    record.seoPrimaryQuery,
  );
  const isFree =
    record.isFree === true ? true : record.isFree === false ? false : undefined;
  return {
    ok: true,
    request: {
      title: record.title,
      subtitle: record.subtitle,
      description: record.description,
      productKind: record.productKind,
      seoPrimaryQuery: record.seoPrimaryQuery,
      ...(isFree === undefined ? {} : { isFree }),
      seoSecondaryQueries,
      usageItems,
      styleProfile: style.profile,
      mode: record.mode === "field" ? "field" : "full",
      fields: Array.isArray(record.fields)
        ? record.fields.filter(
            (item): item is NonNullable<ProductSeoAutofillRequest["fields"]>[number] =>
              item === "title" ||
              item === "description" ||
              item === "faq" ||
              item === "usage",
          )
        : undefined,
    },
  };
}

export function parseProductSeoAutofillRequest(
  body: unknown,
): ParseProductSeoAutofillRequestResult {
  return readAutofillRequest(body);
}

const LEADING_SEPARATOR_OR_ORPHAN_QUOTE = /^[\s–—:;,.!?"'«»“”‘’-]+/;

/**
 * Shortens generated copy at a sentence or word boundary. Used when the only
 * remaining issue is length: the existing primary occurrence must stay in
 * place instead of being reconstructed.
 */
export function shortenProductSeoText(value: string, limit: number): string | null {
  const text = value.trim();
  if (text.length <= limit) {
    return text || null;
  }

  const allowedPrefix = text.slice(0, limit + 1);
  const lastSentenceBoundary = Math.max(
    allowedPrefix.lastIndexOf("."),
    allowedPrefix.lastIndexOf("!"),
    allowedPrefix.lastIndexOf("…"),
  );
  const shortenedAtSentenceBoundary =
    lastSentenceBoundary >= 0
      ? allowedPrefix.slice(0, lastSentenceBoundary + 1).trim()
      : null;
  const wordBoundary = allowedPrefix.lastIndexOf(" ");
  const shortenedAtWordBoundary =
    wordBoundary > 0 ? allowedPrefix.slice(0, wordBoundary).trim() : null;

  return (
    shortenedAtSentenceBoundary ??
    shortenedAtWordBoundary ??
    text.slice(0, limit).trim() ??
    null
  );
}

/**
 * #298 missing-primary path: move the author-owned primary to the beginning
 * and retain as much of the generated suffix as the field limit permits.
 * If the generated value already contains the primary, only its suffix is
 * reused, so the primary remains literal and is not duplicated. Last resort
 * is the primary alone when no suffix fits.
 */
export function prependPrimaryAndShorten(
  value: string,
  primary: string,
  limit: number,
): string | null {
  if (!primary || primary.length > limit) {
    return null;
  }

  const text = value.trim();
  const primaryIndex = text
    .toLocaleLowerCase("ru-RU")
    .indexOf(primary.toLocaleLowerCase("ru-RU"));
  const suffix = (
    primaryIndex >= 0 ? text.slice(primaryIndex + primary.length) : text
  )
    .replace(LEADING_SEPARATOR_OR_ORPHAN_QUOTE, "")
    .trim();
  if (!suffix) {
    return primary;
  }

  const shortenedSuffix = shortenProductSeoText(
    suffix,
    limit - primary.length - PRODUCT_SEO_TITLE_SEPARATOR.length,
  );
  return shortenedSuffix
    ? `${primary}${PRODUCT_SEO_TITLE_SEPARATOR}${shortenedSuffix}`
    : primary;
}

export function finalizeProductSeoMetadataField(input: {
  value: string;
  primary: string;
  limit: number;
  missingPrimary: boolean;
  tooLong: boolean;
}): string | null {
  const { value, primary, limit, missingPrimary, tooLong } = input;

  if (missingPrimary) {
    return prependPrimaryAndShorten(value, primary, limit);
  }

  if (tooLong) {
    const shortened = shortenProductSeoText(value, limit);
    if (!shortened) {
      return null;
    }
    if (primary && !containsSeoPhrase(shortened, primary)) {
      return prependPrimaryAndShorten(value, primary, limit);
    }
    return shortened;
  }

  return value.trim() || null;
}

export async function generateProductSeoDraft(
  request: ProductSeoAutofillRequest,
  options: GenerateProductSeoDraftOptions,
): Promise<ProductSeoAiResult> {
  const primary = request.seoPrimaryQuery.trim();
  if (primary.length > PRODUCT_CONTENT_LIMITS.seoPrimaryQuery) {
    return productSeoAiError("INVALID_PRIMARY");
  }

  const env = options.env ?? process.env;
  const config = options.config ?? getProductSeoAiConfig(env);

  if (!config.enabledFlag) {
    return productSeoAiError("AI_DISABLED");
  }

  if (config.provider === "unknown") {
    return productSeoAiError("PROVIDER_ERROR");
  }

  if (!config.canCall) {
    return productSeoAiError("NOT_CONFIGURED");
  }

  const manualSecondaryQueries = normalizeManualSecondaryQueries(
    request.seoSecondaryQueries,
    primary,
  );
  const activeSecondaryQueries = selectActiveSecondaryQueries(
    manualSecondaryQueries,
  );
  const styleProfile =
    request.styleProfile ?? createDefaultProductSeoStyleProfile();
  const promptInput: ProductSeoAiPromptInput = {
    request: {
      ...request,
      seoPrimaryQuery: primary,
      seoSecondaryQueries: manualSecondaryQueries,
      styleProfile,
    },
  };
  const MAX_PROVIDER_CALLS = 3;
  let providerCallCount = 0;
  // The author-owned primary can be copied into generated display fields; its
  // literal spelling is protected while all other AI-generated copy is set.
  const protectedTypographyPhrases = [primary];

  function normalizeGeneratedDraft(draft: ProductSeoAiRawDraft): ProductSeoAiRawDraft {
    return applyProductSeoDraftRussianTypography(draft, protectedTypographyPhrases);
  }

  function validateDraft(draft: ProductSeoAiRawDraft) {
    return validateProductSeoAiDraft(draft, {
      primaryQuery: primary,
      title: request.title,
      subtitle: request.subtitle,
      description: request.description,
      productKind: request.productKind,
      usageItems: request.usageItems ?? [],
      manualSecondaryQueries,
    });
  }

  function readSecondaryCoverage(draft: {
    usageItems: ProductSeoAiRawDraft["usageItems"];
    faqItems: ProductSeoAiRawDraft["faqItems"];
  }): SecondaryQueryCoverage {
    return evaluateSecondaryQueryCoverage({
      primaryQuery: primary,
      activeSecondaryQueries,
      usageItems: draft.usageItems,
      faqItems: draft.faqItems,
    });
  }

  function readPrimaryOveruse(draft: {
    usageItems: ProductSeoAiRawDraft["usageItems"];
    faqItems: ProductSeoAiRawDraft["faqItems"];
  }): PrimaryQueryOveruse {
    return evaluatePrimaryQueryOveruse({
      primaryQuery: primary,
      productTitle: request.title,
      usageItems: draft.usageItems,
      faqItems: draft.faqItems,
    });
  }

  function readListenOnlineIntent(draft: {
    faqItems: ProductSeoAiRawDraft["faqItems"];
  }): ListenOnlineFaqIntent {
    return evaluateListenOnlineFaqIntent({
      productTitle: request.title,
      accessMode: productSeoAccessModeFromIsFree(request.isFree),
      faqItems: draft.faqItems,
    });
  }

  function hasQualityIssues(
    coverage: SecondaryQueryCoverage,
    overuse: PrimaryQueryOveruse,
    listenIntent: ListenOnlineFaqIntent,
  ): boolean {
    return (
      !isSecondaryCoverageComplete(coverage, activeSecondaryQueries.length) ||
      overuse.primaryOveruse ||
      !listenIntent.listenOnlineIntent
    );
  }

  function qualityRepairInput(
    coverage: SecondaryQueryCoverage,
    overuse: PrimaryQueryOveruse,
    listenIntent: ListenOnlineFaqIntent,
  ): ProductSeoQualityRepairInput {
    return {
      ...coverage,
      ...overuse,
      ...listenIntent,
      secondary1: activeSecondaryQueries[0],
      secondary2: activeSecondaryQueries[1],
    };
  }

  function mergeQualityRepair(
    candidate: ProductSeoAiRawDraft,
    previous: ProductSeoAiRawDraft,
    coverage: SecondaryQueryCoverage,
    overuse: PrimaryQueryOveruse,
    listenIntent: ListenOnlineFaqIntent,
  ): ProductSeoAiRawDraft {
    const next: ProductSeoAiRawDraft = {
      seoTitle: previous.seoTitle,
      seoDescription: previous.seoDescription,
      usageItems: previous.usageItems.map((item) => ({ ...item })),
      faqItems: previous.faqItems.map((item) => ({ ...item })),
    };

    const usageIndexes = new Set(overuse.overusedUsageIndexes);
    if (
      !coverage.secondary1UsageCovered &&
      candidate.usageItems.length === previous.usageItems.length
    ) {
      const changedIndex = previous.usageItems.findIndex(
        (item, index) => item.content !== candidate.usageItems[index]?.content,
      );
      if (changedIndex >= 0) {
        usageIndexes.add(changedIndex);
      }
    }

    if (candidate.usageItems.length === previous.usageItems.length) {
      for (const index of usageIndexes) {
        const candidateItem = candidate.usageItems[index];
        if (candidateItem) {
          next.usageItems[index] = { content: candidateItem.content };
        }
      }
    }

    if (candidate.faqItems.length === previous.faqItems.length) {
      for (const location of overuse.overusedFaqLocations) {
        if (location.index === 0 && location.field === "question") {
          continue;
        }
        const candidateItem = candidate.faqItems[location.index];
        const previousItem = previous.faqItems[location.index];
        if (!candidateItem || !previousItem) {
          continue;
        }
        next.faqItems[location.index] = {
          question:
            location.field === "question"
              ? candidateItem.question
              : next.faqItems[location.index].question,
          answer:
            location.field === "answer"
              ? candidateItem.answer
              : next.faqItems[location.index].answer,
          anchor: previousItem.anchor,
        };
      }

      if (!coverage.secondary2FaqCovered) {
        const previousItem = previous.faqItems[1];
        const candidateItem = candidate.faqItems[1];
        if (previousItem && candidateItem) {
          const questionChanged = previousItem.question !== candidateItem.question;
          const answerChanged = previousItem.answer !== candidateItem.answer;
          if (questionChanged || answerChanged) {
            next.faqItems[1] = {
              question: questionChanged
                ? candidateItem.question
                : next.faqItems[1].question,
              answer: answerChanged
                ? candidateItem.answer
                : next.faqItems[1].answer,
              anchor: previousItem.anchor,
            };
          }
        }
      }

      if (!listenIntent.listenOnlineIntent) {
        const previousItem = previous.faqItems[2];
        const candidateItem = candidate.faqItems[2];
        if (previousItem && candidateItem) {
          next.faqItems[2] = {
            question: candidateItem.question,
            answer: candidateItem.answer,
            anchor: previousItem.anchor,
          };
        }
      }
    }

    return next;
  }

  async function completeWithOptionalQualityRepair(
    validDraft: ProductSeoAutofillDraft,
    rawDraft: ProductSeoAiRawDraft,
  ): Promise<ProductSeoAiResult> {
    // Quality issues never replace the pre-repair hard-valid fallback unless
    // the candidate is hard-valid and every active soft check also passes.
    const fallbackHardValidDraft = validDraft;
    const coverage = readSecondaryCoverage(fallbackHardValidDraft);
    const overuse = readPrimaryOveruse(fallbackHardValidDraft);
    const listenIntent = readListenOnlineIntent(fallbackHardValidDraft);
    if (
      !hasQualityIssues(coverage, overuse, listenIntent) ||
      providerCallCount >= MAX_PROVIDER_CALLS
    ) {
      return { ok: true, data: fallbackHardValidDraft };
    }

    const repaired = await provider.qualityRepair(
      promptInput,
      rawDraft,
      qualityRepairInput(coverage, overuse, listenIntent),
    );
    providerCallCount += 1;
    if (!repaired.ok || !repaired.draft?.usageItems || !repaired.draft?.faqItems) {
      return { ok: true, data: fallbackHardValidDraft };
    }

    const mergedDraft = normalizeGeneratedDraft(
      mergeQualityRepair(repaired.draft, rawDraft, coverage, overuse, listenIntent),
    );
    const repairedValidation = validateDraft(mergedDraft);
    if (!repairedValidation.ok) {
      return { ok: true, data: fallbackHardValidDraft };
    }

    const repairedCoverage = readSecondaryCoverage(repairedValidation.draft);
    const repairedOveruse = readPrimaryOveruse(repairedValidation.draft);
    const repairedListenIntent = readListenOnlineIntent(repairedValidation.draft);
    if (hasQualityIssues(repairedCoverage, repairedOveruse, repairedListenIntent)) {
      return { ok: true, data: fallbackHardValidDraft };
    }

    return { ok: true, data: repairedValidation.draft };
  }

  function hasOnlyFaqAnswerRepairIssues(issues: string[]): boolean {
    return (
      issues.length > 0 &&
      issues.every(
        (issue) =>
          issue === "faq_answer_repeats_question" ||
          issue === "faq_answer_is_question",
      )
    );
  }

  function mergeFaqAnswerOnlyRepair(
    draft: ProductSeoAiRawDraft,
    previous: ProductSeoAiRawDraft,
    issues: string[],
  ): ProductSeoAiRawDraft {
    if (
      !hasOnlyFaqAnswerRepairIssues(issues) ||
      draft.faqItems.length !== previous.faqItems.length
    ) {
      return draft;
    }

    return {
      ...previous,
      faqItems: previous.faqItems.map((item, index) =>
        faqAnswerRepeatsQuestion(item.question, item.answer) ||
        faqAnswerIsQuestion(item.answer)
          ? { ...item, answer: draft.faqItems[index].answer }
          : item,
      ),
    };
  }

  function isValidDeterministicFaqAnswer(question: string, answer: string): boolean {
    return (
      Boolean(answer.trim()) &&
      !faqAnswerIsQuestion(answer) &&
      !faqAnswerRepeatsQuestion(question, answer)
    );
  }

  function salvageDeterministicFaqAnswer(question: string, answer: string): string | null {
    const trimmedAnswer = answer.trim();
    const finalQuestionMark = trimmedAnswer.lastIndexOf("?");
    if (finalQuestionMark >= 0) {
      const trailingDeclarative = trimmedAnswer.slice(finalQuestionMark + 1).trim();
      if (isValidDeterministicFaqAnswer(question, trailingDeclarative)) {
        return trailingDeclarative;
      }
    }

    if (trimmedAnswer.endsWith("?")) {
      const punctuationOnly = `${trimmedAnswer.slice(0, -1).trim()}.`;
      if (isValidDeterministicFaqAnswer(question, punctuationOnly)) {
        return punctuationOnly;
      }
    }

    return null;
  }

  function deterministicFaqAnswer(question: string): string {
    const normalizedQuestion = question.trim().toLocaleLowerCase("ru-RU");
    if (/^(когда|в какое время|в какой момент)(?=\s|[?.!,:;]|$)/u.test(normalizedQuestion)) {
      return "Практику можно включить в спокойное время, когда удобно уделить внимание себе.";
    }
    if (/^(как|каким образом)(?=\s|[?.!,:;]|$)/u.test(normalizedQuestion)) {
      return "Выберите комфортное место и слушайте практику в удобном для себя темпе.";
    }
    if (/^(кому|для кого)(?=\s|[?.!,:;]|$)/u.test(normalizedQuestion)) {
      return "Практика подойдёт тем, кому откликаются её тема и формат.";
    }
    if (/^(что такое|что значит|что означает)(?=\s|[?.!,:;]|$)/u.test(normalizedQuestion)) {
      const title = request.title.trim().replace(/\s+/g, " ");
      if (title) {
        return `«${title}» — аудиоматериал.`;
      }
    }
    if (/^(можно|нужно|стоит|следует)\s+ли(?=\s|[?.!,:;]|$)/u.test(normalizedQuestion)) {
      return "Ориентируйтесь на своё самочувствие и выбирайте комфортный для себя формат.";
    }
    return "Практика помогает спокойно познакомиться с темой в удобном для себя темпе.";
  }

  function applyDeterministicFaqAnswerFallback(
    draft: ProductSeoAiRawDraft,
  ): ProductSeoAiRawDraft {
    return {
      ...draft,
      faqItems: draft.faqItems.map((item) =>
        faqAnswerIsQuestion(item.answer) ||
        faqAnswerRepeatsQuestion(item.question, item.answer)
          ? (() => {
              const answer =
                salvageDeterministicFaqAnswer(item.question, item.answer) ??
                deterministicFaqAnswer(item.question);
              return isValidDeterministicFaqAnswer(item.question, answer)
                ? { ...item, answer }
                : item;
            })()
          : item,
      ),
    };
  }

  const SAFE_FINALIZER_ISSUES = new Set([
    "title_too_long",
    "primary_missing_from_title",
    "description_too_long",
    "primary_missing_from_description",
    "faq_answer_repeats_question",
    "faq_answer_is_question",
  ]);

  /**
   * Applies only local transformations whose validity can be proved by the
   * validator. It never changes author input, anchors, FAQ questions, or
   * otherwise-valid draft fields. Length-only residuals shorten the existing
   * copy and keep an already-present primary; missing-primary residuals still
   * use the #298 prepend-and-shorten path.
   */
  function finalizeDraftSafely(
    draft: ProductSeoAiRawDraft,
    issues: string[],
  ): ProductSeoAiRawDraft {
    let finalized = draft;
    if (
      issues.includes("title_too_long") ||
      issues.includes("primary_missing_from_title")
    ) {
      const seoTitle = finalizeProductSeoMetadataField({
        value: finalized.seoTitle,
        primary,
        limit: PRODUCT_CONTENT_LIMITS.seoTitle,
        missingPrimary: issues.includes("primary_missing_from_title"),
        tooLong: issues.includes("title_too_long"),
      });
      finalized = seoTitle ? { ...finalized, seoTitle } : finalized;
    }
    if (
      issues.includes("description_too_long") ||
      issues.includes("primary_missing_from_description")
    ) {
      const seoDescription = finalizeProductSeoMetadataField({
        value: finalized.seoDescription,
        primary,
        limit: PRODUCT_CONTENT_LIMITS.seoDescription,
        missingPrimary: issues.includes("primary_missing_from_description"),
        tooLong: issues.includes("description_too_long"),
      });
      finalized = seoDescription ? { ...finalized, seoDescription } : finalized;
    }
    if (
      issues.includes("faq_answer_is_question") ||
      issues.includes("faq_answer_repeats_question")
    ) {
      finalized = applyDeterministicFaqAnswerFallback(finalized);
    }
    return normalizeGeneratedDraft(finalized);
  }

  const provider = options.provider ?? createProductSeoAiProvider({ env, config });
  const first = await provider.generate(promptInput);
  providerCallCount += 1;
  if (!first.ok) {
    return first;
  }

  const firstDraft = normalizeGeneratedDraft(first.draft);
  const firstValidation = validateDraft(firstDraft);

  if (firstValidation.ok) {
    return completeWithOptionalQualityRepair(firstValidation.draft, firstDraft);
  }

  logProductSeoAiValidationFailed({
    provider: config.provider,
    model: config.model,
    stage: "generate",
    issues: firstValidation.issues,
  });

  const repaired = await provider.repair(
    promptInput,
    firstDraft,
    firstValidation.issues,
  );
  providerCallCount += 1;
  if (!repaired.ok) {
    return repaired;
  }

  const repairedDraft = mergeFaqAnswerOnlyRepair(
    normalizeGeneratedDraft(repaired.draft),
    firstDraft,
    firstValidation.issues,
  );
  const repairedValidation = validateDraft(repairedDraft);

  if (!repairedValidation.ok) {
    logProductSeoAiValidationFailed({
      provider: config.provider,
      model: config.model,
      stage: "repair",
      issues: repairedValidation.issues,
    });
    const finalizedDraft = finalizeDraftSafely(repairedDraft, repairedValidation.issues);
    const finalizerValidation = validateDraft(finalizedDraft);
    if (finalizerValidation.ok) {
      return completeWithOptionalQualityRepair(finalizerValidation.draft, finalizedDraft);
    }

    logProductSeoAiValidationFailed({
      provider: config.provider,
      model: config.model,
      stage: "finalizer",
      issues: finalizerValidation.issues,
    });
    const residualNonSafeIssues = finalizerValidation.issues.filter(
      (issue) => !SAFE_FINALIZER_ISSUES.has(issue),
    );
    if (residualNonSafeIssues.length === 0) {
      return productSeoAiInvalidOutputError({
        stage: "validation_finalizer",
        generateIssues: firstValidation.issues,
        repairIssues: repairedValidation.issues,
        finalizerIssues: finalizerValidation.issues,
      });
    }

    const thirdRepair = await provider.repair(
      promptInput,
      finalizedDraft,
      residualNonSafeIssues,
    );
    providerCallCount += 1;
    if (!thirdRepair.ok) {
      return thirdRepair;
    }

    const thirdRepairDraft = mergeFaqAnswerOnlyRepair(
      normalizeGeneratedDraft(thirdRepair.draft),
      finalizedDraft,
      finalizerValidation.issues,
    );
    const thirdRepairValidation = validateDraft(thirdRepairDraft);
    if (thirdRepairValidation.ok) {
      return completeWithOptionalQualityRepair(thirdRepairValidation.draft, thirdRepairDraft);
    }

    logProductSeoAiValidationFailed({
      provider: config.provider,
      model: config.model,
      stage: "third_repair",
      issues: thirdRepairValidation.issues,
    });
    const finalThirdDraft = finalizeDraftSafely(
      thirdRepairDraft,
      thirdRepairValidation.issues,
    );
    const finalThirdValidation = validateDraft(finalThirdDraft);
    if (finalThirdValidation.ok) {
      return completeWithOptionalQualityRepair(finalThirdValidation.draft, finalThirdDraft);
    }

    return productSeoAiInvalidOutputError({
      stage: "validation_third_repair",
      generateIssues: firstValidation.issues,
      repairIssues: repairedValidation.issues,
      finalizerIssues: finalizerValidation.issues,
      thirdRepairIssues: finalThirdValidation.issues,
    });
  }

  return completeWithOptionalQualityRepair(repairedValidation.draft, repairedDraft);
}
