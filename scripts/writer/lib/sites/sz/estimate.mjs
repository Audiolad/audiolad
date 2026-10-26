// Offline cost comparison. Reads models-prices.tsv. Does not call Cloud.ru.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODEL_PRICES_PATH = join(here, "../../../models-prices.tsv");

// Profile of one article: draft of ~1000 words plus three fragment repairs.
// Prompt size matches the offline angel full prompt (~25k tokens). Output of a
// full gpt-5.5 article that passes is ~8k tokens (~60 ₽ at the tsv tariff).
export const TIERED_COST_PROFILE = {
  draftPromptTokens: 25000,
  draftOutputTokens: 6000,
  cheapCalls: 3,
  cheapPromptTokens: 1200,
  cheapOutputTokens: 500,
  strongCalls: 0,
  strongPromptTokens: 1200,
  strongOutputTokens: 700,
};

export function loadModelPrices(file = MODEL_PRICES_PATH) {
  const prices = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("model\t")) continue;
    const [model, input, output] = trimmed.split("\t");
    if (!model || input === undefined || output === undefined) continue;
    prices[model] = { inputPer1M: Number(input), outputPer1M: Number(output) };
  }
  return prices;
}

export function estimateCallRub(prices, model, promptTokens, completionTokens) {
  const tariff = prices[model];
  if (!tariff) throw new Error(`Нет цены для модели ${model} в models-prices.tsv`);
  return (promptTokens * tariff.inputPer1M + completionTokens * tariff.outputPer1M) / 1e6;
}

/** One finished article: draft + cheap fragment calls + optional strong fragment calls. */
export function estimateTieredArticle(prices, { draftModel, cheapModel, strongModel, ...profile }) {
  const plan = { ...TIERED_COST_PROFILE, ...profile };
  const draft = estimateCallRub(prices, draftModel, plan.draftPromptTokens, plan.draftOutputTokens);
  const cheap = plan.cheapCalls * estimateCallRub(prices, cheapModel, plan.cheapPromptTokens, plan.cheapOutputTokens);
  const strong = plan.strongCalls * estimateCallRub(prices, strongModel, plan.strongPromptTokens, plan.strongOutputTokens);
  return { draftModel, cheapModel, strongModel, draft, cheap, strong, total: draft + cheap + strong, calls: 1 + plan.cheapCalls + plan.strongCalls };
}
