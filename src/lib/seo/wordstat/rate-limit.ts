/**
 * In-memory Wordstat quota guards. Process-local only — not a DB.
 * Limits are conservative: GetTop is billed per 1000 requests.
 */

export const WORDSTAT_USER_LIMIT = 8;
export const WORDSTAT_USER_WINDOW_MS = 15 * 60 * 1000;
export const WORDSTAT_PROCESS_LIMIT = 40;
export const WORDSTAT_PROCESS_WINDOW_MS = 15 * 60 * 1000;
export const WORDSTAT_PROCESS_RATE_KEY = "wordstat:process";

type RateEntry = { count: number; resetAt: number };

export type WordstatRateLimitStore = {
  consume(key: string, limit: number, windowMs: number): boolean;
  clear(): void;
};

export function createWordstatRateLimitStore(
  options: { now?: () => number } = {},
): WordstatRateLimitStore {
  const store = new Map<string, RateEntry>();
  const now = options.now ?? Date.now;

  return {
    consume(key, limit, windowMs) {
      const current = now();
      const entry = store.get(key);

      if (!entry || current >= entry.resetAt) {
        store.set(key, { count: 1, resetAt: current + windowMs });
        return true;
      }

      if (entry.count >= limit) {
        return false;
      }

      entry.count += 1;
      return true;
    },
    clear() {
      store.clear();
    },
  };
}

const processRateLimit = createWordstatRateLimitStore();

export function getProcessWordstatRateLimit(): WordstatRateLimitStore {
  return processRateLimit;
}

export function consumeWordstatRateLimit(
  userId: string,
  store: WordstatRateLimitStore = processRateLimit,
): boolean {
  const userAllowed = store.consume(
    `wordstat:user:${userId}`,
    WORDSTAT_USER_LIMIT,
    WORDSTAT_USER_WINDOW_MS,
  );
  if (!userAllowed) {
    return false;
  }

  const processAllowed = store.consume(
    WORDSTAT_PROCESS_RATE_KEY,
    WORDSTAT_PROCESS_LIMIT,
    WORDSTAT_PROCESS_WINDOW_MS,
  );

  return processAllowed;
}
