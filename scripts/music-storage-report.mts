import { loadProductionEnvFromCwd } from "./load-production-env.mts";
import { createServiceRoleClient } from "../src/lib/supabase/service-role";

loadProductionEnvFromCwd();

type Asset = {
  storage_provider: string | null;
  asset_role: string;
  lifecycle_state: string;
  size_bytes: number | string | null;
};

async function allAssets(): Promise<Asset[]> {
  const service = createServiceRoleClient();
  const rows: Asset[] = [];
  for (;;) {
    const { data, error } = await service
      .from("music_audio_assets")
      .select("storage_provider,asset_role,lifecycle_state,size_bytes")
      .range(rows.length, rows.length + 999);
    if (error) throw new Error(`asset_report_failed:${error.message}`);
    rows.push(...((data ?? []) as Asset[]));
    if ((data ?? []).length < 1000) return rows;
  }
}

function summarizeAssets(assets: Asset[]) {
  const values = new Map<string, { count: number; bytes: number }>();
  for (const asset of assets) {
    const provider = asset.storage_provider ?? "supabase_file";
    const key = `${provider}:${asset.asset_role}:${asset.lifecycle_state}`;
    const value = values.get(key) ?? { count: 0, bytes: 0 };
    value.count += 1;
    value.bytes += Math.max(0, Number(asset.size_bytes) || 0);
    values.set(key, value);
  }
  return [...values.entries()].map(([key, value]) => {
    const [provider, role, lifecycle] = key.split(":");
    return { provider, role, lifecycle, ...value };
  });
}

async function main() {
  const service = createServiceRoleClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [assets, copies, cleanup, metrics, mastersOnS3] = await Promise.all([
    allAssets(),
    service
      .from("music_storage_copies")
      .select("status,size_bytes,attempt_count,last_error_code,updated_at,source_released_at")
      .order("updated_at", { ascending: false })
      .limit(1000),
    service
      .from("music_storage_cleanup_jobs")
      .select("id,audio_item_id,provider,storage_bucket,storage_path,status,attempt_count,last_error_code,updated_at")
      .neq("status", "resolved")
      .order("updated_at", { ascending: true })
      .limit(1000),
    service
      .from("music_storage_daily_metrics")
      .select("metric_date,provider,operation,outcome,request_count,byte_count")
      .gte("metric_date", since)
      .order("metric_date", { ascending: false }),
    service
      .from("music_audio_assets")
      .select("id", { count: "exact", head: true })
      .eq("asset_role", "master")
      .eq("lifecycle_state", "verified")
      .eq("storage_provider", "timeweb_s3"),
  ]);
  if (copies.error) throw new Error(`copy_report_failed:${copies.error.message}`);
  if (cleanup.error) throw new Error(`cleanup_report_failed:${cleanup.error.message}`);
  if (metrics.error) throw new Error(`metrics_report_failed:${metrics.error.message}`);
  const copyRows = copies.data ?? [];
  const copyStats = {
    verified: copyRows.filter((row) => row.status === "verified").length,
    cutover: copyRows.filter((row) => row.status === "cutover").length,
    failed: copyRows.filter((row) => row.status === "failed").length,
    rolledBack: copyRows.filter((row) => row.status === "rolled_back").length,
    copying: copyRows.filter((row) => row.status === "copying").length,
    localReleased: copyRows.filter((row) => (row as { source_released_at?: string }).source_released_at).length,
  };
  const masterCount = assets.filter((row) => row.asset_role === "master" && row.lifecycle_state === "verified").length;
  const mastersOnS3Count = mastersOnS3.count ?? 0;
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    storage: summarizeAssets(assets),
    bulkMigration: {
      mastersVerified: masterCount,
      mastersOnTimewebProvider: mastersOnS3Count,
      copyStats,
      copyPercentComplete: masterCount > 0
        ? Math.round((copyStats.verified / masterCount) * 10_000) / 100
        : 100,
      cutoverPercentComplete: masterCount > 0
        ? Math.round((mastersOnS3Count / masterCount) * 10_000) / 100
        : 0,
    },
    copies: copyRows,
    unresolvedCleanup: cleanup.data ?? [],
    last30Days: metrics.data ?? [],
    hostDisk: {
      monitor: "audiolad-disk-health.timer",
      interval: "5 minutes",
      warningPercent: 85,
      criticalPercent: 90,
    },
  }, null, 2));
}

await main().catch((error) => {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});
