/**
 * t1578u M3: hourly seals of playback_usage_facts (hash chain, migration 20270330120000).
 * Pure helpers: which hours an extract touches and how they are reported in its manifest.
 */

export const HOUR_MS = 3600_000;

export type FactSeal = {
  period_start: string;
  period_end: string;
  fact_count: number;
  listened_ms: number;
  facts_sha256: string;
  prev_chain_sha256: string;
  chain_sha256: string;
  canon_version: number;
};

export type SealCheck = { period_start: string; ok: boolean; chain_ok: boolean; fact_count: number };

export type ManifestLedger = {
  available: boolean;
  /** Why the ledger is not in this extract (migration not applied, database error). */
  unavailable_reason?: string;
  basis: string;
  hours_touched: number;
  hours_sealed: number;
  /** Facts of this extract whose created_at hour is not sealed yet (the last ~hour). */
  facts_in_unsealed_hours: number;
  /** Every sealed hour re-hashed by the database while the extract was made. */
  all_sealed_hours_verified: boolean;
  seals: Array<FactSeal & { verified: boolean }>;
  chain_head: Pick<FactSeal, "period_start" | "chain_sha256" | "fact_count"> | null;
  note: string;
};

/** UTC hour starts (ISO) of the created_at values, ascending, unique. */
export function factHours(createdAt: ReadonlyArray<string | null | undefined>): string[] {
  const hours = new Set<number>();
  for (const v of createdAt) {
    const t = v ? Date.parse(v) : Number.NaN;
    if (Number.isFinite(t)) hours.add(Math.floor(t / HOUR_MS) * HOUR_MS);
  }
  return [...hours].sort((a, b) => a - b).map((t) => new Date(t).toISOString());
}

export function hourKey(iso: string): number {
  return Math.floor(Date.parse(iso) / HOUR_MS);
}

export const LEDGER_BASIS =
  "Каждый час журнала playback_usage_facts (по времени записи created_at, UTC) запечатан: SHA-256 всех строк часа по всем точкам и цепочка chain_sha256 = SHA-256(prev|час|строк|listened_ms|facts_sha256). Изменение или удаление любой строки после печати ломает проверку часа и всех следующих.";

export function buildManifestLedger(input: {
  createdAt: ReadonlyArray<string | null | undefined>;
  seals: readonly FactSeal[];
  checks: readonly SealCheck[];
  head: FactSeal | null;
}): ManifestLedger {
  const hours = factHours(input.createdAt);
  const byHour = new Map(input.seals.map((s) => [hourKey(s.period_start), s]));
  const checkByHour = new Map(input.checks.map((c) => [hourKey(c.period_start), c]));
  const seals: ManifestLedger["seals"] = [];
  for (const h of hours) {
    const s = byHour.get(hourKey(h));
    if (!s) continue;
    const c = checkByHour.get(hourKey(h));
    seals.push({ ...s, verified: !!c && c.ok && c.chain_ok });
  }
  const sealedKeys = new Set(seals.map((s) => hourKey(s.period_start)));
  let unsealed = 0;
  for (const v of input.createdAt) {
    const t = v ? Date.parse(v) : Number.NaN;
    if (!Number.isFinite(t) || !sealedKeys.has(Math.floor(t / HOUR_MS))) unsealed += 1;
  }
  return {
    available: true,
    basis: LEDGER_BASIS,
    hours_touched: hours.length,
    hours_sealed: seals.length,
    facts_in_unsealed_hours: unsealed,
    all_sealed_hours_verified: seals.every((s) => s.verified),
    seals,
    chain_head: input.head
      ? { period_start: input.head.period_start, chain_sha256: input.head.chain_sha256, fact_count: input.head.fact_count }
      : null,
    note: "Хеш часа считается по строкам всех точек, поэтому сверяется с базой АудиоЛад (verify_playback_usage_fact_seal), а не по одному facts.csv. Голова цепочки фиксирует состояние всего журнала на момент выписки.",
  };
}

export function unavailableLedger(reason: string): ManifestLedger {
  return {
    available: false,
    unavailable_reason: reason,
    basis: LEDGER_BASIS,
    hours_touched: 0,
    hours_sealed: 0,
    facts_in_unsealed_hours: 0,
    all_sealed_hours_verified: false,
    seals: [],
    chain_head: null,
    note: "Печати часов недоступны: выписка подтверждается только печатью сервиса (manifest.sig).",
  };
}

/** Postgres / PostgREST error for a missing function, table or column (migration not applied). */
export function isMissingSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (["PGRST202", "PGRST205", "PGRST204", "42883", "42P01", "42703"].includes(code)) return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /could not find the (function|table)|does not exist|schema cache/i.test(msg);
}
