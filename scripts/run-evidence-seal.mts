/**
 * t1578u M3: one pass of the hourly seals of playback_usage_facts (hash chain). Seals every UTC
 * hour that ended at least 1 h ago and is not sealed yet, oldest first, at most 48 per run (the
 * first runs catch up the history). Append-only and idempotent; never touches the hall player.
 *
 * Ops: cd /var/www/audiolad-deploy/current && npx tsx scripts/run-evidence-seal.mts
 * PM2: pm2 start deploy/evidence-seal.ecosystem.config.cjs (after migration 20270330120000)
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("evidence_seal_environment_missing");
  }
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const max = Math.max(1, Math.min(Number(process.env.EVIDENCE_SEAL_MAX_PERIODS) || 48, 744));
  const { data, error } = await service.rpc("seal_playback_usage_facts", { p_max_periods: max });
  if (error) throw new Error(`evidence_seal_failed: ${String(error.code ?? "")} ${String(error.message ?? "").slice(0, 200)}`);
  const head = await service
    .from("playback_usage_fact_seals")
    .select("period_start, chain_sha256, fact_count")
    .order("period_start", { ascending: false })
    .limit(1);
  if (head.error) throw new Error("evidence_seal_head_failed");
  console.log(JSON.stringify({ sealed: Number(data) || 0, head: (head.data ?? [])[0] ?? null }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "evidence_seal_failed");
  process.exitCode = 1;
});
