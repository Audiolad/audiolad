import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { listStudioAssets, getStudioProject } from "./repository";
import { StudioApiError } from "./validation";
import { parseStudioProjectData } from "./validation";
import {
  createStudioRenderSnapshot,
  StudioRenderSnapshotError,
} from "../render/snapshot";
import { buildStudioRenderTimeline } from "../render/timeline";
export { renderOutputPath } from "../render/storage";

export const STUDIO_RENDER_BUCKET = "studio-renders";
export type StudioRenderJob = {
  id: string; project_id: string; project_revision: number;
  status: "queued" | "processing" | "completed" | "failed";
  output_storage_path: string | null; error_code: string | null;
  error_message_safe: string | null; created_at: string; completed_at: string | null;
};

export async function createStudioRenderJob(projectId: string): Promise<StudioRenderJob> {
  const project = await getStudioProject(projectId);
  parseStudioProjectData(project.project_data);
  const assets = await listStudioAssets(projectId);
  let snapshot;
  try {
    snapshot = createStudioRenderSnapshot({
      project,
      expectedRevision: project.revision,
      assets,
    });
  } catch (error) {
    if (error instanceof StudioRenderSnapshotError) {
      throw new StudioApiError("invalid_project_asset", 422);
    }
    throw error;
  }
  if (buildStudioRenderTimeline(snapshot).durationSeconds <= 0) {
    throw new StudioApiError("no_active_tracks", 422);
  }
  const service = createServiceRoleClient();
  const { data: job, error } = await service.from("studio_render_jobs").insert({
    project_id: project.id, author_id: project.author_id, project_revision: project.revision,
    project_snapshot: snapshot,
  }).select("id, project_id, project_revision, status, output_storage_path, error_code, error_message_safe, created_at, completed_at").single();
  if (error?.code === "23505") throw new StudioApiError("render_already_queued", 409);
  if (error || !job) throw new StudioApiError("internal_error", 500);
  return job as StudioRenderJob;
}

export async function getStudioRenderState(projectId: string) {
  const project = await getStudioProject(projectId);
  const service = createServiceRoleClient();
  const { data, error } = await service.from("studio_render_jobs")
    .select("id, project_id, project_revision, status, output_storage_path, error_code, error_message_safe, created_at, completed_at")
    .eq("project_id", project.id)
    .eq("project_revision", project.revision)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new StudioApiError("internal_error", 500);
  return { project, latest: (data ?? null) as StudioRenderJob | null };
}
