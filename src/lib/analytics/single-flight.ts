/**
 * Per-key single-flight for analytics RPCs.
 * Collapses concurrent identical work; remembers a settled key so the
 * current page lifecycle does not retry. Not a global mutex.
 */

export type KeyedSingleFlight<T> = {
  run: (
    key: string,
    task: () => Promise<T>,
    options?: { settle?: (value: T) => boolean },
  ) => Promise<T | null>;
  hasSettled: (key: string) => boolean;
  isInFlight: (key: string) => boolean;
  reset: () => void;
};

export function createKeyedSingleFlight<T>(): KeyedSingleFlight<T> {
  const inFlight = new Map<string, Promise<T>>();
  const settled = new Set<string>();

  return {
    async run(key, task, options) {
      if (settled.has(key)) {
        return null;
      }

      const existing = inFlight.get(key);
      if (existing) {
        return existing;
      }

      const promise = (async () => {
        const value = await task();
        if (!options?.settle || options.settle(value)) {
          settled.add(key);
        }
        return value;
      })();

      inFlight.set(key, promise);

      try {
        return await promise;
      } finally {
        inFlight.delete(key);
      }
    },
    hasSettled(key) {
      return settled.has(key);
    },
    isInFlight(key) {
      return inFlight.has(key);
    },
    reset() {
      inFlight.clear();
      settled.clear();
    },
  };
}

/** Terminal analytics HTTP outcomes must not retry in this page lifecycle. */
export function shouldSettleAnalyticsHttpAttempt(status: number): boolean {
  return status !== 401;
}
