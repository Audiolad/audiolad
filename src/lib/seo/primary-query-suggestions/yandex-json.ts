import "server-only";

import {
  getProductSeoAiConfig,
  readYandexAiApiKey,
  readYandexAiFolderId,
} from "@/lib/seo/product-autofill/config";
import { classifyProductSeoAiHttpError } from "@/lib/seo/product-autofill/errors";
import {
  consumeProductSeoAiOutboundSlot,
  getProcessProductSeoAiRateLimit,
  type ProductSeoAiRateLimitStore,
} from "@/lib/seo/product-autofill/rate-limit";
import {
  PRODUCT_SEO_AI_TIMEOUT_MS,
  PRODUCT_SEO_YANDEX_AI_COMPLETION_URL,
} from "@/lib/seo/product-autofill/types";
import {
  buildYandexAiModelUri,
  YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS,
} from "@/lib/seo/product-autofill/yandex-provider";
import { PRIMARY_QUERY_AI_MAX_OUTPUT_TOKENS } from "@/lib/seo/primary-query-suggestions/types";
import type { PrimaryQueryAiErrorCode } from "@/lib/seo/primary-query-suggestions/types";

export type YandexStructuredJsonRequest = {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: object;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  rateLimit?: ProductSeoAiRateLimitStore;
};

export type YandexStructuredJsonResult =
  | { ok: true; text: string; model: string; provider: "yandex" }
  | { ok: false; errorCode: PrimaryQueryAiErrorCode; model: string; provider: "yandex" | "unknown" };

function readYandexFirstAlternative(body: unknown): {
  status: string | null;
  text: string | null;
} | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const result = (body as { result?: unknown }).result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  const alternatives = (result as { alternatives?: unknown }).alternatives;
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    return null;
  }

  const first = alternatives[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return null;
  }

  const rawStatus = (first as { status?: unknown }).status;
  const status = typeof rawStatus === "string" && rawStatus.trim() ? rawStatus : null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { status, text: null };
  }

  const rawText = (message as { text?: unknown }).text;
  const text = typeof rawText === "string" && rawText.trim() ? rawText : null;
  return { status, text };
}

async function requestOnce(
  url: string,
  init: {
    apiKey: string;
    body: string;
    fetchImpl: typeof fetch;
    timeoutMs: number;
  },
): Promise<{
  status: number | null;
  body: unknown;
  errorCode?: "timeout" | "network";
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);

  try {
    const response = await init.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${init.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body,
      signal: controller.signal,
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return { status: response.status, body };
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: string }).name)
        : "";
    if (name === "AbortError") {
      return { status: null, body: null, errorCode: "timeout" };
    }

    return { status: null, body: null, errorCode: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function completeYandexStructuredJson(
  request: YandexStructuredJsonRequest,
): Promise<YandexStructuredJsonResult> {
  const env = request.env ?? process.env;
  const config = getProductSeoAiConfig(env);
  const model = config.model;

  if (!config.enabledFlag) {
    return { ok: false, errorCode: "AI_DISABLED", model, provider: config.provider === "yandex" ? "yandex" : "unknown" };
  }

  if (config.provider !== "yandex") {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_PROVIDER",
      model,
      provider: "unknown",
    };
  }

  const apiKey = readYandexAiApiKey(env);
  const folderId = readYandexAiFolderId(env);
  if (!apiKey || !folderId || !config.canCall) {
    return { ok: false, errorCode: "NOT_CONFIGURED", model, provider: "yandex" };
  }

  const rateLimit = request.rateLimit ?? getProcessProductSeoAiRateLimit();
  if (!consumeProductSeoAiOutboundSlot(rateLimit)) {
    return { ok: false, errorCode: "RATE_LIMITED", model, provider: "yandex" };
  }

  const attempt = await requestOnce(PRODUCT_SEO_YANDEX_AI_COMPLETION_URL, {
    apiKey,
    body: JSON.stringify({
      modelUri: buildYandexAiModelUri(folderId, model),
      completionOptions: {
        stream: false,
        maxTokens: String(PRIMARY_QUERY_AI_MAX_OUTPUT_TOKENS),
      },
      messages: [
        { role: "system", text: request.systemPrompt },
        { role: "user", text: request.userPrompt },
      ],
      jsonSchema: {
        schema: request.jsonSchema,
      },
    }),
    fetchImpl: request.fetchImpl ?? fetch,
    timeoutMs: request.timeoutMs ?? config.timeoutMs ?? PRODUCT_SEO_AI_TIMEOUT_MS,
  });

  if (attempt.status !== 200) {
    const mapped = classifyProductSeoAiHttpError(
      attempt.status,
      attempt.errorCode,
    );
    const errorCode: PrimaryQueryAiErrorCode =
      mapped === "TIMEOUT"
        ? "TIMEOUT"
        : mapped === "RATE_LIMITED"
          ? "RATE_LIMITED"
          : "PROVIDER_ERROR";
    return { ok: false, errorCode, model, provider: "yandex" };
  }

  const alternative = readYandexFirstAlternative(attempt.body);
  if (
    !alternative ||
    alternative.status !== YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS ||
    !alternative.text
  ) {
    return { ok: false, errorCode: "INVALID_OUTPUT", model, provider: "yandex" };
  }

  return { ok: true, text: alternative.text, model, provider: "yandex" };
}
