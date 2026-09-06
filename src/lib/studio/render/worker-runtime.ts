import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  renderStudioProjectToMp3,
  StudioRenderChildAbortedError,
  StudioRenderDurationError,
} from "./render";
import { renderOutputPath } from "./storage";
import type { StudioRenderSnapshot } from "./types";
import {
  allowStudioRenderOutputUpload,
  parseClaimedStudioRenderJob,
  StudioRenderAbandonedError,
  STUDIO_RENDER_LEASE_SECONDS,
  type ClaimedStudioRenderJob,
  type StudioRenderExecuteResult,
  type StudioRenderWorkerPort,
} from "./worker";

const assetsBucket = "studio-draft-assets";
const outputBucket = "studio-renders";

export function createStudioRenderWorkerPort(
  service: SupabaseClient,
  options: { leaseSeconds?: number } = {},
): StudioRenderWorkerPort {
  const leaseSeconds = options.leaseSeconds ?? STUDIO_RENDER_LEASE_SECONDS;

  return {
    async recoverStaleJobs() {
      const { error } = await service.rpc("recover_stale_studio_render_jobs");
      if (error) throw error;
    },

    async claimJob() {
      const { data: claimed, error } = await service.rpc("claim_studio_render_job", {
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return parseClaimedStudioRenderJob(claimed);
    },

    async renewLease(job) {
      const { data, error } = await service.rpc("renew_studio_render_job_lease", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return data === true;
    },

    async executeJob(job, signal) {
      return executeClaimedStudioRenderJob(service, job, signal, leaseSeconds);
    },

    async completeJob(job, result) {
      return completeClaimedStudioRenderJob(service, job, result);
    },

    async failJob(job, error) {
      return failClaimedStudioRenderJob(service, job, error);
    },

    async releaseJob(job) {
      const { data, error } = await service.rpc("release_studio_render_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
      });
      if (error) {
        console.error("studio-render-worker: release failed", error.message);
        return false;
      }
      return data === true;
    },
  };
}

export async function executeClaimedStudioRenderJob(
  service: SupabaseClient,
  job: ClaimedStudioRenderJob,
  signal: AbortSignal = new AbortController().signal,
  leaseSeconds = STUDIO_RENDER_LEASE_SECONDS,
): Promise<StudioRenderExecuteResult> {
  const workspace = join(tmpdir(), `audiolad-render-${randomUUID()}`);
  try {
    await mkdir(workspace, { recursive: true });
    const snapshot = job.project_snapshot;
    const paths = new Map<string, string>();
    for (const asset of snapshot.assets) {
      const { data, error: downloadError } = await service.storage
        .from(assetsBucket)
        .download(asset.storagePath);
      if (downloadError || !data) throw new Error("source_unavailable");
      const path = join(workspace, `${asset.id}.audio`);
      await writeFile(path, Buffer.from(await data.arrayBuffer()));
      paths.set(asset.id, path);
    }
    let result;
    try {
      result = await renderStudioProjectToMp3(
        { snapshot, localAssetPaths: paths },
        { renderId: job.id, outputDirectory: workspace, signal },
      );
    } catch (error) {
      if (error instanceof StudioRenderChildAbortedError || signal.aborted) {
        throw new StudioRenderAbandonedError();
      }
      throw error;
    }
    console.log(JSON.stringify({
      event: "studio_render_completed",
      jobId: job.id,
      projectId: job.project_id,
      snapshotRevision: snapshot.project.revision,
      expectedTimelineDurationSeconds: result.expectedDurationSeconds,
      perTrackMaxEndSeconds: snapshot.tracks.map((track) => ({
        trackId: track.id,
        maxEndSeconds: Math.max(...track.clips.map((clip) => clip.startTime + clip.duration)),
      })),
      actualDurationSeconds: result.actualDurationSeconds,
      durationDeltaSeconds: result.durationDeltaSeconds,
      ffmpegExitCode: 0,
      ffmpegStderrSummary: result.stderr.slice(-1000),
    }));
    const outputPath = renderOutputPath(job.id);
    const mayUpload = await allowStudioRenderOutputUpload(signal, async () => {
      const { data, error } = await service.rpc("renew_studio_render_job_lease", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return data === true;
    });
    if (!mayUpload) throw new StudioRenderAbandonedError();
    const stream = createReadStream(result.outputPath);
    const onAbort = () => stream.destroy();
    signal.addEventListener("abort", onAbort);
    try {
      if (signal.aborted) throw new StudioRenderAbandonedError();
      const { error: uploadError } = await service.storage
        .from(outputBucket)
        .upload(outputPath, stream, {
          contentType: "audio/mpeg",
          upsert: true,
          duplex: "half",
        });
      if (signal.aborted) throw new StudioRenderAbandonedError();
      if (uploadError) throw uploadError;
    } finally {
      signal.removeEventListener("abort", onAbort);
      stream.destroy();
    }
    return { sizeBytes: result.sizeBytes };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function completeClaimedStudioRenderJob(
  service: SupabaseClient,
  job: ClaimedStudioRenderJob,
  result: StudioRenderExecuteResult,
): Promise<boolean> {
  const outputPath = renderOutputPath(job.id);
  const { data: completedJob, error: completionError } = await service
    .from("studio_render_jobs")
    .update({
      status: "completed",
      output_storage_path: outputPath,
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      lease_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("lease_token", job.lease_token)
    .select("id")
    .maybeSingle();
  if (completionError || !completedJob) {
    return false;
  }
  if (typeof job.guest_session_id === "string" && job.guest_session_id) {
    const consumedAt = new Date().toISOString();
    const { error: entitlementError } = await service
      .from("studio_guest_sessions")
      .update({
        free_render_consumed_at: consumedAt,
        free_render_project_id: job.project_id,
        free_render_job_id: job.id,
      })
      .eq("id", job.guest_session_id)
      .is("free_render_consumed_at", null);
    if (entitlementError) {
      console.error("studio-render-worker: guest entitlement update failed", entitlementError.message);
    }
  }
  console.log(JSON.stringify({ jobId: job.id, status: "completed", bytes: result.sizeBytes }));
  return true;
}

export async function failClaimedStudioRenderJob(
  service: SupabaseClient,
  job: ClaimedStudioRenderJob,
  error: unknown,
): Promise<boolean> {
  if (error instanceof StudioRenderAbandonedError || error instanceof StudioRenderChildAbortedError) {
    return false;
  }
  const errorCode = error instanceof StudioRenderDurationError
    ? error.code
    : "render_failed";
  console.error(JSON.stringify({
    event: "studio_render_failed",
    jobId: job.id,
    projectId: job.project_id,
    snapshotRevision: (job.project_snapshot as StudioRenderSnapshot).project?.revision ?? null,
    errorCode,
    error: error instanceof Error ? error.message : "unknown_error",
  }));
  const { data: failedJob, error: failureUpdateError } = await service
    .from("studio_render_jobs")
    .update({
      status: "failed",
      error_code: errorCode,
      error_message_safe: "Не удалось подготовить экспорт. Исходники проекта сохранены.",
      lease_expires_at: null,
      lease_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("lease_token", job.lease_token)
    .select("id")
    .maybeSingle();
  if (failureUpdateError || !failedJob) {
    console.error("studio-render-worker: failure state was not persisted", failureUpdateError?.message);
    return false;
  }
  return true;
}
