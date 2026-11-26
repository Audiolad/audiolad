import { createServiceRoleClient } from "../src/lib/supabase/service-role";

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
  const [assets, copies, cleanup, metrics] = await Promise.all([
    allAssets(),
    service
      .from("music_storage_copies")
      .select("status,size_bytes,attempt_count,last_error_code,updated_at")
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
  ]);
  if (copies.error) throw new Error(`copy_report_failed:${copies.error.message}`);
  if (cleanup.error) throw new Error(`cleanup_report_failed:${cleanup.error.message}`);
  if (metrics.error) throw new Error(`metrics_report_failed:${metrics.error.message}`);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    storage: summarizeAssets(assets),
    copies: copies.data ?? [],
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
