import "server-only";

import {
  PRODUCT_SEO_AI_DEFAULT_MODEL,
  PRODUCT_SEO_AI_DEFAULT_PROVIDER,
  PRODUCT_SEO_AI_TIMEOUT_MS,
  PRODUCT_SEO_YANDEX_AI_DEFAULT_MODEL,
  type ProductSeoAiResolvedProvider,
} from "@/lib/seo/product-autofill/types";

export type ProductSeoAiConfig = {
  enabledFlag: boolean;
  provider: ProductSeoAiResolvedProvider;
  apiKeyPresent: boolean;
  folderIdPresent: boolean;
  canCall: boolean;
  model: string;
  timeoutMs: number;
};

function readNonEmptyEnv(
  env: NodeJS.ProcessEnv,
  key: string,
): string | null {
  const raw = env[key]?.trim() ?? "";
  return raw ? raw : null;
}

export function isProductSeoAiEnabledFlag(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PRODUCT_SEO_AI_ENABLED?.trim() === "true";
}

/**
 * Resolve PRODUCT_SEO_AI_PROVIDER.
 * Unset / empty → openai (backward compatible).
 * Unknown values stay "unknown" and must fail-open, never throw.
 */
export function readProductSeoAiProvider(
  env: NodeJS.ProcessEnv = process.env,
): ProductSeoAiResolvedProvider {
  const raw = env.PRODUCT_SEO_AI_PROVIDER?.trim().toLowerCase() ?? "";
  if (!raw) {
    return PRODUCT_SEO_AI_DEFAULT_PROVIDER;
  }

  if (raw === "openai" || raw === "yandex") {
    return raw;
  }

  return "unknown";
}

export function readProductSeoAiApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const provider = readProductSeoAiProvider(env);
  if (provider === "yandex") {
    return readYandexAiApiKey(env);
  }

  if (provider === "openai") {
    return readNonEmptyEnv(env, "OPENAI_API_KEY");
  }

  return null;
}

export function readYandexAiApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "YANDEX_AI_API_KEY");
}

export function readYandexAiFolderId(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "YANDEX_AI_FOLDER_ID");
}

export function readProductSeoAiModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readNonEmptyEnv(env, "PRODUCT_SEO_AI_MODEL") ?? PRODUCT_SEO_AI_DEFAULT_MODEL;
}

export function readYandexAiModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readNonEmptyEnv(env, "YANDEX_AI_MODEL") ?? PRODUCT_SEO_YANDEX_AI_DEFAULT_MODEL;
}

/**
 * Resolve Product SEO Autofill runtime config.
 * Missing or unknown env must not throw. API key and folder id are never returned.
 */
export function getProductSeoAiConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductSeoAiConfig {
  const enabledFlag = isProductSeoAiEnabledFlag(env);
  const provider = readProductSeoAiProvider(env);

  if (provider === "yandex") {
    const apiKey = readYandexAiApiKey(env);
    const folderId = readYandexAiFolderId(env);
    return {
      enabledFlag,
      provider,
      apiKeyPresent: Boolean(apiKey),
      folderIdPresent: Boolean(folderId),
      canCall: enabledFlag && Boolean(apiKey) && Boolean(folderId),
      model: readYandexAiModel(env),
      timeoutMs: PRODUCT_SEO_AI_TIMEOUT_MS,
    };
  }

  if (provider === "unknown") {
    return {
      enabledFlag,
      provider,
      apiKeyPresent: false,
      folderIdPresent: false,
      canCall: false,
      model: "",
      timeoutMs: PRODUCT_SEO_AI_TIMEOUT_MS,
    };
  }

  const apiKey = readNonEmptyEnv(env, "OPENAI_API_KEY");
  return {
    enabledFlag,
    provider: "openai",
    apiKeyPresent: Boolean(apiKey),
    folderIdPresent: false,
    canCall: enabledFlag && Boolean(apiKey),
    model: readProductSeoAiModel(env),
    timeoutMs: PRODUCT_SEO_AI_TIMEOUT_MS,
  };
}
