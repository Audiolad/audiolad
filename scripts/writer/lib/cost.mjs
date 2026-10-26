// Cloud.ru Foundation Models tariff, RUB incl. VAT per 1M tokens (App. 7.EVO.11.2, version 261023).
export const TARIFF = {
  "openai/gpt-oss-120b": { inputPer1M: 15.86, outputPer1M: 61 },
  "Qwen/Qwen3.6-35B-A3B": { inputPer1M: 219.6, outputPer1M: 329.4 },
  // Stronger models for the sz model trial (c62ac1d5), prices from GET /v1/models metadata, 2026-10-24.
  "anthropic/claude-opus-4.8": { inputPer1M: 854, outputPer1M: 4270 },
  // GET /v1/models Cloud.ru, 2026-10-24, models-prices.tsv; RUB incl. VAT per 1M tokens.
  "openai/gpt-5.4-mini": { inputPer1M: 147.315, outputPer1M: 883.89 },
  "openai/gpt-5.5": { inputPer1M: 854, outputPer1M: 5124 },
  "google/gemini-3.1-pro-preview": { inputPer1M: 341.6, outputPer1M: 2049.6 },
  "deepseek-ai/DeepSeek-V4-Pro": { inputPer1M: 183, outputPer1M: 732 },
};

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
// --site sz default: winner of the pack-07 model trial (c62ac1d5): 0 gate errors on 5/5, ≈300 ₽ per pack.
export const SZ_DEFAULT_MODEL = "openai/gpt-5.5";

/** Model for a run: an explicit --model wins, otherwise the site default. */
export function defaultModelFor(site, explicit) {
  if (explicit) return explicit;
  return site === "sz" ? SZ_DEFAULT_MODEL : DEFAULT_MODEL;
}
export const SUPPORTED_MODELS = Object.keys(TARIFF);

export function costRub(model, promptTokens, completionTokens) {
  const tariff = TARIFF[model];
  if (!tariff) {
    throw new Error(`Нет тарифа для модели ${model}`);
  }
  return (promptTokens * tariff.inputPer1M + completionTokens * tariff.outputPer1M) / 1e6;
}

/** Worst-case cost of one call: every requested completion token is billed. */
export function worstCaseRub(model, estimatedPromptTokens, maxTokens) {
  return costRub(model, estimatedPromptTokens, maxTokens);
}

/**
 * Rough upper estimate of prompt tokens for Russian text: ≈2.2 chars per token for o200k-like
 * tokenizers; Claude's tokenizer splits Russian much finer (smoke 2026-10-24: 406 vs 170 tokens), ≈1.3.
 */
export function charsPerToken(model = "") {
  return String(model).startsWith("anthropic/") ? 1.3 : 2.2;
}

export function estimatePromptTokens(messages, model) {
  const chars = messages.reduce((sum, message) => sum + String(message.content).length, 0);
  return Math.ceil(chars / charsPerToken(model)) + 200;
}

export function formatRub(value) {
  return `${value.toFixed(3).replace(".", ",")} ₽`;
}

/**
 * Strict parsing of --max-rub / --max-tokens. Anything that is not a plain positive number
 * (empty, NaN, "3р", "1e9", Infinity) is refused: a NaN limit would silently disable the budget.
 */
export const MAX_RUB_CEILING = 800;
export const MAX_TOKENS_CEILING = 32000;

/** Rouble limit: a positive finite number ≤ MAX_RUB_CEILING (CLI string like «3» or «2,5», or a JSON number). */
export function parseMaxRub(raw, label = "--max-rub") {
  const text = typeof raw === "number" ? String(raw) : String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(`${label}: нужно положительное число рублей, получено «${raw}»`);
  const maxRub = Number(text);
  if (!Number.isFinite(maxRub) || maxRub <= 0 || maxRub > MAX_RUB_CEILING) {
    throw new Error(`${label}: допустимо больше 0 и не больше ${MAX_RUB_CEILING} ₽, получено «${raw}»`);
  }
  return maxRub;
}

export function parseLimits(maxRubRaw, maxTokensRaw) {
  const maxRub = parseMaxRub(maxRubRaw);
  return { maxRub, maxTokens: parseMaxTokens(maxTokensRaw) };
}

export function parseMaxTokens(maxTokensRaw, label = "--max-tokens") {
  const tokensText = String(maxTokensRaw ?? "").trim();
  if (!/^\d+$/.test(tokensText)) throw new Error(`${label}: нужно целое положительное число, получено «${maxTokensRaw}»`);
  const maxTokens = Number(tokensText);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS_CEILING) {
    throw new Error(`${label}: допустимо от 1 до ${MAX_TOKENS_CEILING}, получено «${maxTokensRaw}»`);
  }
  return maxTokens;
}

/**
 * Cost charged against the budget for one call. Without a numeric cost from meta.json
 * (ssh dropped, timeout, HTTP error, broken meta) the request may still have been billed,
 * so the worst case (prompt estimate + max_tokens at the output tariff) is charged.
 */
export function chargedCost(meta, worstRub) {
  const reported = meta?.cost_rub;
  if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) return { cost: reported, estimated: false };
  return { cost: worstRub, estimated: true };
}
