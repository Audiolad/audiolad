import "server-only";

import { PRODUCT_CONTENT_LIMITS } from "@/lib/author-products/limits";
import {
  getProductSeoAiConfig,
  type ProductSeoAiConfig,
} from "@/lib/seo/product-autofill/config";
import { productSeoAiError } from "@/lib/seo/product-autofill/errors";
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
import { canonicalizeYandexSecondaryQueries } from "@/lib/seo/product-autofill/canonicalize-secondaries";
import { eligibleSecondaryCandidates } from "@/lib/seo/product-autofill/select-secondaries";
import {
  createDefaultProductSeoStyleProfile,
  requestHasForbiddenStyleKeys,
  sanitizeProductSeoStyleProfile,
} from "@/lib/seo/product-autofill/style-profile";
import {
  normalizeProductSeoValidationIssues,
  validateProductSeoAiDraft,
} from "@/lib/seo/product-autofill/validate";
import {
  type ProductSeoAiErrorCode,
  type ProductSeoAiRawDraft,
  type ProductSeoAiResult,
  type ProductSeoAutofillRequest,
} from "@/lib/seo/product-autofill/types";
import {
  fetchWordstatSuggestions,
  type WordstatClientOptions,
} from "@/lib/seo/wordstat/client";
import type { WordstatCacheStore } from "@/lib/seo/wordstat/cache";
import { wordstatPhraseKey } from "@/lib/seo/wordstat/phrase";
import type { WordstatRateLimitStore } from "@/lib/seo/wordstat/rate-limit";
import type { WordstatSuggestion } from "@/lib/seo/wordstat/types";

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
  stage: "generate" | "repair";
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
  wordstat?: {
    fetchImpl?: WordstatClientOptions["fetchImpl"];
    cache?: WordstatCacheStore;
    rateLimit?: WordstatRateLimitStore;
    env?: NodeJS.ProcessEnv;
  };
  aiRateLimit?: ProductSeoAiRateLimitStore;
  wordstatSuggestions?: WordstatSuggestion[];
};

export type ParseProductSeoAutofillRequestResult =
  | { ok: true; request: ProductSeoAutofillRequest }
  | { ok: false; code: Extract<ProductSeoAiErrorCode, "INVALID_PRIMARY" | "INVALID_STYLE_PROFILE"> };

export function normalizeLockedSecondaryQueries(
  value: unknown,
  primaryQuery: string,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const primaryKey = wordstatPhraseKey(primaryQuery);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const phrase = item.trim().replace(/\s+/g, " ");
    const key = wordstatPhraseKey(phrase);
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
  const seoSecondaryQueries = normalizeLockedSecondaryQueries(
    record.seoSecondaryQueries,
    record.seoPrimaryQuery,
  );
  const locked = record.locked === true && seoSecondaryQueries.length > 0;

  return {
    ok: true,
    request: {
      title: record.title,
      subtitle: record.subtitle,
      description: record.description,
      productKind: record.productKind,
      seoPrimaryQuery: record.seoPrimaryQuery,
      seoSecondaryQueries,
      locked,
      usageItems,
      styleProfile: style.profile,
      mode: record.mode === "field" ? "field" : "full",
      fields: Array.isArray(record.fields)
        ? record.fields.filter(
            (item): item is NonNullable<ProductSeoAutofillRequest["fields"]>[number] =>
              item === "title" ||
              item === "description" ||
              item === "faq" ||
              item === "usage" ||
              item === "secondaries",
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

async function loadWordstatCandidates(
  primaryQuery: string,
  options: GenerateProductSeoDraftOptions,
): Promise<WordstatSuggestion[]> {
  if (options.wordstatSuggestions) {
    return options.wordstatSuggestions;
  }

  const result = await fetchWordstatSuggestions(primaryQuery, {
    userId: options.userId,
    fetchImpl: options.wordstat?.fetchImpl,
    cache: options.wordstat?.cache,
    rateLimit: options.wordstat?.rateLimit,
    env: options.wordstat?.env ?? options.env,
  });

  if (!result.ok) {
    return [];
  }

  return result.data.suggestions;
}

export async function generateProductSeoDraft(
  request: ProductSeoAutofillRequest,
  options: GenerateProductSeoDraftOptions,
): Promise<ProductSeoAiResult> {
  const primary = request.seoPrimaryQuery.trim();
  if (!primary) {
    return productSeoAiError("MISSING_PRIMARY");
  }

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

  const lockedSecondaryQueries =
    request.locked === true
      ? normalizeLockedSecondaryQueries(request.seoSecondaryQueries, primary)
      : [];
  const suggestions = lockedSecondaryQueries.length
    ? []
    : await loadWordstatCandidates(primary, options);
  const candidates = eligibleSecondaryCandidates(suggestions, primary);
  const styleProfile =
    request.styleProfile ?? createDefaultProductSeoStyleProfile();
  const promptInput: ProductSeoAiPromptInput = {
    request: {
      ...request,
      seoPrimaryQuery: primary,
      seoSecondaryQueries: lockedSecondaryQueries,
      locked: lockedSecondaryQueries.length > 0,
      styleProfile,
    },
    candidates,
    lockedSecondaryQueries,
  };

  function mergeSecondaryQueries(
    draft: ProductSeoAiRawDraft,
  ): ProductSeoAiRawDraft {
    const generatedSecondaryQueries =
      config.provider === "yandex"
        ? canonicalizeYandexSecondaryQueries(draft.secondaryQueries, candidates)
        : draft.secondaryQueries;

    if (lockedSecondaryQueries.length > 0) {
      return {
        ...draft,
        secondaryQueries: lockedSecondaryQueries,
      };
    }

    if (config.provider !== "yandex") {
      return draft;
    }

    return {
      ...draft,
      secondaryQueries: generatedSecondaryQueries,
    };
  }

  const provider = options.provider ?? createProductSeoAiProvider({ env, config });
  const first = await provider.generate(promptInput);
  if (!first.ok) {
    return first;
  }

  const firstDraft = mergeSecondaryQueries(first.draft);
  const firstValidation = validateProductSeoAiDraft(firstDraft, {
    primaryQuery: primary,
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    usageItems: request.usageItems ?? [],
    candidates,
    lockedSecondaryQueries,
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

  const repairedDraft = mergeSecondaryQueries(repaired.draft);
  const repairedValidation = validateProductSeoAiDraft(repairedDraft, {
    primaryQuery: primary,
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    usageItems: request.usageItems ?? [],
    candidates,
    lockedSecondaryQueries,
  });

  if (!repairedValidation.ok) {
    logProductSeoAiValidationFailed({
      provider: config.provider,
      model: config.model,
      stage: "repair",
      issues: repairedValidation.issues,
    });
    return productSeoAiError("INVALID_OUTPUT", repairedValidation.issues);
  }

  return { ok: true, data: repairedValidation.draft };
}
