/** Decisions from the rights RPC are reused for this long. A batch SQL function needs a migration. */
export const WORKSPACE_RIGHTS_CACHE_MS = 5 * 60 * 1000;

/** Parallel per-track rights calls on a cold cabinet open. The RPC itself stays one track. */
export const WORKSPACE_RIGHTS_CONCURRENCY = 16;

export type TtlDecisionCache<T extends string> = {
  get(key: string): T | null;
  set(key: string, decision: T): void;
};

export function createTtlDecisionCache<T extends string>(
  ttlMs: number,
  now: () => number = Date.now,
): TtlDecisionCache<T> {
  const map = new Map<string, { at: number; decision: T }>();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return null;
      if (now() - hit.at >= ttlMs) {
        map.delete(key);
        return null;
      }
      return hit.decision;
    },
    set(key, decision) {
      map.set(key, { at: now(), decision });
    },
  };
}

/**
 * Runs `fn` over `items` with at most `concurrency` calls in flight.
 * Result order matches `items`. The cursor advances before the first await, so
 * the JavaScript turn is the lock.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;
  let cursor = 0;
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]!, index);
    }
  }));
  return results;
}
