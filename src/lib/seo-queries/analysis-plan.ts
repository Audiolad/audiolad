import { wordstatPhraseKey } from "@/lib/seo/wordstat/phrase";
import type { WordstatErrorCode, WordstatResult } from "@/lib/seo/wordstat/types";

/** Client-safe helpers for the admin «Анализ» flow (no server-only imports). */

export type SeoAnalysisPlanItem = {
  id: string;
  frequency: number | null;
  suggested: { recommended_disposition: "analyzed" | "not_applicable"; confidence: string };
};

export type SeoAnalysisPlan = { approve: string[]; reject: string[]; manual: string[] };

/** Only high/medium-confidence recommendations are applied in bulk; low stays for the admin. */
export function planSeoAnalysisRecommendations(items: readonly SeoAnalysisPlanItem[]): SeoAnalysisPlan {
  const plan: SeoAnalysisPlan = { approve: [], reject: [], manual: [] };
  for (const item of items) {
    if (item.suggested.confidence !== "high" && item.suggested.confidence !== "medium") plan.manual.push(item.id);
    else if (item.suggested.recommended_disposition === "analyzed") plan.approve.push(item.id);
    else plan.reject.push(item.id);
  }
  return plan;
}

export function seoAnalysisPlanConfirmText(plan: SeoAnalysisPlan): string {
  return `Применить рекомендации к выбранным: допустить ${plan.approve.length}, отклонить ${plan.reject.length}, оставить ${plan.manual.length} на ручное решение?`;
}

/** Higher frequency first; unknown frequency last; stable otherwise. */
export function sortByFrequencyDesc<T extends { frequency: number | null }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = a.item.frequency;
      const right = b.item.frequency;
      if (left === right) return a.index - b.index;
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left;
    })
    .map(({ item }) => item);
}

export function chunkIds<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export type SeoFrequencyRefreshResult =
  | { id: string; status: "present" | "fetched"; frequency: number }
  | { id: string; status: "not_found"; frequency: null; message: string }
  | { id: string; status: "failed"; frequency: null; code: WordstatErrorCode | "SAVE_FAILED" | "NOT_FOUND"; message: string };

export const SEO_FREQUENCY_NOT_FOUND_MESSAGE = "Wordstat не вернул частотность для этой точной фразы.";
export const SEO_FREQUENCY_SAVE_FAILED_MESSAGE = "Частотность получена, но не сохранена. Повторите попытку.";

/** Codes after which further Wordstat calls in the same batch are pointless or would burn quota. */
const STOP_CODES = new Set<WordstatErrorCode>(["RATE_LIMITED", "WORDSTAT_DISABLED", "NOT_CONFIGURED", "AUTH_FAILED"]);

/** Exact-phrase count from GetTop results. topicTotalCount is a topic aggregate and is never used. */
export function exactWordstatFrequency(queryText: string, result: WordstatResult): number | null {
  if (!result.ok) return null;
  const key = wordstatPhraseKey(queryText);
  const match = result.data.suggestions.find((item) => wordstatPhraseKey(item.phrase) === key);
  return match ? match.count : null;
}

export type SeoFrequencyRefreshDeps = {
  fetchWordstat(phrase: string): Promise<WordstatResult>;
  saveFrequency(id: string, frequency: number, checkedAt: string): Promise<boolean>;
  now?: () => Date;
};

/**
 * Fetches Wordstat frequency only for rows without it, one call at a time, and stops the batch
 * on quota/configuration errors so the remaining rows show a retryable failure without extra calls.
 * Only frequency and frequency_checked_at are written (by saveFrequency); review fields stay untouched.
 */
export async function refreshMissingSeoQueryFrequencies(
  rows: ReadonlyArray<{ id: string; query_text: string; frequency: number | null }>,
  deps: SeoFrequencyRefreshDeps,
): Promise<SeoFrequencyRefreshResult[]> {
  const results: SeoFrequencyRefreshResult[] = [];
  let stopped: { code: WordstatErrorCode; message: string } | null = null;
  for (const row of rows) {
    if (typeof row.frequency === "number") {
      results.push({ id: row.id, status: "present", frequency: row.frequency });
      continue;
    }
    if (stopped) {
      results.push({ id: row.id, status: "failed", frequency: null, ...stopped });
      continue;
    }
    const response = await deps.fetchWordstat(row.query_text);
    if (!response.ok && response.error.code !== "NO_RESULTS") {
      const failure = { code: response.error.code, message: response.error.message };
      if (STOP_CODES.has(response.error.code)) stopped = failure;
      results.push({ id: row.id, status: "failed", frequency: null, ...failure });
      continue;
    }
    const frequency = exactWordstatFrequency(row.query_text, response);
    if (frequency === null) {
      results.push({ id: row.id, status: "not_found", frequency: null, message: SEO_FREQUENCY_NOT_FOUND_MESSAGE });
      continue;
    }
    const saved = await deps.saveFrequency(row.id, frequency, (deps.now?.() ?? new Date()).toISOString());
    results.push(saved
      ? { id: row.id, status: "fetched", frequency }
      : { id: row.id, status: "failed", frequency: null, code: "SAVE_FAILED", message: SEO_FREQUENCY_SAVE_FAILED_MESSAGE });
  }
  return results;
}
