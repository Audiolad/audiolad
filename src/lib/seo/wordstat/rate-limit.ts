/**
 * In-memory Wordstat quota guards. Process-local only — not a DB or Redis.
 *
 * User limit: 8 logical lookups / 15 minutes (cache misses that reach
 * the outbound path). Cache hits do not consume this quota.
 *
 * Process outbound limit: max 40 actual Wordstat HTTP attempts / 60 minutes.
 * This is an intentionally conservative process-local guard vs default
 * Yandex quota 100/hour, with headroom for zero-downtime overlapping
 * processes. Cache hits MUST NOT consume outbound quota. The first real
 * upstream fetch consumes one slot; a retry consumes a separate slot.
 */

export const WORDSTAT_USER_LIMIT = 8;
export const WORDSTAT_USER_WINDOW_MS = 15 * 60 * 1000;
export const WORDSTAT_PROCESS_OUTBOUND_LIMIT = 40;
export const WORDSTAT_PROCESS_OUTBOUND_WINDOW_MS = 60 * 60 * 1000;
export const WORDSTAT_PROCESS_OUTBOUND_KEY = "wordstat:outbound";

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

export function consumeWordstatUserRateLimit(
  userId: string,
  store: WordstatRateLimitStore = processRateLimit,
): boolean {
  return store.consume(
    `wordstat:user:${userId}`,
    WORDSTAT_USER_LIMIT,
    WORDSTAT_USER_WINDOW_MS,
  );
}

export function consumeWordstatOutboundSlot(
  store: WordstatRateLimitStore = processRateLimit,
): boolean {
  return store.consume(
    WORDSTAT_PROCESS_OUTBOUND_KEY,
    WORDSTAT_PROCESS_OUTBOUND_LIMIT,
    WORDSTAT_PROCESS_OUTBOUND_WINDOW_MS,
  );
}
