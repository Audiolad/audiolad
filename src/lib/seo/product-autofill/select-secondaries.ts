import { isSameSeoQuery } from "@/lib/seo/wordstat/ui";
import { wordstatPhraseKey } from "@/lib/seo/wordstat/phrase";
import type { WordstatSuggestion } from "@/lib/seo/wordstat/types";
import {
  PRODUCT_SEO_SECONDARY_MAX,
  PRODUCT_SEO_SECONDARY_MIN,
} from "@/lib/seo/product-autofill/types";

export type EligibleSecondaryCandidate = {
  phrase: string;
  count: number;
  color: "green" | "yellow" | "red";
  source: WordstatSuggestion["source"];
};

/**
 * Wordstat-first candidate pool for AI ranking.
 * Prefer green 50–1000. Include yellow only if the green set is short.
 * Include red only if green+yellow still cannot fill the minimum.
 * Color is a demand heuristic, never competition.
 */
export function eligibleSecondaryCandidates(
  suggestions: WordstatSuggestion[],
  primaryQuery: string,
): EligibleSecondaryCandidate[] {
  const seen = new Set<string>();
  const unique: WordstatSuggestion[] = [];

  for (const item of suggestions) {
    if (isSameSeoQuery(item.phrase, primaryQuery)) {
      continue;
    }

    const key = wordstatPhraseKey(item.phrase);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  const green = unique.filter((item) => item.opportunity.color === "green");
  const yellow = unique.filter((item) => item.opportunity.color === "yellow");
  const red = unique.filter((item) => item.opportunity.color === "red");

  let pool = [...green];
  if (pool.length < PRODUCT_SEO_SECONDARY_MAX) {
    pool = [...pool, ...yellow];
  }

  if (pool.length < PRODUCT_SEO_SECONDARY_MIN) {
    pool = [...pool, ...red];
  }

  return pool.slice(0, 20).map((item) => ({
    phrase: item.phrase,
    count: item.count,
    color: item.opportunity.color,
    source: item.source,
  }));
}

export function allowedSecondaryPhraseSet(
  candidates: EligibleSecondaryCandidate[],
): Set<string> {
  return new Set(candidates.map((item) => wordstatPhraseKey(item.phrase)));
}

export function candidateCountByPhrase(
  candidates: EligibleSecondaryCandidate[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of candidates) {
    counts.set(wordstatPhraseKey(item.phrase), item.count);
  }
  return counts;
}
