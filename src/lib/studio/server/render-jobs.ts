import "server-only";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  STUDIO_GUEST_RENDER_RATE_LIMIT,
  STUDIO_GUEST_RENDER_RATE_WINDOW_MS,
  evaluateGuestRenderCreate,
  guestRenderEntitlementConsumed,
  selectDownloadableStudioRenderJob,
  type StudioDownloadableJob,
} from "../guest-policy";
import { getGuestSession } from "./guest-session";
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
  author_id: string | null;
  guest_session_id: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  output_storage_path: string | null; error_code: string | null;
  error_message_safe: string | null; created_at: string; completed_at: string | null;
};

const RENDER_JOB_SELECT =
  "id, project_id, project_revision, author_id, guest_session_id, status, output_storage_path, error_code, error_message_safe, created_at, completed_at";

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
  if (project.guest_session_id) {
    const session = await getGuestSession();
    if (!session || session.id !== project.guest_session_id) {
      throw new StudioApiError("not_found", 404);
    }
    const { data: activeJob, error: activeError } = await service
      .from("studio_render_jobs")
      .select("id")
      .eq("guest_session_id", session.id)
      .in("status", ["queued", "processing"])
      .maybeSingle();
    if (activeError) {
      throw new StudioApiError("internal_error", 500);
    }
    const rateAllowed = checkAnalyticsRateLimit(
      `studio-guest-render:${session.token_hash}`,
      STUDIO_GUEST_RENDER_RATE_LIMIT,
      STUDIO_GUEST_RENDER_RATE_WINDOW_MS,
    );
    const decision = evaluateGuestRenderCreate({
      consumed: guestRenderEntitlementConsumed(session),
      hasActiveJob: Boolean(activeJob),
      rateLimited: !rateAllowed,
    });
    if (!decision.ok) {
      const status =
        decision.error === "guest_render_entitlement" ? 403
        : decision.error === "render_already_queued" ? 409
        : 429;
      throw new StudioApiError(decision.error, status);
    }
  }

  const { data: job, error } = await service.from("studio_render_jobs").insert({
    project_id: project.id,
    author_id: project.author_id,
    guest_session_id: project.guest_session_id,
    project_revision: project.revision,
    project_snapshot: snapshot,
  }).select(RENDER_JOB_SELECT).single();
  if (error?.code === "23505") throw new StudioApiError("render_already_queued", 409);
  if (error || !job) throw new StudioApiError("internal_error", 500);
  return job as StudioRenderJob;
}

export async function getStudioRenderState(projectId: string) {
  const project = await getStudioProject(projectId);
  const service = createServiceRoleClient();
  const { data, error } = await service.from("studio_render_jobs")
    .select(RENDER_JOB_SELECT)
    .eq("project_id", project.id)
    .eq("project_revision", project.revision)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new StudioApiError("internal_error", 500);

  let entitled: StudioRenderJob | null = null;
  let guestRenderConsumed = false;
  if (project.guest_session_id) {
    const session = await getGuestSession();
    if (session && session.id === project.guest_session_id) {
      guestRenderConsumed = guestRenderEntitlementConsumed(session);
      if (
        session.free_render_job_id &&
        session.free_render_project_id === project.id
      ) {
        const { data: entitledJob, error: entitledError } = await service
          .from("studio_render_jobs")
          .select(RENDER_JOB_SELECT)
          .eq("id", session.free_render_job_id)
          .eq("project_id", project.id)
          .eq("guest_session_id", session.id)
          .eq("status", "completed")
          .maybeSingle();
        if (entitledError) throw new StudioApiError("internal_error", 500);
        entitled = (entitledJob ?? null) as StudioRenderJob | null;
      }
    }
  }

  const latest = (data ?? null) as StudioRenderJob | null;
  const downloadable = selectDownloadableStudioRenderJob({
    projectId: project.id,
    currentRevision: project.revision,
    currentRevisionJob: latest as StudioDownloadableJob | null,
    entitledJob: entitled as StudioDownloadableJob | null,
  });

  return {
    project,
    latest,
    entitled,
    downloadable: downloadable as StudioRenderJob | null,
    guestRenderConsumed,
  };
}
