import { CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS } from "@/lib/catalog/sort-constants";

/** Strictly more than 60 seconds of accepted MEDIA-TIME per bucket. */
export const CATALOG_QUALIFIED_LISTEN_MIN_MS =
  CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS + 1;

export type CatalogListenFact = {
  listeningKey: string;
  listenedMs: number;
};

export type CatalogPracticeListenFact = CatalogListenFact & {
  practiceId: string;
  sessionId: string | null;
};

export function practiceListenSessionBucket(
  fact: Pick<CatalogPracticeListenFact, "sessionId" | "listeningKey">,
): string {
  const session = fact.sessionId?.trim();
  if (session) {
    return session;
  }

  return fact.listeningKey.trim();
}

/**
 * Mirrors `catalog_practice_qualified_listen_counts`: one bucket per
 * `(practice_id, coalesce(session_id, listening_key))`, qualified when sum > 60s.
 */
export function countQualifiedListenSessionsByPractice(
  rows: ReadonlyArray<CatalogPracticeListenFact>,
): Map<string, number> {
  const sessionMs = new Map<string, number>();
  const practiceByBucket = new Map<string, string>();

  for (const row of rows) {
    if (!Number.isFinite(row.listenedMs) || row.listenedMs <= 0) {
      continue;
    }

    const practiceId = row.practiceId.trim();
    const bucket = practiceListenSessionBucket(row);

    if (!practiceId || !bucket) {
      continue;
    }

    const compound = `${practiceId}\0${bucket}`;
    practiceByBucket.set(compound, practiceId);
    sessionMs.set(compound, (sessionMs.get(compound) ?? 0) + Math.floor(row.listenedMs));
  }

  const counts = new Map<string, number>();

  for (const [compound, totalMs] of sessionMs.entries()) {
    if (totalMs <= CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS) {
      continue;
    }

    const practiceId = practiceByBucket.get(compound);
    if (!practiceId) {
      continue;
    }

    counts.set(practiceId, (counts.get(practiceId) ?? 0) + 1);
  }

  return counts;
}

/**
 * Legacy per-listening_key counter (single practice scenarios).
 */
export function countQualifiedListenSessions(
  rows: ReadonlyArray<CatalogListenFact>,
): number {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (!Number.isFinite(row.listenedMs) || row.listenedMs <= 0) {
      continue;
    }

    const key = row.listeningKey.trim();
    if (!key) {
      continue;
    }

    totals.set(key, (totals.get(key) ?? 0) + Math.floor(row.listenedMs));
  }

  let count = 0;

  for (const sessionMs of totals.values()) {
    if (sessionMs > CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS) {
      count += 1;
    }
  }

  return count;
}