// One Cloud.ru call with the shared budget (used by the sz pack pipeline; the single-article
// pipeline in run.mjs has the same logic inline). Budget is checked against the worst case
// BEFORE the call; the charged cost (usage or worst case) is added after it.
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chargedCost, estimatePromptTokens, formatRub, worstCaseRub } from "./cost.mjs";
import { generateOnMoscow } from "./moscow.mjs";
import { buildRequest } from "./prompt.mjs";
import { log, mskNow, writeJson } from "./util.mjs";

export class BudgetError extends Error {
  constructor(message) {
    super(message);
    this.code = 5;
  }
}

export function makeCaller({ model, maxTokens, maxRub, outDir, runId, state, schemaName, generate = generateOnMoscow }) {
  return function callWriter(callName, messages, schema) {
    const request = buildRequest(model, messages, schema, { maxTokens, schemaName });
    const worst = worstCaseRub(model, estimatePromptTokens(messages), maxTokens);
    if (state.spentRub + worst > maxRub) {
      throw new BudgetError(`бюджет: потрачено ${formatRub(state.spentRub)}, худший случай вызова ${formatRub(worst)}, лимит ${formatRub(maxRub)} (--max-rub)`);
    }
    const callDir = join(outDir, callName);
    writeJson(join(callDir, "request.json"), request);
    log(`${callName}: запрос к ${model} на Москве (худший случай ${formatRub(worst)})`);
    const { meta, article } = generate(runId, callName, join(callDir, "request.json"), callDir);
    const { cost, estimated } = chargedCost(meta, worst);
    state.spentRub += cost;
    const call = {
      name: callName,
      http: meta.http,
      seconds: meta.seconds,
      promptTokens: meta.prompt_tokens ?? 0,
      completionTokens: meta.completion_tokens ?? 0,
      costRub: cost,
      costEstimated: estimated,
      finishReason: meta.finish_reason ?? null,
      error: meta.ok ? null : meta.error ?? "ошибка",
    };
    state.calls.push(call);
    const ledgerDir = join(homedir(), ".cache/writer");
    mkdirSync(ledgerDir, { recursive: true });
    appendFileSync(join(ledgerDir, "ledger.jsonl"), `${JSON.stringify({ at: mskNow(), runId, call: callName, model, ...call })}\n`);
    log(`${callName}: http ${call.http}, ${call.promptTokens}+${call.completionTokens} токенов, ${formatRub(cost)}${call.error ? `, ошибка: ${call.error}` : ""}`);
    return article;
  };
}
