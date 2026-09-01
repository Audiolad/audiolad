import "server-only";

import {
  createProductSeoAiRateLimitStore,
  getProcessProductSeoAiRateLimit,
  type ProductSeoAiRateLimitStore,
} from "@/lib/seo/product-autofill/rate-limit";
import { PRIMARY_QUERY_AI_ERROR_MESSAGES } from "@/lib/seo/primary-query-suggestions/errors";
import {
  buildPrimaryQuerySuggestionsSystemPrompt,
  buildPrimaryQuerySuggestionsUserPrompt,
  PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA,
} from "@/lib/seo/primary-query-suggestions/prompt";
import {
  PRIMARY_QUERY_AI_USER_KEY_PREFIX,
  PRIMARY_QUERY_AI_USER_LIMIT,
  PRIMARY_QUERY_AI_USER_WINDOW_MS,
} from "@/lib/seo/primary-query-suggestions/types";
import type {
  PrimaryQueryAiErrorCode,
  PrimaryQueryAiResult,
  PrimaryQuerySuggestInput,
} from "@/lib/seo/primary-query-suggestions/types";
import {
  parsePrimaryQuerySuggestionsJson,
  sanitizePrimaryQuerySuggestions,
} from "@/lib/seo/primary-query-suggestions/validate";
import { completeYandexStructuredJson } from "@/lib/seo/primary-query-suggestions/yandex-json";

const SAFE_LOG_FIELDS = new Set([
  "provider",
  "model",
  "suggestionCount",
  "durationMs",
  "errorCode",
]);

function fail(code: PrimaryQueryAiErrorCode): PrimaryQueryAiResult {
  return {
    ok: false,
    error: {
      code,
      message: PRIMARY_QUERY_AI_ERROR_MESSAGES[code],
    },
  };
}

function logPrimaryQueryAiEvent(
  event: "primary_query_ai_ok" | "primary_query_ai_failed",
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([field]) => SAFE_LOG_FIELDS.has(field)),
  );
  console.info(event, safe);
}

export function consumePrimaryQueryAiUserRateLimit(
  userId: string,
  store: ProductSeoAiRateLimitStore,
): boolean {
  return store.consume(
    `${PRIMARY_QUERY_AI_USER_KEY_PREFIX}${userId}`,
    PRIMARY_QUERY_AI_USER_LIMIT,
    PRIMARY_QUERY_AI_USER_WINDOW_MS,
  );
}

export async function generatePrimaryQuerySuggestions(
  input: PrimaryQuerySuggestInput,
  options: {
    userId: string;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    rateLimit?: ProductSeoAiRateLimitStore;
  },
): Promise<PrimaryQueryAiResult> {
  const started = Date.now();
  const rateLimit = options.rateLimit ?? getProcessProductSeoAiRateLimit();

  if (!consumePrimaryQueryAiUserRateLimit(options.userId, rateLimit)) {
    logPrimaryQueryAiEvent("primary_query_ai_failed", {
      provider: "yandex",
      model: "",
      suggestionCount: 0,
      durationMs: Date.now() - started,
      errorCode: "RATE_LIMITED",
    });
    return fail("RATE_LIMITED");
  }

  const completion = await completeYandexStructuredJson({
    systemPrompt: buildPrimaryQuerySuggestionsSystemPrompt(),
    userPrompt: buildPrimaryQuerySuggestionsUserPrompt(input),
    jsonSchema: PRIMARY_QUERY_SUGGESTIONS_JSON_SCHEMA,
    env: options.env,
    fetchImpl: options.fetchImpl,
    rateLimit,
  });

  const durationMs = Date.now() - started;

  if (!completion.ok) {
    logPrimaryQueryAiEvent("primary_query_ai_failed", {
      provider: completion.provider,
      model: completion.model,
      suggestionCount: 0,
      durationMs,
      errorCode: completion.errorCode,
    });
    return fail(completion.errorCode);
  }

  let parsedJson: unknown = null;
  try {
    parsedJson = JSON.parse(completion.text);
  } catch {
    parsedJson = null;
  }

  const rawSuggestions = parsePrimaryQuerySuggestionsJson(parsedJson);
  const suggestions = sanitizePrimaryQuerySuggestions(
    rawSuggestions ?? [],
    input.failedSeed,
  );

  if (suggestions.length < 1) {
    logPrimaryQueryAiEvent("primary_query_ai_failed", {
      provider: completion.provider,
      model: completion.model,
      suggestionCount: 0,
      durationMs,
      errorCode: "INVALID_OUTPUT",
    });
    return fail("INVALID_OUTPUT");
  }

  logPrimaryQueryAiEvent("primary_query_ai_ok", {
    provider: completion.provider,
    model: completion.model,
    suggestionCount: suggestions.length,
    durationMs,
  });

  return {
    ok: true,
    suggestions,
    provider: "yandex",
    model: completion.model,
  };
}

export function createPrimaryQueryAiRateLimitStore() {
  return createProductSeoAiRateLimitStore();
}
