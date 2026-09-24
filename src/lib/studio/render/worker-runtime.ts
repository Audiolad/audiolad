import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE,
  CATALOG_MUSIC_UNAVAILABLE,
} from "../catalog-asset";
import {
  renderStudioProjectToMp3,
  StudioRenderChildAbortedError,
  StudioRenderDurationError,
} from "./render";
import {
  assertCatalogRenderAccessStillValid,
  materializeCatalogRenderSource,
  snapshotHasCatalogMusic,
  StudioCatalogMusicUnavailableError,
} from "./catalog-source";
import {
  assertStudioRenderTimelineSafe,
  StudioRenderTimelineGuardError,
} from "./timeline-guard";
import {
  assertStudioRenderDiskSpace,
  createStudioRenderTempWorkspace,
  removeStudioRenderTempWorkspace,
  StudioRenderDiskSpaceError,
  sweepStaleStudioRenderTempDirs,
} from "./temp-workspace";
import { renderOutputPath } from "./storage";
import type { StudioRenderSnapshot } from "./types";
import { isStudioRenderCatalogAsset, isStudioRenderFileAsset } from "./types";
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

export const STUDIO_RENDER_PREPARE_FAILED_MESSAGE =
  "Не удалось подготовить экспорт. Исходники проекта сохранены.";

export type StudioRenderFailureStage =
  | "timeline"
  | "disk"
  | "workspace"
  | "asset_download"
  | "catalog_materialize"
  | "ffmpeg"
  | "access"
  | "lease"
  | "upload"
  | "unknown";

export class StudioRenderStageError extends Error {
  readonly stage: Exclude<StudioRenderFailureStage, "unknown">;
  readonly code: string;
  readonly safeMessage: string;

  constructor(input: {
    stage: Exclude<StudioRenderFailureStage, "unknown">;
    code: string;
    message: string;
    safeMessage?: string;
  }) {
    super(input.message);
    this.name = "StudioRenderStageError";
    this.stage = input.stage;
    this.code = input.code;
    this.safeMessage = input.safeMessage ?? STUDIO_RENDER_PREPARE_FAILED_MESSAGE;
  }
}

const STORAGE_PATH_REPLACE_ERROR = "Cannot read properties of undefined (reading 'replace')";

export function readStudioRenderErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    error
    && typeof error === "object"
    && "message" in error
    && typeof error.message === "string"
    && error.message
  ) {
    return error.message;
  }
  return "unknown_error";
}

