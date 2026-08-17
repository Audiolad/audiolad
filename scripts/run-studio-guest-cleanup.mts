/**
 * One bounded cleanup pass for expired guest Studio sessions.
 * Deletes ONLY expired guest sessions (expires_at < now) and their data.
 * Order: storage objects → render jobs → assets → projects → session.
 * Never deletes author_id IS NOT NULL rows. Idempotent.
 *
 * Ops: cd /var/www/audiolad-deploy/current && npx tsx scripts/run-studio-guest-cleanup.mts
 * PM2: pm2 start deploy/studio-guest-cleanup.ecosystem.config.cjs
 */
import { createClient } from "@supabase/supabase-js";
import { planGuestSessionCleanup } from "../src/lib/studio/guest-policy";

const assetsBucket = "studio-draft-assets";
const outputBucket = "studio-renders";

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("guest_cleanup_environment_missing");
  }
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const now = new Date();
  const { data: sessions, error: sessionError } = await service
    .from("studio_guest_sessions")
    .select("id, expires_at")
    .lt("expires_at", now.toISOString());
  if (sessionError) throw sessionError;
  const expired = sessions ?? [];
  if (expired.length === 0) {
    console.log(JSON.stringify({ cleaned: 0, reason: "no_expired_sessions" }));
    return;
  }
  const sessionIds = expired.map((session) => session.id as string);
  const { data: projects, error: projectError } = await service
    .from("studio_projects")
    .select("id, author_id, guest_session_id")
    .in("guest_session_id", sessionIds)
    .is("author_id", null);
  if (projectError) throw projectError;
  const projectIds = (projects ?? []).map((project) => project.id as string);
  const { data: assets, error: assetError } = projectIds.length
    ? await service
        .from("studio_project_assets")
        .select("id, project_id, storage_path")
        .in("project_id", projectIds)
    : { data: [], error: null };
  if (assetError) throw assetError;
  const { data: jobs, error: jobError } = projectIds.length
    ? await service
        .from("studio_render_jobs")
        .select("id, project_id, author_id, guest_session_id, output_storage_path")
        .in("project_id", projectIds)
        .is("author_id", null)
    : { data: [], error: null };
  if (jobError) throw jobError;

  const plan = planGuestSessionCleanup({
    now,
    sessions: expired.map((session) => ({
      id: session.id as string,
      expires_at: session.expires_at as string,
    })),
    projects: (projects ?? []).map((project) => ({
      id: project.id as string,
      author_id: (project.author_id as string | null) ?? null,
      guest_session_id: (project.guest_session_id as string | null) ?? null,
    })),
    assets: (assets ?? []).map((asset) => ({
      id: asset.id as string,
      project_id: asset.project_id as string,
      storage_path: asset.storage_path as string,
    })),
    jobs: (jobs ?? []).map((job) => ({
      id: job.id as string,
      project_id: job.project_id as string,
      author_id: (job.author_id as string | null) ?? null,
      guest_session_id: (job.guest_session_id as string | null) ?? null,
      output_storage_path: (job.output_storage_path as string | null) ?? null,
    })),
  });

  const draftPaths = plan.storagePaths.filter((path) => path.startsWith("studio/"));
  const renderPaths = plan.storagePaths.filter((path) => !path.startsWith("studio/"));
  if (draftPaths.length > 0) {
    const remove = await service.storage.from(assetsBucket).remove(draftPaths);
    if (remove.error) console.error("studio_guest_cleanup_draft_storage_error", remove.error.message);
  }
  if (renderPaths.length > 0) {
    const remove = await service.storage.from(outputBucket).remove(renderPaths);
    if (remove.error) console.error("studio_guest_cleanup_render_storage_error", remove.error.message);
  }
  if (plan.jobIds.length > 0) {
    const { error } = await service.from("studio_render_jobs").delete().in("id", plan.jobIds).is("author_id", null);
    if (error) throw error;
  }
  if (plan.assetIds.length > 0) {
    const { error } = await service.from("studio_project_assets").delete().in("id", plan.assetIds);
    if (error) throw error;
  }
  if (plan.projectIds.length > 0) {
    const { error } = await service.from("studio_projects").delete().in("id", plan.projectIds).is("author_id", null);
    if (error) throw error;
  }
  if (plan.sessionIds.length > 0) {
    const { error } = await service.from("studio_guest_sessions").delete().in("id", plan.sessionIds);
    if (error) throw error;
  }

  console.log(JSON.stringify({
    sessions: plan.sessionIds.length,
    projects: plan.projectIds.length,
    assets: plan.assetIds.length,
    jobs: plan.jobIds.length,
    storageObjects: plan.storagePaths.length,
  }));
}

void main().catch((error) => {
  console.error("studio-guest-cleanup:", error);
  process.exitCode = 1;
});
