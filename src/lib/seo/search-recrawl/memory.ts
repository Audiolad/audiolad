import { isAudioladRecrawlUrl } from "@/lib/seo/search-recrawl/origin";

export type SearchRecrawlEngine = "yandex" | "indexnow";

export type SearchRecrawlStatus =
  | "pending"
  | "leased"
  | "delivered"
  | "dead"
  | "rejected";

export type SearchRecrawlRow = {
  id: string;
  url: string;
  engine: SearchRecrawlEngine;
  entityType: string | null;
  entityId: string | null;
  reason: string;
  status: SearchRecrawlStatus;
  attempts: number;
  lastError: string | null;
  lastHttpStatus: number | null;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  deliveredAt: number | null;
  leaseToken: string | null;
  leasedUntil: number | null;
};

export type EnqueueSearchRecrawlInput = {
  url: string;
  engine: SearchRecrawlEngine;
  reason: string;
  entityType?: string | null;
  entityId?: string | null;
};

export type EnqueueSearchRecrawlResult =
  | { outcome: "inserted" | "deduped"; id: string }
  | { outcome: "rejected"; reason: "foreign_origin" | "invalid" }
  | { outcome: "failed" };

const LEASE_MS = 10 * 60 * 1000;

function isEngine(value: string): value is SearchRecrawlEngine {
  return value === "yandex" || value === "indexnow";
}

/**
 * In-memory stand-in for enqueue_search_recrawl and the lease RPCs.
 * Pending uniqueness is (engine, url). A repeat does not reset attempts.
 */
export function createMemorySearchRecrawlQueue(now: () => number = Date.now) {
  const rows = new Map<string, SearchRecrawlRow>();
  let sequence = 0;

  function pendingFor(engine: SearchRecrawlEngine, url: string) {
    return [...rows.values()].find(
      (row) =>
        row.engine === engine &&
        row.url === url &&
        (row.status === "pending" || row.status === "leased"),
    );
  }

  function enqueue(input: EnqueueSearchRecrawlInput): EnqueueSearchRecrawlResult {
    const url = input.url.trim();
    const reason = input.reason.trim();

    if (
      !isEngine(input.engine) ||
      !reason ||
      reason.length > 80 ||
      !isAudioladRecrawlUrl(url)
    ) {
      return {
        outcome: "rejected",
        reason: isAudioladRecrawlUrl(url) ? "invalid" : "foreign_origin",
      };
    }

    const existing = pendingFor(input.engine, url);

    if (existing) {
      existing.reason = reason;
      existing.entityType = input.entityType ?? null;
      existing.entityId = input.entityId ?? null;
      existing.updatedAt = now();
      return { outcome: "deduped", id: existing.id };
    }

    sequence += 1;
    const id = `recrawl-${sequence}`;
    const timestamp = now();
    rows.set(id, {
      id,
      url,
      engine: input.engine,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      reason,
      status: "pending",
      attempts: 0,
      lastError: null,
      lastHttpStatus: null,
      nextAttemptAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      deliveredAt: null,
      leaseToken: null,
      leasedUntil: null,
    });

    return { outcome: "inserted", id };
  }

  function matchesLease(row: SearchRecrawlRow | undefined, id: string, token: string) {
    return row != null && row.id === id && row.status === "leased" && row.leaseToken === token;
  }

  function take(limit = 20): SearchRecrawlRow[] {
    const due = [...rows.values()]
      .filter((row) => {
        if (row.status === "pending" && row.nextAttemptAt <= now()) {
          return true;
        }

        return (
          row.status === "leased" &&
          row.leasedUntil != null &&
          row.leasedUntil <= now()
        );
      })
      .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt || left.createdAt - right.createdAt)
      .slice(0, limit);

    return due.map((row) => {
      const leaseToken = `lease-${row.id}-${now()}`;
      row.status = "leased";
      row.leaseToken = leaseToken;
      row.leasedUntil = now() + LEASE_MS;
      row.updatedAt = now();
      return { ...row };
    });
  }

  function complete(id: string, token: string, attempts: number, httpStatus: number | null) {
    const row = rows.get(id);
    if (!matchesLease(row, id, token) || !row) {
      return 0;
    }

    row.status = "delivered";
    row.attempts = attempts;
    row.lastHttpStatus = httpStatus;
    row.lastError = null;
    row.deliveredAt = now();
    row.leaseToken = null;
    row.leasedUntil = null;
    row.updatedAt = now();
    return 1;
  }

  function retry(
    id: string,
    token: string,
    attempts: number,
    lastError: string,
    httpStatus: number | null,
    nextAttemptAt: number,
  ) {
    const row = rows.get(id);
    if (!matchesLease(row, id, token) || !row) {
      return 0;
    }

    row.status = "pending";
    row.attempts = attempts;
    row.lastError = lastError.slice(0, 200);
    row.lastHttpStatus = httpStatus;
    row.nextAttemptAt = nextAttemptAt;
    row.leaseToken = null;
    row.leasedUntil = null;
    row.updatedAt = now();
    return 1;
  }

  function dead(
    id: string,
    token: string,
    attempts: number,
    lastError: string,
    httpStatus: number | null,
  ) {
    const row = rows.get(id);
    if (!matchesLease(row, id, token) || !row) {
      return 0;
    }

    row.status = "dead";
    row.attempts = attempts;
    row.lastError = lastError.slice(0, 200);
    row.lastHttpStatus = httpStatus;
    row.leaseToken = null;
    row.leasedUntil = null;
    row.updatedAt = now();
    return 1;
  }

  function reject(id: string, token: string, lastError: string) {
    const row = rows.get(id);
    if (!matchesLease(row, id, token) || !row) {
      return 0;
    }

    row.status = "rejected";
    row.lastError = lastError.slice(0, 200);
    row.leaseToken = null;
    row.leasedUntil = null;
    row.updatedAt = now();
    return 1;
  }

  function health() {
    const yandex = [...rows.values()].filter((row) => row.engine === "yandex");
    const pending = yandex.filter(
      (row) => row.status === "pending" || row.status === "leased",
    );
    const delivered = yandex.filter((row) => row.status === "delivered" && row.deliveredAt != null);

    return {
      pendingCount: pending.length,
      oldestPendingAt:
        pending.length > 0 ? Math.min(...pending.map((row) => row.createdAt)) : null,
      lastDeliveredAt:
        delivered.length > 0
          ? Math.max(...delivered.map((row) => row.deliveredAt ?? 0))
          : null,
    };
  }

  return {
    enqueue,
    take,
    complete,
    retry,
    dead,
    reject,
    health,
    rows: () => [...rows.values()].map((row) => ({ ...row })),
  };
}
