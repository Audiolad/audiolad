import "server-only";

import {
  getProductSeoAiConfig,
  readProductSeoAiApiKey,
  readYandexAiApiKey,
  readYandexAiFolderId,
  type ProductSeoAiConfig,
} from "@/lib/seo/product-autofill/config";
import {
  classifyProductSeoAiHttpError,
  productSeoAiContentFilteredError,
  productSeoAiError,
} from "@/lib/seo/product-autofill/errors";
import {
  PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS,
  PRODUCT_SEO_AI_RESPONSES_URL,
  PRODUCT_SEO_AI_STORE,
  PRODUCT_SEO_AI_TIMEOUT_MS,
  PRODUCT_SEO_YANDEX_AI_COMPLETION_URL,
  type ProductSeoAiErrorResult,
} from "@/lib/seo/product-autofill/types";
import {
  YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS,
  YANDEX_AI_CONTENT_FILTER_STATUS,
  buildYandexAiModelUri,
  readYandexFirstAlternative,
} from "@/lib/seo/product-autofill/yandex-provider";
import {
  buildProductQualityReviewSystemPrompt,
  buildProductQualityReviewUserPrompt,
  PRODUCT_QUALITY_REVIEW_JSON_SCHEMA,
  PRODUCT_QUALITY_REVIEW_SCHEMA_NAME,
} from "@/lib/seo/product-quality-review/prompt";
import type {
  ProductQualityReviewPackage,
  ProductQualityReviewResult,
  ProductQualityReviewSignals,
} from "@/lib/seo/product-quality-review/types";
import { parseProductQualityReviewResult } from "@/lib/seo/product-quality-review/validate";

export type ProductQualityReviewProviderResult =
  | { ok: true; result: ProductQualityReviewResult }
  | ProductSeoAiErrorResult;

export type ProductQualityReviewProviderOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  config?: ProductSeoAiConfig;
};

function logReviewEvent(
  message: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  console.info(`[product-quality-review] ${message}`, fields);
}

async function requestOnce(
  url: string,
  init: {
    headers: Record<string, string>;
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
      headers: init.headers,
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

function extractOpenAiOutputText(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }
  if (!Array.isArray(record.output)) return null;
  for (const item of record.output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  return null;
}

function parseResultFromText(text: string): ProductQualityReviewResult | null {
  try {
    return parseProductQualityReviewResult(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function runProductQualityReviewModel(input: {
  package: ProductQualityReviewPackage;
  signals: ProductQualityReviewSignals;
  options?: ProductQualityReviewProviderOptions;
}): Promise<ProductQualityReviewProviderResult> {
  const options = input.options ?? {};
  const env = options.env ?? process.env;
  const config = options.config ?? getProductSeoAiConfig(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs =
    options.timeoutMs ?? config.timeoutMs ?? PRODUCT_SEO_AI_TIMEOUT_MS;

  if (!config.enabledFlag || !config.canCall || config.provider === "unknown") {
    return productSeoAiError(
      config.enabledFlag ? "NOT_CONFIGURED" : "AI_DISABLED",
    );
  }

  const systemPrompt = buildProductQualityReviewSystemPrompt();
  const userPrompt = buildProductQualityReviewUserPrompt({
    package: input.package,
    signals: input.signals,
  });
  const started = Date.now();

  if (config.provider === "openai") {
    const apiKey = readProductSeoAiApiKey(env);
    if (!apiKey) return productSeoAiError("NOT_CONFIGURED");

    const attempt = await requestOnce(PRODUCT_SEO_AI_RESPONSES_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: PRODUCT_SEO_AI_STORE,
        max_output_tokens: PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        text: {
          format: {
            type: "json_schema",
            name: PRODUCT_QUALITY_REVIEW_SCHEMA_NAME,
            strict: true,
            schema: PRODUCT_QUALITY_REVIEW_JSON_SCHEMA,
          },
        },
      }),
      fetchImpl,
      timeoutMs,
    });

    if (attempt.status !== 200) {
      const code = classifyProductSeoAiHttpError(
        attempt.status,
        attempt.errorCode,
      );
      logReviewEvent("provider_failed", {
        provider: "openai",
        status: attempt.status,
        error: code,
        durationMs: Date.now() - started,
      });
      return productSeoAiError(code);
    }

    const text = extractOpenAiOutputText(attempt.body);
    const result = text
      ? parseResultFromText(text)
      : parseProductQualityReviewResult(attempt.body);
    if (!result) {
      logReviewEvent("provider_invalid", {
        provider: "openai",
        error: "INVALID_OUTPUT",
        durationMs: Date.now() - started,
      });
      return productSeoAiError("PROVIDER_ERROR");
    }

    logReviewEvent("provider_ok", {
      provider: "openai",
      status: result.status,
      issueCount: result.issues.length,
      durationMs: Date.now() - started,
    });
    return { ok: true, result };
  }

  // Canonical Yandex Product SEO completion contract (same as autofill).
  const apiKey = readYandexAiApiKey(env);
  const folderId = readYandexAiFolderId(env);
  if (!apiKey || !folderId) return productSeoAiError("NOT_CONFIGURED");

  const modelUri = buildYandexAiModelUri(folderId, config.model);
  const attempt = await requestOnce(PRODUCT_SEO_YANDEX_AI_COMPLETION_URL, {
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      modelUri,
      completionOptions: {
        stream: false,
        maxTokens: String(PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS),
      },
      messages: [
        { role: "system", text: systemPrompt },
        { role: "user", text: userPrompt },
      ],
      jsonSchema: {
        schema: PRODUCT_QUALITY_REVIEW_JSON_SCHEMA,
      },
    }),
    fetchImpl,
    timeoutMs,
  });

  if (attempt.status !== 200) {
    const code = classifyProductSeoAiHttpError(
      attempt.status,
      attempt.errorCode,
    );
    logReviewEvent("provider_failed", {
      provider: "yandex",
      status: attempt.status,
      error: code,
      durationMs: Date.now() - started,
    });
    return productSeoAiError(code);
  }

  const alternative = readYandexFirstAlternative(attempt.body);
  if (
    !alternative ||
    alternative.status !== YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS
  ) {
    if (alternative?.status === YANDEX_AI_CONTENT_FILTER_STATUS) {
      logReviewEvent("provider_content_filtered", {
        provider: "yandex",
        status: alternative.status,
        durationMs: Date.now() - started,
      });
      return productSeoAiContentFilteredError({
        providerStatus: alternative.status,
      });
    }
    logReviewEvent("provider_invalid", {
      provider: "yandex",
      error: "INVALID_OUTPUT",
      status: alternative?.status ?? "missing",
      durationMs: Date.now() - started,
    });
    return productSeoAiError("PROVIDER_ERROR");
  }

  const text = alternative.text;
  const result = text ? parseResultFromText(text) : null;
  if (!result) {
    logReviewEvent("provider_invalid", {
      provider: "yandex",
      error: "INVALID_OUTPUT",
      durationMs: Date.now() - started,
    });
    return productSeoAiError("PROVIDER_ERROR");
  }

  logReviewEvent("provider_ok", {
    provider: "yandex",
    status: result.status,
    issueCount: result.issues.length,
    durationMs: Date.now() - started,
  });
  return { ok: true, result };
}
