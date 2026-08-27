import { isAnalyticsPoolExhaustionStatus } from "@/lib/analytics/rpc-errors";

export const RETRY_QUEUE_KEY = "audiolad_analytics_retry_queue";
const RETRY_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_QUEUE_ITEMS = 100;
const MAX_ATTEMPTS = 8;
const LOCK_NAME = "audiolad-analytics-retry-queue";
const LOCK_FALLBACK_KEY = "audiolad_analytics_retry_queue_lock";
const LOCK_FALLBACK_TTL_MS = 15_000;

/** Exponential backoff so a 5xx/504 storm cannot replay the whole queue on every render. */
export const ANALYTICS_RETRY_BACKOFF_MS = [
  15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000,
] as const;

export const ANALYTICS_POOL_CIRCUIT_BREAK_MS = 30_000;

let poolCircuitUntil = 0;

export type AnalyticsRetryItem = {
  id: string;
  url: string;
  body: unknown;
  createdAt: number;
  attempts: number;
  lastAttemptAt: number | null;
  permanentFailure?: boolean;
};

export type AnalyticsRetryEnqueueInput = {
  id: string;
  url: string;
  body: unknown;
  createdAt?: number;
  lastAttemptAt?: number | null;
};

export type AnalyticsRetrySendResult = {
  ok: boolean;
  retry?: boolean;
  status?: number;
};

export function analyticsRetryBackoffMs(
  attempts: number,
  poolExhausted = false,
): number {
  const index = Math.min(
    Math.max(attempts, 0),
    ANALYTICS_RETRY_BACKOFF_MS.length - 1,
  );
  const base = ANALYTICS_RETRY_BACKOFF_MS[index]!;
  return poolExhausted ? Math.max(base, ANALYTICS_POOL_CIRCUIT_BREAK_MS) : base;
}

export function shouldDeferAnalyticsRetry(
  item: Pick<AnalyticsRetryItem, "attempts" | "lastAttemptAt">,
  now: number,
  circuitUntil: number = poolCircuitUntil,
): boolean {
  if (now < circuitUntil) {
    return true;
  }

  if (item.lastAttemptAt == null) {
    return false;
  }

  return now - item.lastAttemptAt < analyticsRetryBackoffMs(item.attempts);
}

export function getAnalyticsRetryPoolCircuitUntil(): number {
  return poolCircuitUntil;
}

export function tripAnalyticsRetryPoolCircuit(
  now: number = Date.now(),
  holdMs: number = ANALYTICS_POOL_CIRCUIT_BREAK_MS,
): number {
  poolCircuitUntil = Math.max(poolCircuitUntil, now + holdMs);
  return poolCircuitUntil;
}

export function resetAnalyticsRetryPoolCircuit(): void {
  poolCircuitUntil = 0;
}

export type AnalyticsRetrySendFn = (
  item: AnalyticsRetryItem,
) => Promise<AnalyticsRetrySendResult>;

declare global {
  interface LockManager {
    request<T>(
      name: string,
      options: { ifAvailable?: boolean; mode?: "exclusive" | "shared" },
      callback: (lock: { name: string } | null) => Promise<T>,
    ): Promise<T>;
  }

  interface Navigator {
    locks?: LockManager;
  }
}

function isValidRetryItem(value: unknown): value is AnalyticsRetryItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.url === "string" &&
    record.url.length > 0 &&
    typeof record.createdAt === "number" &&
    Number.isFinite(record.createdAt) &&
    typeof record.attempts === "number" &&
    Number.isFinite(record.attempts)
  );
}

function readQueue(): AnalyticsRetryItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(RETRY_QUEUE_KEY);

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isValidRetryItem);
  } catch {
    return [];
  }
}

function writeQueue(items: AnalyticsRetryItem[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // localStorage unavailable
  }
}

export function pruneRetryQueue(): AnalyticsRetryItem[] {
  const now = Date.now();

  const items = readQueue().filter(
    (item) =>
      !item.permanentFailure &&
      now - item.createdAt <= RETRY_TTL_MS &&
      item.attempts < MAX_ATTEMPTS,
  );

  const trimmed = items.slice(-MAX_QUEUE_ITEMS);
  writeQueue(trimmed);
  return trimmed;
}

export function enqueueAnalyticsRetry(item: AnalyticsRetryEnqueueInput): void {
  const items = readQueue();

  if (items.some((existing) => existing.id === item.id)) {
    return;
  }

  const next: AnalyticsRetryItem = {
    id: item.id,
    url: item.url,
    body: item.body,
    createdAt: item.createdAt ?? Date.now(),
    attempts: item.lastAttemptAt == null ? 0 : 1,
    lastAttemptAt: item.lastAttemptAt ?? null,
  };

  items.push(next);
  writeQueue(items.slice(-MAX_QUEUE_ITEMS));
}

async function withFallbackLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (typeof window === "undefined") {
    return fn();
  }

  try {
    const raw = window.localStorage.getItem(LOCK_FALLBACK_KEY);
    const now = Date.now();

    if (raw) {
      const expiresAt = Number.parseInt(raw, 10);

      if (Number.isFinite(expiresAt) && expiresAt > now) {
        return null;
      }
    }

    window.localStorage.setItem(
      LOCK_FALLBACK_KEY,
      String(now + LOCK_FALLBACK_TTL_MS),
    );
  } catch {
    // localStorage unavailable; proceed without a lock
  }

  try {
    return await fn();
  } finally {
    try {
      window.localStorage.removeItem(LOCK_FALLBACK_KEY);
    } catch {
      // localStorage unavailable
    }
  }
}

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    try {
      return await navigator.locks.request(
        LOCK_NAME,
        { ifAvailable: true },
        async (lock) => (lock ? fn() : null),
      );
    } catch {
      return withFallbackLock(fn);
    }
  }

  return withFallbackLock(fn);
}

export async function flushAnalyticsRetryQueue(
  sendFn: AnalyticsRetrySendFn,
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  await withLock(async () => {
    const items = pruneRetryQueue();

    if (items.length === 0) {
      return;
    }

    const remaining: AnalyticsRetryItem[] = [];

    const now = Date.now();

    for (const item of items) {
      if (shouldDeferAnalyticsRetry(item, now)) {
        remaining.push(item);
        continue;
      }

      try {
        const result = await sendFn(item);

        if (result.ok) {
          continue;
        }

        const attempts = item.attempts + 1;
        const permanentFailure = result.retry === false || attempts >= MAX_ATTEMPTS;
        const status = typeof result.status === "number" ? result.status : 0;

        if (isAnalyticsPoolExhaustionStatus(status)) {
          tripAnalyticsRetryPoolCircuit(Date.now());
        }

        remaining.push({
          ...item,
          attempts,
          lastAttemptAt: Date.now(),
          permanentFailure,
        });
      } catch {
        const attempts = item.attempts + 1;

        remaining.push({
          ...item,
          attempts,
          lastAttemptAt: Date.now(),
          permanentFailure: attempts >= MAX_ATTEMPTS,
        });
      }
    }

    writeQueue(remaining.slice(-MAX_QUEUE_ITEMS));
  });
}
