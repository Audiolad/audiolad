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
  consumeProductSeoAiUserRateLimit,
  getProcessProductSeoAiRateLimit,
  type ProductSeoAiRateLimitStore,
} from "@/lib/seo/product-autofill/rate-limit";
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
  type ProductSeoAiErrorCode,
  type ProductSeoAiRawDraft,
  type ProductSeoAiResult,
  type ProductSeoAutofillRequest,
} from "@/lib/seo/product-autofill/types";

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
    | "final_faq_repair"
    | "deterministic_faq_fallback";
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
  aiRateLimit?: ProductSeoAiRateLimitStore;
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
  return {
    ok: true,
    request: {
      title: record.title,
      subtitle: record.subtitle,
      description: record.description,
      productKind: record.productKind,
      seoPrimaryQuery: record.seoPrimaryQuery,
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

  const aiRateLimit = options.aiRateLimit ?? getProcessProductSeoAiRateLimit();
  if (!consumeProductSeoAiUserRateLimit(options.userId, aiRateLimit)) {
    return productSeoAiError("RATE_LIMITED");
  }

  const manualSecondaryQueries = normalizeManualSecondaryQueries(
    request.seoSecondaryQueries,
    primary,
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
    if (/^(что такое|что значит|зачем|почему)(?=\s|[?.!,:;]|$)/u.test(normalizedQuestion)) {
      return "Это способ спокойно познакомиться с темой и выбрать подходящий для себя ритм.";
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
        faqAnswerIsQuestion(item.answer)
          ? { ...item, answer: deterministicFaqAnswer(item.question) }
          : item,
      ),
    };
  }

  const provider = options.provider ?? createProductSeoAiProvider({ env, config });
  const first = await provider.generate(promptInput);
  if (!first.ok) {
    return first;
  }

  const firstDraft = first.draft;
  const firstValidation = validateProductSeoAiDraft(firstDraft, {
    primaryQuery: primary,
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    usageItems: request.usageItems ?? [],
    manualSecondaryQueries,
  });

  if (firstValidation.ok) {
    return { ok: true, data: firstValidation.draft };
  }

  logProductSeoAiValidationFailed({
    provider: config.provider,
    model: config.model,
    stage: "generate",
    issues: firstValidation.issues,
  });

  const repaired = await provider.repair(
    promptInput,
    first.draft,
    firstValidation.issues,
  );
  if (!repaired.ok) {
    return repaired;
  }

  const repairedDraft = mergeFaqAnswerOnlyRepair(
    repaired.draft,
    firstDraft,
    firstValidation.issues,
  );
  const repairedValidation = validateProductSeoAiDraft(repairedDraft, {
    primaryQuery: primary,
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    usageItems: request.usageItems ?? [],
    manualSecondaryQueries,
  });

  if (!repairedValidation.ok) {
    logProductSeoAiValidationFailed({
      provider: config.provider,
      model: config.model,
      stage: "repair",
      issues: repairedValidation.issues,
    });
    if (hasOnlyFaqAnswerRepairIssues(repairedValidation.issues)) {
      const finalFaqRepaired = await provider.repair(
        promptInput,
        repairedDraft,
        repairedValidation.issues,
      );
      if (!finalFaqRepaired.ok) {
        return finalFaqRepaired;
      }

      const finalFaqRepairedDraft = mergeFaqAnswerOnlyRepair(
        finalFaqRepaired.draft,
        repairedDraft,
        repairedValidation.issues,
      );
      const finalFaqRepairValidation = validateProductSeoAiDraft(
        finalFaqRepairedDraft,
        {
          primaryQuery: primary,
          title: request.title,
          subtitle: request.subtitle,
          description: request.description,
          productKind: request.productKind,
          usageItems: request.usageItems ?? [],
          manualSecondaryQueries,
        },
      );
      if (finalFaqRepairValidation.ok) {
        return { ok: true, data: finalFaqRepairValidation.draft };
      }

      logProductSeoAiValidationFailed({
        provider: config.provider,
        model: config.model,
        stage: "final_faq_repair",
        issues: finalFaqRepairValidation.issues,
      });
      if (
        finalFaqRepairValidation.issues.length === 1 &&
        finalFaqRepairValidation.issues[0] === "faq_answer_is_question"
      ) {
        const deterministicFaqFallbackDraft = applyDeterministicFaqAnswerFallback(
          finalFaqRepairedDraft,
        );
        const deterministicFaqFallbackValidation = validateProductSeoAiDraft(
          deterministicFaqFallbackDraft,
          {
            primaryQuery: primary,
            title: request.title,
            subtitle: request.subtitle,
            description: request.description,
            productKind: request.productKind,
            usageItems: request.usageItems ?? [],
            manualSecondaryQueries,
          },
        );
        if (deterministicFaqFallbackValidation.ok) {
          return { ok: true, data: deterministicFaqFallbackValidation.draft };
        }

        logProductSeoAiValidationFailed({
          provider: config.provider,
          model: config.model,
          stage: "deterministic_faq_fallback",
          issues: deterministicFaqFallbackValidation.issues,
        });
        return productSeoAiInvalidOutputError({
          stage: "validation_deterministic_faq_fallback",
          generateIssues: firstValidation.issues,
          repairIssues: repairedValidation.issues,
          finalFaqRepairIssues: finalFaqRepairValidation.issues,
          deterministicFaqFallbackIssues: deterministicFaqFallbackValidation.issues,
        });
      }
      return productSeoAiInvalidOutputError({
        stage: "validation_final_faq_repair",
        generateIssues: firstValidation.issues,
        repairIssues: repairedValidation.issues,
        finalFaqRepairIssues: finalFaqRepairValidation.issues,
      });
    }

    return productSeoAiInvalidOutputError(
      {
        stage: "validation_repair",
        generateIssues: firstValidation.issues,
        repairIssues: repairedValidation.issues,
      },
    );
  }

  return { ok: true, data: repairedValidation.draft };
}