export function sanitizeStudioRenderErrorMessage(error: unknown): string {
  return readStudioRenderErrorMessage(error)
    .replace(/(^|[^A-Za-z0-9_])(token|access_token|apikey|authorization)=[^&#\s]+/gi, "$1$2=redacted")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .slice(0, 500);
}

function isStoragePathReplaceTypeError(error: unknown): boolean {
  return error instanceof TypeError && error.message === STORAGE_PATH_REPLACE_ERROR;
}

export function studioRenderAssetDownloadError(cause: unknown): StudioRenderStageError {
  const storagePathMissing = cause instanceof Error && cause.message === "storage_path_missing";
  return new StudioRenderStageError({
    stage: "asset_download",
    code: "asset_download_failed",
    message: storagePathMissing || isStoragePathReplaceTypeError(cause)
      ? STORAGE_PATH_REPLACE_ERROR
      : sanitizeStudioRenderErrorMessage(cause),
  });
}

export function classifyStudioRenderFailure(error: unknown): {
  stage: StudioRenderFailureStage;
  errorCode: string;
  errorMessageSafe: string;
  internalMessage: string;
} {
  const internalMessage = sanitizeStudioRenderErrorMessage(error);
  if (error instanceof StudioRenderStageError) {
    return {
      stage: error.stage,
      errorCode: error.code,
      errorMessageSafe: error.safeMessage,
      internalMessage,
    };
  }
  const catalogUnavailable =
    (error instanceof StudioCatalogMusicUnavailableError)
    || (error instanceof Error && (error as { code?: string }).code === CATALOG_MUSIC_UNAVAILABLE);
  if (catalogUnavailable) {
    return {
      stage: "catalog_materialize",
      errorCode: CATALOG_MUSIC_UNAVAILABLE,
      errorMessageSafe: CATALOG_MUSIC_EXPORT_UNAVAILABLE_MESSAGE,
      internalMessage,
    };
  }
  if (error instanceof StudioRenderDiskSpaceError) {
    return {
      stage: "disk",
      errorCode: error.code,
      errorMessageSafe: "Недостаточно места на диске для экспорта. Попробуйте позже или сократите проект.",
      internalMessage,
    };
  }
  if (error instanceof StudioRenderTimelineGuardError) {
    return {
      stage: "timeline",
      errorCode: error.code,
      errorMessageSafe: "Некорректная длительность проекта для экспорта. Проверьте расположение клипов на таймлайне.",
      internalMessage,
    };
  }
  if (error instanceof StudioRenderDurationError) {
    return {
      stage: "ffmpeg",
      errorCode: error.code,
      errorMessageSafe: STUDIO_RENDER_PREPARE_FAILED_MESSAGE,
      internalMessage,
    };
  }
  if (isStoragePathReplaceTypeError(error)) {
    return {
      stage: "asset_download",
      errorCode: "asset_download_failed",
      errorMessageSafe: STUDIO_RENDER_PREPARE_FAILED_MESSAGE,
      internalMessage,
    };
  }
  return {
    stage: "unknown",
    errorCode: "render_failed",
    errorMessageSafe: STUDIO_RENDER_PREPARE_FAILED_MESSAGE,
    internalMessage,
  };
}

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

export type StudioRenderExecuteDeps = {
  renderToMp3?: typeof renderStudioProjectToMp3;
  assertDiskSpace?: typeof assertStudioRenderDiskSpace;
  assertTimeline?: typeof assertStudioRenderTimelineSafe;
  sweepStale?: typeof sweepStaleStudioRenderTempDirs;
  createWorkspace?: typeof createStudioRenderTempWorkspace;
  removeWorkspace?: typeof removeStudioRenderTempWorkspace;
};

export async function executeClaimedStudioRenderJob(
  service: SupabaseClient,
  job: ClaimedStudioRenderJob,
  signal: AbortSignal = new AbortController().signal,
  leaseSeconds = STUDIO_RENDER_LEASE_SECONDS,
  deps: StudioRenderExecuteDeps = {},
): Promise<StudioRenderExecuteResult> {
  const sweepStale = deps.sweepStale ?? sweepStaleStudioRenderTempDirs;
  const assertDiskSpace = deps.assertDiskSpace ?? assertStudioRenderDiskSpace;
  const assertTimeline = deps.assertTimeline ?? assertStudioRenderTimelineSafe;
  const createWorkspace = deps.createWorkspace ?? createStudioRenderTempWorkspace;
  const removeWorkspace = deps.removeWorkspace ?? removeStudioRenderTempWorkspace;
  await sweepStale();
  const snapshot = job.project_snapshot;
  const timelineDurationSeconds = assertTimeline(snapshot);
  await assertDiskSpace({ durationSeconds: timelineDurationSeconds });
  let workspace: string;
  try {
    workspace = await createWorkspace({ jobId: job.id });
  } catch (error) {
    if (error instanceof StudioRenderDiskSpaceError || error instanceof StudioRenderAbandonedError) {
      throw error;
    }
    throw new StudioRenderStageError({
      stage: "workspace",
      code: "workspace_failed",
      message: sanitizeStudioRenderErrorMessage(error),
    });
  }
  try {
    const paths = new Map<string, string>();
    for (const asset of snapshot.assets) {
      if (signal.aborted) throw new StudioRenderAbandonedError();
      if (isStudioRenderCatalogAsset(asset)) {
        try {
          const path = await materializeCatalogRenderSource(service, {
            jobProjectId: job.project_id,
            asset,
            workspace,
          });
          paths.set(asset.id, path);
        } catch (error) {
          if (error instanceof StudioRenderAbandonedError || signal.aborted) {
            throw error instanceof StudioRenderAbandonedError ? error : new StudioRenderAbandonedError();
          }
          if (error instanceof StudioCatalogMusicUnavailableError) throw error;
          throw new StudioRenderStageError({
            stage: "catalog_materialize",
            code: "catalog_materialize_failed",
            message: sanitizeStudioRenderErrorMessage(error),
          });
        }
        continue;
      }
      if (!isStudioRenderFileAsset(asset)) {
        throw studioRenderAssetDownloadError(new Error("source_unavailable"));
      }
      if (typeof asset.storagePath !== "string" || asset.storagePath.trim() === "") {
        throw studioRenderAssetDownloadError(new Error("storage_path_missing"));
      }
      let data: { arrayBuffer: () => Promise<ArrayBuffer> } | null = null;
      let downloadError: unknown = null;
      try {
        const downloaded = await service.storage
          .from(assetsBucket)
          .download(asset.storagePath);
        data = downloaded.data;
        downloadError = downloaded.error;
      } catch (error) {
        if (error instanceof StudioRenderAbandonedError || signal.aborted) {
          throw error instanceof StudioRenderAbandonedError ? error : new StudioRenderAbandonedError();
        }
        throw studioRenderAssetDownloadError(error);
      }
      if (signal.aborted) throw new StudioRenderAbandonedError();
      if (downloadError || !data) throw studioRenderAssetDownloadError(downloadError ?? new Error("source_unavailable"));
      const path = join(workspace, `${asset.id}.audio`);
      await writeFile(path, Buffer.from(await data.arrayBuffer()));
      paths.set(asset.id, path);
    }
    let result;
    try {
      const renderToMp3 = deps.renderToMp3 ?? renderStudioProjectToMp3;
      result = await renderToMp3(
        { snapshot, localAssetPaths: paths },
        { renderId: job.id, outputDirectory: workspace, signal },
      );
    } catch (error) {
      if (error instanceof StudioRenderChildAbortedError || signal.aborted) {
        throw new StudioRenderAbandonedError();
      }
      if (
        error instanceof StudioRenderDurationError
        || error instanceof StudioRenderStageError
        || error instanceof StudioRenderAbandonedError
      ) {
        throw error;
      }
      throw new StudioRenderStageError({
        stage: "ffmpeg",
        code: "ffmpeg_failed",
        message: sanitizeStudioRenderErrorMessage(error),
      });
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
    if (snapshotHasCatalogMusic(snapshot)) {
      try {
        await assertCatalogRenderAccessStillValid(service, {
          jobProjectId: job.project_id,
          snapshot,
        });
      } catch (error) {
        if (error instanceof StudioCatalogMusicUnavailableError) throw error;
        if (signal.aborted) throw new StudioRenderAbandonedError();
        throw new StudioRenderStageError({
          stage: "access",
          code: "catalog_access_failed",
          message: sanitizeStudioRenderErrorMessage(error),
        });
      }
    }
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
      if (uploadError) {
        throw new StudioRenderStageError({
          stage: "upload",
          code: "output_upload_failed",
          message: sanitizeStudioRenderErrorMessage(uploadError),
        });
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      stream.destroy();
    }
    return { sizeBytes: result.sizeBytes };
  } finally {
    await removeWorkspace(workspace);
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
  const classified = classifyStudioRenderFailure(error);
  console.error(JSON.stringify({
    event: "studio_render_failed",
    jobId: job.id,
    projectId: job.project_id,
    snapshotRevision: (job.project_snapshot as StudioRenderSnapshot).project?.revision ?? null,
    stage: classified.stage,
    errorCode: classified.errorCode,
    error: classified.internalMessage,
  }));
  const { data: failedJob, error: failureUpdateError } = await service
    .from("studio_render_jobs")
    .update({
      status: "failed",
      error_code: classified.errorCode,
      error_message_safe: classified.errorMessageSafe,
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

export { sweepStaleStudioRenderTempDirs, StudioRenderDiskSpaceError } from "./temp-workspace";
