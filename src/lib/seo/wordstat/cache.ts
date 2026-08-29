import type { WordstatSuggestionsPayload } from "@/lib/seo/wordstat/types";
import { WORDSTAT_CACHE_TTL_MS } from "@/lib/seo/wordstat/types";
import { normalizeWordstatPhrase } from "@/lib/seo/wordstat/phrase";

type CacheEntry = {
  expiresAt: number;
  value: WordstatSuggestionsPayload;
};

export type WordstatCacheStore = {
  get(key: string): WordstatSuggestionsPayload | null;
  set(key: string, value: WordstatSuggestionsPayload): void;
  clear(): void;
};

export function buildWordstatCacheKey(input: {
  phrase: string;
  regionId: string;
  device: string;
}): string | null {
  const phrase = normalizeWordstatPhrase(input.phrase);
  if (!phrase) {
    return null;
  }

  return `${phrase.toLocaleLowerCase("ru-RU")}|${input.regionId}|${input.device}`;
}

export function createWordstatMemoryCache(
  options: {
    now?: () => number;
    ttlMs?: number;
  } = {},
): WordstatCacheStore {
  const store = new Map<string, CacheEntry>();
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? WORDSTAT_CACHE_TTL_MS;

  return {
    get(key: string) {
      const entry = store.get(key);
      if (!entry) {
        return null;
      }

      if (now() >= entry.expiresAt) {
        store.delete(key);
        return null;
      }

      return entry.value;
    },
    set(key: string, value: WordstatSuggestionsPayload) {
      store.set(key, {
        expiresAt: now() + ttlMs,
        value,
      });
    },
    clear() {
      store.clear();
    },
  };
}

const processCache = createWordstatMemoryCache();

export function getProcessWordstatCache(): WordstatCacheStore {
  return processCache;
}
