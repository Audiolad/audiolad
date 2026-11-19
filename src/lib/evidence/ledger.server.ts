// t1578u M3: reads (and first tops up) the hourly seals of playback_usage_facts for an extract.
// Best effort: when the migration is not applied the extract still works, marked «без печатей».
import "server-only";

import {
  buildManifestLedger,
  factHours,
  isMissingSchemaError,
  unavailableLedger,
  type FactSeal,
  type ManifestLedger,
  type SealCheck,
} from "@/lib/evidence/ledger";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type Db = ReturnType<typeof createServiceRoleClient>;

const SEAL_COLUMNS =
  "period_start, period_end, fact_count, listened_ms, facts_sha256, prev_chain_sha256, chain_sha256, canon_version";

export async function sealPendingHours(db: Db, maxPeriods = 48): Promise<number | null> {
  const { data, error } = await db.rpc("seal_playback_usage_facts", { p_max_periods: maxPeriods });
  if (error) return null;
  return typeof data === "number" ? data : Number(data) || 0;
}

export async function loadLedgerForExtract(
  db: Db,
  createdAt: ReadonlyArray<string | null | undefined>,
): Promise<ManifestLedger> {
  try {
    await sealPendingHours(db);
    const hours = factHours(createdAt);
    const seals: FactSeal[] = [];
    if (hours.length) {
      const { data, error } = await db
        .from("playback_usage_fact_seals")
        .select(SEAL_COLUMNS)
        .gte("period_start", hours[0])
        .lte("period_start", hours[hours.length - 1])
        .order("period_start", { ascending: true })
        .limit(1000);
      if (error) return unavailableLedger(isMissingSchemaError(error) ? "migration_not_applied" : "db_error");
      seals.push(...((data ?? []) as FactSeal[]));
    }
    const wanted = new Set(hours.map((h) => Date.parse(h)));
    const checks: SealCheck[] = [];
    for (const s of seals) {
      if (!wanted.has(Date.parse(s.period_start))) continue;
      const { data, error } = await db.rpc("verify_playback_usage_fact_seal", { p_period_start: s.period_start });
      if (error) return unavailableLedger(isMissingSchemaError(error) ? "migration_not_applied" : "db_error");
      const row = (Array.isArray(data) ? data[0] : data) as
        | { period_start: string; ok: boolean; chain_ok: boolean; fact_count: number }
        | undefined;
      if (row) checks.push({ period_start: row.period_start, ok: row.ok === true, chain_ok: row.chain_ok === true, fact_count: Number(row.fact_count) });
    }
    const head = await db
      .from("playback_usage_fact_seals")
      .select(SEAL_COLUMNS)
      .order("period_start", { ascending: false })
      .limit(1);
    if (head.error) return unavailableLedger(isMissingSchemaError(head.error) ? "migration_not_applied" : "db_error");
    return buildManifestLedger({ createdAt, seals, checks, head: ((head.data ?? [])[0] as FactSeal | undefined) ?? null });
  } catch {
    return unavailableLedger("db_error");
  }
}
