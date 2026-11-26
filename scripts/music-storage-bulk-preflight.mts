import { loadProductionEnvFromCwd } from "./load-production-env";
import { createServiceRoleClient } from "../src/lib/supabase/service-role";
import { summarizeBulkProgress } from "../src/lib/music-storage/bulk-migration";
import { evaluateS3QuotaBeforeCopy } from "../src/lib/music-storage/s3-quota-guard";
import {
  headMusicStorageObject,
  MusicStorageConfigurationError,
  musicStorageLocation,
} from "../src/lib/music-storage/server";

loadProductionEnvFromCwd();

async function probeTimewebS3Head(): Promise<{
  ok: boolean;
  probe: string;
  detail?: string;
  sizeBytes?: number;
}> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("music_storage_copies")
    .select("storage_bucket,storage_path")
    .eq("target_provider", "timeweb_s3")
    .eq("status", "verified")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return { ok: false, probe: "db", detail: error.message };
  }
  if (!data?.storage_path) {
    return {
      ok: false,
      probe: "none",
      detail: "no_verified_s3_copy_to_head",
    };
  }
  const bucket = (data.storage_bucket as string | null) ?? "music-masters";
  const location = musicStorageLocation({
    provider: "timeweb_s3",
    bucket,
    path: data.storage_path as string,
  });
  try {
    const head = await headMusicStorageObject(location, service);
    if (!head) {
      return { ok: false, probe: "head", detail: "object_missing_or_head_failed" };
    }
    return { ok: true, probe: "head", sizeBytes: head.sizeBytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (err instanceof MusicStorageConfigurationError) {
      return { ok: false, probe: "config", detail: message };
    }
    return { ok: false, probe: "head", detail: message };
  }
}

async function main() {
  const totals = await summarizeBulkProgress("copy");
  const s3QuotaFullRemain = await evaluateS3QuotaBeforeCopy(totals.pendingBytes);
  const s3Head = await probeTimewebS3Head();

  const quotaOk = totals.pendingBytes === 0 || s3QuotaFullRemain.ok;
  const s3ReachableOk = totals.copiesVerified === 0 ? !s3Head.detail?.includes("not_configured") : s3Head.ok;

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: "bulk_copy_preflight",
    copyProgress: totals,
    s3QuotaFullRemainingMasters: s3QuotaFullRemain,
    s3EndpointReachable: s3Head,
    preflightOk: quotaOk && s3ReachableOk,
  };

  console.log(JSON.stringify(payload, null, 2));
  if (!payload.preflightOk) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});