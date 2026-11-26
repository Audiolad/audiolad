import {
  CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS,
  PUBLIC_CATALOG_PLAYBACK_USAGE_KIND,
} from "@/lib/catalog/sort-constants";

/** @deprecated Use {@link isCatalogQualifiedListenSessionMs} — threshold is inclusive (>=). */
export const CATALOG_QUALIFIED_LISTEN_MIN_MS = CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS;

export function isCatalogQualifiedListenSessionMs(sessionMs: number): boolean {
  return Number.isFinite(sessionMs) && sessionMs >= CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS;
}

export type CatalogListenFact = {
  listeningKey: string;
  listenedMs: number;
};

export type PlaybackUsageKind = "consumer" | "business";

export type CatalogPracticeListenFact = CatalogListenFact & {
  practiceId: string;
  sessionId: string | null;
  /** Mirrors playback_usage_facts.usage_kind; omitted means consumer (public catalog). */
  usageKind?: PlaybackUsageKind;
};

export function isPublicCatalogPlaybackFact(
  fact: Pick<CatalogPracticeListenFact, "usageKind">,
): boolean {
  return (fact.usageKind ?? PUBLIC_CATALOG_PLAYBACK_USAGE_KIND) ===
    PUBLIC_CATALOG_PLAYBACK_USAGE_KIND;
}

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
 * `(practice_id, coalesce(session_id, listening_key))`, qualified when sum >= 40s,
 * only `usage_kind = consumer` rows (business venue playback excluded).
 */
export function countQualifiedListenSessionsByPractice(
  rows: ReadonlyArray<CatalogPracticeListenFact>,
): Map<string, number> {
  const sessionMs = new Map<string, number>();
  const practiceByBucket = new Map<string, string>();

  for (const row of rows) {
    if (!isPublicCatalogPlaybackFact(row)) {
      continue;
    }

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
    if (!isCatalogQualifiedListenSessionMs(totalMs)) {
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
    if (isCatalogQualifiedListenSessionMs(sessionMs)) {
      count += 1;
    }
  }

  return count;
}