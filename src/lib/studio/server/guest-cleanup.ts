import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { STUDIO_ASSETS_BUCKET } from "./model";
import { STUDIO_RENDER_BUCKET } from "./render-jobs";
import { planGuestSessionCleanup } from "../guest-policy";

export type GuestCleanupResult = {
  sessions: number;
  projects: number;
  assets: number;
  jobs: number;
  storageObjects: number;
};

export async function cleanupExpiredGuestSessions(
  now = new Date(),
): Promise<GuestCleanupResult> {
  const service = createServiceRoleClient();
  const { data: sessions, error: sessionError } = await service
    .from("studio_guest_sessions")
    .select("id, expires_at")
    .lt("expires_at", now.toISOString());
  if (sessionError) {
    throw new Error(`studio_guest_cleanup_sessions: ${sessionError.message}`);
  }

  const expired = sessions ?? [];
  if (expired.length === 0) {
    return { sessions: 0, projects: 0, assets: 0, jobs: 0, storageObjects: 0 };
  }

  const sessionIds = expired.map((session) => session.id as string);
  const { data: projects, error: projectError } = await service
    .from("studio_projects")
    .select("id, author_id, guest_session_id")
    .in("guest_session_id", sessionIds)
    .is("author_id", null);
  if (projectError) {
    throw new Error(`studio_guest_cleanup_projects: ${projectError.message}`);
  }

  const projectIds = (projects ?? []).map((project) => project.id as string);
  const { data: assets, error: assetError } = projectIds.length
    ? await service
        .from("studio_project_assets")
    .select("id, project_id, storage_path, source_id")
        .in("project_id", projectIds)
    : { data: [], error: null };
  if (assetError) {
    throw new Error(`studio_guest_cleanup_assets: ${assetError.message}`);
  }

  const { data: jobs, error: jobError } = projectIds.length
    ? await service
        .from("studio_render_jobs")
        .select("id, project_id, author_id, guest_session_id, output_storage_path")
        .in("project_id", projectIds)
        .is("author_id", null)
    : { data: [], error: null };
  if (jobError) {
    throw new Error(`studio_guest_cleanup_jobs: ${jobError.message}`);
  }

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

  const releasedSourcePaths: string[] = [];
  for (const asset of assets ?? []) {
    const { data, error } = await service.rpc("release_studio_project_asset", {
      p_project_id: asset.project_id,
      p_asset_id: asset.id,
    });
    // An already-released reference is safe to hard-delete during expiry cleanup.
    if (error && !error.message.includes("project_not_found")) {
      throw new Error(`studio_guest_cleanup_release_assets: ${error.message}`);
    }
    releasedSourcePaths.push(...(data ?? []).map((row: { storage_path: string }) => row.storage_path));
  }

  const draftPaths = releasedSourcePaths;
  const renderPaths = (jobs ?? [])
    .map((job) => job.output_storage_path as string | null)
    .filter((path): path is string => Boolean(path));

  if (draftPaths.length > 0) {
    const remove = await service.storage.from(STUDIO_ASSETS_BUCKET).remove(draftPaths);
    if (remove.error) {
      console.error("studio_guest_cleanup_draft_storage_error", remove.error.message);
    }
  }
  if (renderPaths.length > 0) {
    const remove = await service.storage.from(STUDIO_RENDER_BUCKET).remove(renderPaths);
    if (remove.error) {
      console.error("studio_guest_cleanup_render_storage_error", remove.error.message);
    }
  }

  if (plan.jobIds.length > 0) {
    const { error } = await service
      .from("studio_render_jobs")
      .delete()
      .in("id", plan.jobIds)
      .is("author_id", null);
    if (error) throw new Error(`studio_guest_cleanup_delete_jobs: ${error.message}`);
  }
  if (plan.assetIds.length > 0) {
    const { error } = await service
      .from("studio_project_assets")
      .delete()
      .in("id", plan.assetIds);
    if (error) throw new Error(`studio_guest_cleanup_delete_assets: ${error.message}`);
  }
  const sourceIds = [...new Set((assets ?? []).map((asset) => asset.source_id as string))];
  if (sourceIds.length > 0) {
    const { error } = await service
      .from("studio_asset_sources")
      .delete()
      .in("id", sourceIds)
      .not("deleted_at", "is", null);
    if (error) throw new Error(`studio_guest_cleanup_delete_sources: ${error.message}`);
  }
  if (plan.projectIds.length > 0) {
    const { error } = await service
      .from("studio_projects")
      .delete()
      .in("id", plan.projectIds)
      .is("author_id", null);
    if (error) throw new Error(`studio_guest_cleanup_delete_projects: ${error.message}`);
  }
  if (plan.sessionIds.length > 0) {
    const { error } = await service
      .from("studio_guest_sessions")
      .delete()
      .in("id", plan.sessionIds);
    if (error) throw new Error(`studio_guest_cleanup_delete_sessions: ${error.message}`);
  }

  return {
    sessions: plan.sessionIds.length,
    projects: plan.projectIds.length,
    assets: plan.assetIds.length,
    jobs: plan.jobIds.length,
    storageObjects: plan.storagePaths.length,
  };
}
