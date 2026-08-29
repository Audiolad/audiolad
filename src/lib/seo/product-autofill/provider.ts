import "server-only";

import {
  getProductSeoAiConfig,
  readProductSeoAiApiKey,
  type ProductSeoAiConfig,
} from "@/lib/seo/product-autofill/config";
import { productSeoAiError } from "@/lib/seo/product-autofill/errors";
import {
  buildProductSeoRepairPrompt,
  buildProductSeoSystemPrompt,
  buildProductSeoUserPrompt,
  PRODUCT_SEO_AI_JSON_SCHEMA,
  PRODUCT_SEO_AI_SCHEMA_NAME,
  type ProductSeoAiPromptInput,
} from "@/lib/seo/product-autofill/prompt";
import {
  consumeProductSeoAiOutboundSlot,
  getProcessProductSeoAiRateLimit,
  type ProductSeoAiRateLimitStore,
} from "@/lib/seo/product-autofill/rate-limit";
import {
  PRODUCT_SEO_AI_MAX_OUTPUT_TOKENS,
  PRODUCT_SEO_AI_RESPONSES_URL,
  PRODUCT_SEO_AI_STORE,
  PRODUCT_SEO_AI_TIMEOUT_MS,
  type ProductSeoAiErrorCode,
  type ProductSeoAiErrorResult,
  type ProductSeoAiRawDraft,
} from "@/lib/seo/product-autofill/types";
import { parseProductSeoAiRawDraft } from "@/lib/seo/product-autofill/validate";

export type ProductSeoAiProviderResult =
  | { ok: true; draft: ProductSeoAiRawDraft; raw: unknown }
  | ProductSeoAiErrorResult;

export type ProductSeoAiProvider = {
  generate(input: ProductSeoAiPromptInput): Promise<ProductSeoAiProviderResult>;
  repair(
    input: ProductSeoAiPromptInput,
    previous: unknown,
    issues: string[],
  ): Promise<ProductSeoAiProviderResult>;
};

export type ProductSeoAiProviderOptions = {
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
]);

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

function extractOutputText(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text;
  }

  if (!Array.isArray(record.output)) {
    return null;
  }

  for (const item of record.output) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        continue;
      }

      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return text;
      }
    }
  }

  return null;
}

function parseDraftFromText(text: string): ProductSeoAiRawDraft | null {
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
): Promise<{ status: number | null; body: unknown; errorCode?: "timeout" | "network" }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);

  try {
    const response = await init.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${init.apiKey}`,
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

function classifyHttpError(
  status: number | null,
  requestError?: "timeout" | "network",
): ProductSeoAiErrorCode {
  if (requestError === "timeout") {
    return "TIMEOUT";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  return "PROVIDER_ERROR";
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

export function createProductSeoAiProvider(
  options: ProductSeoAiProviderOptions = {},
): ProductSeoAiProvider {
  const env = options.env ?? process.env;
  const config = options.config ?? getProductSeoAiConfig(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? PRODUCT_SEO_AI_TIMEOUT_MS;
  const rateLimit = options.rateLimit ?? getProcessProductSeoAiRateLimit();

  async function callModel(
    prompts: { systemPrompt: string; userPrompt: string },
    kind: "generate" | "repair",
  ): Promise<ProductSeoAiProviderResult> {
    const { systemPrompt, userPrompt } = prompts;
    const apiKey = readProductSeoAiApiKey(env);
    if (!apiKey) {
      return productSeoAiError("NOT_CONFIGURED");
    }

    if (!consumeProductSeoAiOutboundSlot(rateLimit)) {
      return productSeoAiError("RATE_LIMITED");
    }

    const requestBody = JSON.stringify({
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
          name: PRODUCT_SEO_AI_SCHEMA_NAME,
          strict: true,
          schema: PRODUCT_SEO_AI_JSON_SCHEMA,
        },
      },
    });

    const attempt = await requestOnce(PRODUCT_SEO_AI_RESPONSES_URL, {
      apiKey,
      body: requestBody,
      fetchImpl,
      timeoutMs,
    });

    if (attempt.status !== 200) {
      const code = classifyHttpError(attempt.status, attempt.errorCode);
      logAiEvent("responses_failed", {
        status: attempt.status,
        error: code,
        kind,
        model: config.model,
      });
      return productSeoAiError(code);
    }

    const text = extractOutputText(attempt.body);
    const draft = text ? parseDraftFromText(text) : parseProductSeoAiRawDraft(attempt.body);
    if (!draft) {
      logAiEvent("responses_invalid", {
        kind,
        model: config.model,
      });
      return productSeoAiError("INVALID_OUTPUT", ["malformed"]);
    }

    const result = { ok: true as const, draft, raw: attempt.body };
    if (resultContainsSecret(result, apiKey)) {
      return productSeoAiError("PROVIDER_ERROR");
    }

    logAiEvent("responses_ok", {
      kind,
      model: config.model,
    });
    return result;
  }

  return {
    generate(input) {
      return callModel(
        {
          systemPrompt: buildProductSeoSystemPrompt(input),
          userPrompt: buildProductSeoUserPrompt(input),
        },
        "generate",
      );
    },
    repair(input, previous, issues) {
      return callModel(
        {
          systemPrompt: buildProductSeoSystemPrompt(input),
          userPrompt: buildProductSeoRepairPrompt(input, previous, issues),
        },
        "repair",
      );
    },
  };
}
