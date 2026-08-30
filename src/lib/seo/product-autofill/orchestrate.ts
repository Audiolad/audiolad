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
import { eligibleSecondaryCandidates } from "@/lib/seo/product-autofill/select-secondaries";
import {
  createDefaultProductSeoStyleProfile,
  requestHasForbiddenStyleKeys,
  sanitizeProductSeoStyleProfile,
} from "@/lib/seo/product-autofill/style-profile";
import { validateProductSeoAiDraft } from "@/lib/seo/product-autofill/validate";
import {
  type ProductSeoAiErrorCode,
  type ProductSeoAiResult,
  type ProductSeoAutofillRequest,
} from "@/lib/seo/product-autofill/types";
import {
  fetchWordstatSuggestions,
  type WordstatClientOptions,
} from "@/lib/seo/wordstat/client";
import type { WordstatCacheStore } from "@/lib/seo/wordstat/cache";
import type { WordstatRateLimitStore } from "@/lib/seo/wordstat/rate-limit";
import type { WordstatSuggestion } from "@/lib/seo/wordstat/types";

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

  return {
    ok: true,
    request: {
      title: record.title,
      subtitle: record.subtitle,
      description: record.description,
      productKind: record.productKind,
      seoPrimaryQuery: record.seoPrimaryQuery,
      usageItems,
      styleProfile: style.profile,
      mode: record.mode === "field" ? "field" : "full",
      fields: Array.isArray(record.fields)
        ? record.fields.filter(
            (item): item is NonNullable<ProductSeoAutofillRequest["fields"]>[number] =>
              item === "title" ||
              item === "description" ||
              item === "about" ||
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

  const suggestions = await loadWordstatCandidates(primary, options);
  const candidates = eligibleSecondaryCandidates(suggestions, primary);
  const styleProfile =
    request.styleProfile ?? createDefaultProductSeoStyleProfile();
  const promptInput: ProductSeoAiPromptInput = {
    request: {
      ...request,
      seoPrimaryQuery: primary,
      styleProfile,
    },
    candidates,
  };

  const provider = options.provider ?? createProductSeoAiProvider({ env, config });
  const first = await provider.generate(promptInput);
  if (!first.ok) {
    return first;
  }

  const firstValidation = validateProductSeoAiDraft(first.draft, {
    primaryQuery: primary,
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    usageItems: request.usageItems ?? [],
    candidates,
  });

  if (firstValidation.ok) {
    return { ok: true, data: firstValidation.draft };
  }

  const repaired = await provider.repair(
    promptInput,
    first.draft,
    firstValidation.issues,
  );
  if (!repaired.ok) {
    return repaired;
  }

  const repairedValidation = validateProductSeoAiDraft(repaired.draft, {
    primaryQuery: primary,
    title: request.title,
    subtitle: request.subtitle,
    description: request.description,
    productKind: request.productKind,
    usageItems: request.usageItems ?? [],
    candidates,
  });

  if (!repairedValidation.ok) {
    return productSeoAiError("INVALID_OUTPUT", repairedValidation.issues);
  }

  return { ok: true, data: repairedValidation.draft };
}
