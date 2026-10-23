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
