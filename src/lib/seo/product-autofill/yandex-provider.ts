import "server-only";

import {
  readYandexAiApiKey,
  readYandexAiFolderId,
  type ProductSeoAiConfig,
} from "@/lib/seo/product-autofill/config";
import {
  classifyProductSeoAiHttpError,
  productSeoAiError,
} from "@/lib/seo/product-autofill/errors";
import {
  buildProductSeoRepairPrompt,
  buildProductSeoSystemPrompt,
  buildProductSeoUserPrompt,
  PRODUCT_SEO_AI_JSON_SCHEMA,
  type ProductSeoAiPromptInput,
} from "@/lib/seo/product-autofill/prompt";
import {
  consumeProductSeoAiOutboundSlot,
  getProcessProductSeoAiRateLimit,
  type ProductSeoAiRateLimitStore,
} from "@/lib/seo/product-autofill/rate-limit";
import {
  PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS,
  PRODUCT_SEO_AI_TIMEOUT_MS,
  PRODUCT_SEO_YANDEX_AI_COMPLETION_URL,
  PRODUCT_SEO_YANDEX_AI_DEFAULT_MODEL,
  type ProductSeoAiErrorCode,
  type ProductSeoAiErrorResult,
  type ProductSeoAiRawDraft,
} from "@/lib/seo/product-autofill/types";
import { parseProductSeoAiRawDraft } from "@/lib/seo/product-autofill/validate";

export type YandexProductSeoAiProviderResult =
  | { ok: true; draft: ProductSeoAiRawDraft; raw: unknown }
  | ProductSeoAiErrorResult;

export type YandexProductSeoAiProvider = {
  generate(input: ProductSeoAiPromptInput): Promise<YandexProductSeoAiProviderResult>;
  repair(
    input: ProductSeoAiPromptInput,
    previous: unknown,
    issues: string[],
  ): Promise<YandexProductSeoAiProviderResult>;
};

export type YandexProductSeoAiProviderOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  config?: ProductSeoAiConfig;
  rateLimit?: ProductSeoAiRateLimitStore;
};

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
]);

export const YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS = "ALTERNATIVE_STATUS_FINAL";

export function buildYandexAiModelUri(folderId: string, modelId: string): string {
  return `gpt://${folderId}/${modelId}/latest`;
}

function logAiEvent(
  message: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(
      ([field]) => !BLOCKED_LOG_FIELDS.has(field.toLowerCase()),
    ),
  );
  console.info(`[product-seo-ai] ${message}`, safe);
}

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

function parseDraftFromJsonText(text: string): ProductSeoAiRawDraft | null {
  try {
    return parseProductSeoAiRawDraft(JSON.parse(text));
  } catch {
    return null;
  }
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
  latencyMs: number;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  const started = Date.now();

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

    return { status: response.status, body, latencyMs: Date.now() - started };
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: string }).name)
        : "";
    if (name === "AbortError") {
      return {
        status: null,
        body: null,
        errorCode: "timeout",
        latencyMs: Date.now() - started,
      };
    }

    return {
      status: null,
      body: null,
      errorCode: "network",
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

function resultContainsSecret(value: unknown, secret: string | null): boolean {
  if (!secret) {
    return false;
  }

  try {
    return JSON.stringify(value).includes(secret);
  } catch {
    return false;
  }
}

function fail(
  code: ProductSeoAiErrorCode,
  issues?: string[],
): ProductSeoAiErrorResult {
  return productSeoAiError(code, issues);
}

export function createYandexProductSeoAiProvider(
  options: YandexProductSeoAiProviderOptions = {},
): YandexProductSeoAiProvider {
  const env = options.env ?? process.env;
  const config = options.config as ProductSeoAiConfig | undefined;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? config?.timeoutMs ?? PRODUCT_SEO_AI_TIMEOUT_MS;
  const rateLimit: ProductSeoAiRateLimitStore =
    options.rateLimit ?? getProcessProductSeoAiRateLimit();
  const model = config?.model ?? PRODUCT_SEO_YANDEX_AI_DEFAULT_MODEL;

  async function callModel(
    prompts: { systemPrompt: string; userPrompt: string },
    kind: "generate" | "repair",
    input: ProductSeoAiPromptInput,
  ): Promise<YandexProductSeoAiProviderResult> {
    const apiKey = readYandexAiApiKey(env);
    const folderId = readYandexAiFolderId(env);
    if (!apiKey || !folderId) {
      return fail("NOT_CONFIGURED");
    }

    if (!consumeProductSeoAiOutboundSlot(rateLimit)) {
      return fail("RATE_LIMITED");
    }

    const modelUri = buildYandexAiModelUri(folderId, model);
    const requestBody = JSON.stringify({
      modelUri,
      completionOptions: {
        stream: false,
        maxTokens: String(PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS),
      },
      messages: [
        { role: "system", text: prompts.systemPrompt },
        { role: "user", text: prompts.userPrompt },
      ],
      jsonSchema: {
        schema: PRODUCT_SEO_AI_JSON_SCHEMA,
      },
    });

    const attempt = await requestOnce(PRODUCT_SEO_YANDEX_AI_COMPLETION_URL, {
      apiKey,
      body: requestBody,
      fetchImpl,
      timeoutMs,
    });

    if (attempt.status !== 200) {
      const code = classifyProductSeoAiHttpError(attempt.status, attempt.errorCode);
      logAiEvent("yandex_completion_failed", {
        provider: "yandex",
        model,
        status: attempt.status,
        error: code,
        kind,
        latencyMs: attempt.latencyMs,
      });
      return fail(code);
    }

    const alternative = readYandexFirstAlternative(attempt.body);
    if (!alternative || alternative.status !== YANDEX_AI_ACCEPTED_ALTERNATIVE_STATUS) {
      logAiEvent("yandex_completion_invalid", {
        provider: "yandex",
        model,
        status: alternative?.status ?? "missing",
        kind,
        error: "INVALID_OUTPUT",
      });
      return fail("INVALID_OUTPUT", ["malformed"]);
    }

    const text = alternative.text;
    if (!text) {
      logAiEvent("yandex_completion_invalid", {
        provider: "yandex",
        model,
        status: alternative.status,
        kind,
        error: "INVALID_OUTPUT",
      });
      return fail("INVALID_OUTPUT", ["malformed"]);
    }

    const draft = parseDraftFromJsonText(text);
    if (!draft) {
      logAiEvent("yandex_completion_invalid", {
        provider: "yandex",
        model,
        status: attempt.status,
        error: "INVALID_OUTPUT",
        kind,
        latencyMs: attempt.latencyMs,
      });
      return fail("INVALID_OUTPUT", ["malformed"]);
    }

    const result = { ok: true as const, draft, raw: attempt.body };
    if (resultContainsSecret(result, apiKey)) {
      return fail("PROVIDER_ERROR");
    }

    logAiEvent("yandex_completion_ok", {
      provider: "yandex",
      model,
      status: attempt.status,
      kind,
      latencyMs: attempt.latencyMs,
    });
    return result;
  }

  return {
    generate(input: ProductSeoAiPromptInput) {
      return callModel(
        {
          systemPrompt: buildProductSeoSystemPrompt(input),
          userPrompt: buildProductSeoUserPrompt(input),
        },
        "generate",
        input,
      );
    },
    repair(input, previous, issues) {
      return callModel(
        {
          systemPrompt: buildProductSeoSystemPrompt(input),
          userPrompt: buildProductSeoRepairPrompt(input, previous, issues),
        },
        "repair",
        input,
      );
    },
  };
}
