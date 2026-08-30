import { expectedSecondaryRange } from "@/lib/seo/product-autofill/validate";
import { wordstatPhraseKey } from "@/lib/seo/wordstat/phrase";

export type CanonicalSecondaryCandidate = {
  phrase: string;
};

/**
 * Deterministic post-response rewrite of Yandex secondaryQueries.
 * Maps AI phrases onto exact Wordstat candidate.phrase strings, drops
 * invented and duplicate keys, then fills or trims to expectedSecondaryRange.
 * Does not log phrases.
 */
export function canonicalizeYandexSecondaryQueries(
  secondaryQueries: readonly string[],
  candidates: readonly CanonicalSecondaryCandidate[],
): string[] {
  if (candidates.length === 0) {
    return [];
  }

  const candidateByKey = new Map<string, string>();
  for (const candidate of candidates) {
    const key = wordstatPhraseKey(candidate.phrase);
    if (!key || candidateByKey.has(key)) {
      continue;
    }
    candidateByKey.set(key, candidate.phrase);
  }

  const chosen: string[] = [];
  const used = new Set<string>();

  for (const phrase of secondaryQueries) {
    if (typeof phrase !== "string") {
      continue;
    }

    const key = wordstatPhraseKey(phrase);
    if (!key || !candidateByKey.has(key) || used.has(key)) {
      continue;
    }

    used.add(key);
    chosen.push(candidateByKey.get(key)!);
  }

  const { min, max } = expectedSecondaryRange(candidates.length);

  for (const candidate of candidates) {
    if (chosen.length >= min) {
      break;
    }

    const key = wordstatPhraseKey(candidate.phrase);
    if (!key || used.has(key)) {
      continue;
    }

    used.add(key);
    chosen.push(candidate.phrase);
  }

  if (chosen.length > max) {
    return chosen.slice(0, max);
  }

  return chosen;
}
