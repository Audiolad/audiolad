import { evaluateWordstatOpportunity } from "@/lib/seo/wordstat/opportunity";
import {
  normalizeWordstatPhrase,
  wordstatPhraseKey,
} from "@/lib/seo/wordstat/phrase";
import {
  WORDSTAT_PERIOD_LABEL,
  type WordstatSuggestion,
  type WordstatSuggestionSource,
  type WordstatSuggestionsPayload,
} from "@/lib/seo/wordstat/types";
import { wordstatRegionLabel } from "@/lib/seo/wordstat/config";

export { normalizeWordstatPhrase, wordstatPhraseKey };

export function parseWordstatCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = BigInt(trimmed);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number.MAX_SAFE_INTEGER;
    }

    return Number(parsed);
  } catch {
    return null;
  }
}

function readPhraseInfo(
  value: unknown,
  source: WordstatSuggestionSource,
): WordstatSuggestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const phrase = normalizeWordstatPhrase(
    typeof record.phrase === "string" ? record.phrase : null,
  );
  const count = parseWordstatCount(record.count);

  if (!phrase || count === null) {
    return null;
  }

  return {
    phrase,
    count,
    source,
    opportunity: evaluateWordstatOpportunity(count),
  };
}

function readPhraseList(
  value: unknown,
  source: WordstatSuggestionSource,
): WordstatSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: WordstatSuggestion[] = [];
  for (const entry of value) {
    const parsed = readPhraseInfo(entry, source);
    if (parsed) {
      items.push(parsed);
    }
  }

  return items;
}

function readSafeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

/**
 * Keep official GetTop order: results, then associations.
 * Do not re-sort by count. Dedupe by normalized phrase, first wins.
 */
export function normalizeWordstatSuggestions(input: {
  phrase: string;
  regionId: string;
  body: unknown;
}): WordstatSuggestionsPayload {
  const record = readSafeRecord(input.body);
  const results = readPhraseList(record?.results, "result");
  const associations = readPhraseList(
    record?.associations ?? record?.association,
    "association",
  );

  const seen = new Set<string>();
  const suggestions: WordstatSuggestion[] = [];

  for (const item of [...results, ...associations]) {
    const key = wordstatPhraseKey(item.phrase);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    suggestions.push(item);
  }

  const topicTotalCount = parseWordstatCount(
    record?.totalCount ?? record?.total_count,
  );

  return {
    phrase: input.phrase,
    region: {
      id: input.regionId,
      label: wordstatRegionLabel(input.regionId),
    },
    periodLabel: WORDSTAT_PERIOD_LABEL,
    suggestions,
    topicTotalCount,
  };
}

export function seedAppearsInSuggestions(
  seed: string,
  suggestions: WordstatSuggestion[],
): boolean {
  const key = wordstatPhraseKey(seed);
  return suggestions.some((item) => wordstatPhraseKey(item.phrase) === key);
}
