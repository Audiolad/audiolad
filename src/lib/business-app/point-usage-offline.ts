/**
 * t1578u M2: an offline listening sample (hall-report-queue.ts) carries the device clock `at`
 * (ms since epoch). The route passes it to `apply_business_point_usage_sample_offline`, which keeps
 * it only when it is plausible (not in the future, at most 26 h old, after the last report of the
 * same listening session); otherwise the server time is used. Here only the shape is checked.
 */

/** Earliest accepted device clock: 2026-01-01 UTC. Anything older is a broken clock. */
const MIN_DEVICE_AT_MS = Date.UTC(2026, 0, 1);

export function offlineDeviceAtIso(usage: Record<string, unknown>): string | null {
  if (usage.offline !== true) return null;
  const at = usage.at;
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < MIN_DEVICE_AT_MS) return null;
  // The upper bound is enforced in SQL against the database clock; this only rejects nonsense.
  if (at > Date.now() + 366 * 24 * 60 * 60_000) return null;
  return new Date(at).toISOString();
}

/** PostgREST / Postgres error for a function that does not exist (migration not applied yet). */
export function isMissingRpcError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? "");
}
