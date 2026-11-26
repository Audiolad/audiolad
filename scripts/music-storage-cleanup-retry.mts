import { removeMusicStorageObject } from "../src/lib/music-storage/server";
import { createServiceRoleClient } from "../src/lib/supabase/service-role";

async function main() {
  const execute = process.argv.slice(2).includes("--execute");
  const service = createServiceRoleClient();
  const { data: jobs, error } = await service
    .from("music_storage_cleanup_jobs")
    .select("id,provider,storage_bucket,storage_path,attempt_count,updated_at")
    .eq("status", "pending")
    .order("updated_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`cleanup_lookup_failed:${error.message}`);
  if (!execute) {
    console.log(JSON.stringify({
      dryRun: true,
      jobs: jobs ?? [],
      blockedJobsExcluded: true,
      next: "After reviewing the list, re-run with --execute and AUDIOLAD_MUSIC_STORAGE_CLEANUP=1.",
    }, null, 2));
    return;
  }
  if (process.env.AUDIOLAD_MUSIC_STORAGE_CLEANUP !== "1") {
    throw new Error("Execution requires AUDIOLAD_MUSIC_STORAGE_CLEANUP=1");
  }
  const results = [];
  for (const job of jobs ?? []) {
    const removed = await removeMusicStorageObject({
      storage_provider: job.provider,
      storage_bucket: job.storage_bucket,
      storage_path: job.storage_path,
    }, service);
    const now = new Date().toISOString();
    const { error: updateError } = await service
      .from("music_storage_cleanup_jobs")
      .update({
        status: removed ? "resolved" : "pending",
        attempt_count: Number(job.attempt_count ?? 0) + 1,
        last_error_code: removed ? null : "object_delete_failed",
        resolved_at: removed ? now : null,
        updated_at: now,
      })
      .eq("id", job.id)
      .eq("status", "pending");
    if (updateError) throw new Error(`cleanup_status_failed:${updateError.message}`);
    results.push({ id: job.id, outcome: removed ? "resolved" : "failed" });
  }
  console.log(JSON.stringify({ dryRun: false, results }, null, 2));
}

await main().catch((error) => {
  console.error(JSON.stringify({
    error: error instanceof Error ? error.message : "unknown",
  }));
  process.exitCode = 1;
});
