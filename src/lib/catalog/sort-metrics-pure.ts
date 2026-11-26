/** Strictly more than 60 seconds of accepted MEDIA-TIME per listening_key session. */
export const CATALOG_QUALIFIED_LISTEN_MIN_MS = 60_001;

export type CatalogListenFact = {
  listeningKey: string;
  listenedMs: number;
};

/**
 * Pure helper for unit tests: sum listened_ms by listening_key, count sessions
 * where total is strictly greater than 60 seconds.
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
    if (sessionMs > 60_000) {
      count += 1;
    }
  }

  return count;
}