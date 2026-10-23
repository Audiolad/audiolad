// Cloud.ru Foundation Models tariff, RUB incl. VAT per 1M tokens (App. 7.EVO.11.2, version 261023).
export const TARIFF = {
  "openai/gpt-oss-120b": { inputPer1M: 15.86, outputPer1M: 61 },
  "Qwen/Qwen3.6-35B-A3B": { inputPer1M: 219.6, outputPer1M: 329.4 },
};

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
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

/** Rough upper estimate of prompt tokens for Russian text (≈2.2 chars per token). */
export function estimatePromptTokens(messages) {
  const chars = messages.reduce((sum, message) => sum + String(message.content).length, 0);
  return Math.ceil(chars / 2.2) + 200;
}

export function formatRub(value) {
  return `${value.toFixed(3).replace(".", ",")} ₽`;
}

/**
 * Strict parsing of --max-rub / --max-tokens. Anything that is not a plain positive number
 * (empty, NaN, "3р", "1e9", Infinity) is refused: a NaN limit would silently disable the budget.
 */
export const MAX_RUB_CEILING = 30;
export const MAX_TOKENS_CEILING = 32000;

export function parseLimits(maxRubRaw, maxTokensRaw) {
  const rubText = String(maxRubRaw ?? "").trim().replace(",", ".");
  const tokensText = String(maxTokensRaw ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(rubText)) throw new Error(`--max-rub: нужно положительное число рублей, получено «${maxRubRaw}»`);
  if (!/^\d+$/.test(tokensText)) throw new Error(`--max-tokens: нужно целое положительное число, получено «${maxTokensRaw}»`);
  const maxRub = Number(rubText);
  const maxTokens = Number(tokensText);
  if (!Number.isFinite(maxRub) || maxRub <= 0 || maxRub > MAX_RUB_CEILING) {
    throw new Error(`--max-rub: допустимо больше 0 и не больше ${MAX_RUB_CEILING} ₽, получено «${maxRubRaw}»`);
  }
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS_CEILING) {
    throw new Error(`--max-tokens: допустимо от 1 до ${MAX_TOKENS_CEILING}, получено «${maxTokensRaw}»`);
  }
  return { maxRub, maxTokens };
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
