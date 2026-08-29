import "server-only";

import { PRODUCT_SEO_AI_DEFAULT_MODEL, PRODUCT_SEO_AI_TIMEOUT_MS } from "@/lib/seo/product-autofill/types";

export type ProductSeoAiConfig = {
  enabledFlag: boolean;
  apiKeyPresent: boolean;
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

export function readProductSeoAiApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return readNonEmptyEnv(env, "OPENAI_API_KEY");
}

export function readProductSeoAiModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return readNonEmptyEnv(env, "PRODUCT_SEO_AI_MODEL") ?? PRODUCT_SEO_AI_DEFAULT_MODEL;
}

/**
 * Resolve Product SEO Autofill runtime config.
 * Missing env must not throw. API key is never returned.
 */
export function getProductSeoAiConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductSeoAiConfig {
  const enabledFlag = isProductSeoAiEnabledFlag(env);
  const apiKey = readProductSeoAiApiKey(env);

  return {
    enabledFlag,
    apiKeyPresent: Boolean(apiKey),
    canCall: enabledFlag && Boolean(apiKey),
    model: readProductSeoAiModel(env),
    timeoutMs: PRODUCT_SEO_AI_TIMEOUT_MS,
  };
}
