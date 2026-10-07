import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PRODUCT_VIDEO_EXPORT_BUCKET,
  PRODUCT_VIDEO_EXPORT_LEASE_SECONDS,
  PRODUCT_VIDEO_EXPORT_MAX_ATTEMPTS,
  parseProductVideoOrientation,
  type ProductVideoOrientation,
} from "./contract";
import {
  ProductVideoRenderAbortedError,
  ProductVideoRenderStalledError,
  renderProductVideo,
} from "./ffmpeg";
import {
  PRODUCT_VIDEO_PROGRESS_WRITE_MIN_INTERVAL_MS,
  createProductVideoProgressPersister,
} from "./progress";

export type ClaimedProductVideoRenderJob = {
  id: string;
  practice_id: string;
  author_id: string;
  audio_item_id: string;
  orientation: ProductVideoOrientation;
  source_audio_path: string;
  source_cover_path: string;
  output_storage_path: string;
  attempt_count: number;
  lease_token: string;
};

export type ProductVideoRenderWorkerPort = {
  recoverStaleJobs: () => Promise<void>;
  claimJob: () => Promise<ClaimedProductVideoRenderJob | null>;
  renewLease: (job: ClaimedProductVideoRenderJob) => Promise<boolean>;
  reportProgress: (
    job: ClaimedProductVideoRenderJob,
    percent: number,
  ) => Promise<boolean>;
  executeJob: (
    job: ClaimedProductVideoRenderJob,
    signal: AbortSignal,
  ) => Promise<{ sizeBytes: number }>;
  completeJob: (
    job: ClaimedProductVideoRenderJob,
    result: { sizeBytes: number },
  ) => Promise<boolean>;
  failJob: (
    job: ClaimedProductVideoRenderJob,
    error: unknown,
  ) => Promise<boolean>;
};

export function parseClaimedProductVideoRenderJob(
  raw: unknown,
): ClaimedProductVideoRenderJob | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  const rec = row as Record<string, unknown>;
  const orientation = parseProductVideoOrientation(rec.orientation);
  if (
    !orientation ||
    typeof rec.id !== "string" ||
    typeof rec.practice_id !== "string" ||
    typeof rec.author_id !== "string" ||
    typeof rec.audio_item_id !== "string" ||
    typeof rec.source_audio_path !== "string" ||
    typeof rec.source_cover_path !== "string" ||
    typeof rec.output_storage_path !== "string" ||
    typeof rec.lease_token !== "string"
  ) {
    return null;
  }
  return {
    id: rec.id,
    practice_id: rec.practice_id,
    author_id: rec.author_id,
    audio_item_id: rec.audio_item_id,
    orientation,
    source_audio_path: rec.source_audio_path,
    source_cover_path: rec.source_cover_path,
    output_storage_path: rec.output_storage_path,
    attempt_count:
      typeof rec.attempt_count === "number" ? rec.attempt_count : 0,
    lease_token: rec.lease_token,
  };
}

function classifyFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ProductVideoRenderStalledError) {
    return { code: "ffmpeg_stalled", message: "Создание видео остановилось. Попробуйте ещё раз." };
  }
  if (error instanceof ProductVideoRenderAbortedError) {
    return { code: "worker_lease_lost", message: "Создание видео прервано. Попробуйте ещё раз." };
  }
  const errorCode =
    error && typeof error === "object"
      ? (error as { code?: unknown }).code
      : undefined;
  const code = typeof errorCode === "string" ? errorCode : "render_failed";
  return { code, message: "Не удалось создать видео. Попробуйте ещё раз." };
}

export function createProductVideoRenderWorkerPort(
  service: SupabaseClient,
): ProductVideoRenderWorkerPort {
  return {
    async recoverStaleJobs() {
      const { error } = await service.rpc("recover_stale_product_video_render_jobs", {
        p_max_attempts: PRODUCT_VIDEO_EXPORT_MAX_ATTEMPTS,
      });
      if (error) throw error;
    },

    async claimJob() {
      const { data, error } = await service.rpc("claim_product_video_render_job", {
        p_lease_seconds: PRODUCT_VIDEO_EXPORT_LEASE_SECONDS,
        p_max_attempts: PRODUCT_VIDEO_EXPORT_MAX_ATTEMPTS,
      });
      if (error) throw error;
      return parseClaimedProductVideoRenderJob(data);
    },

    async renewLease(job) {
      const { data, error } = await service.rpc(
        "renew_product_video_render_job_lease",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_lease_seconds: PRODUCT_VIDEO_EXPORT_LEASE_SECONDS,
        },
      );
      if (error) throw error;
      return data === true;
    },

    async reportProgress(job, percent) {
      const { data, error } = await service.rpc(
        "report_product_video_render_progress",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_progress_percent: percent,
        },
      );
      if (error) throw error;
      return data === true;
    },

    async executeJob(job, signal) {
      const workspace = await mkdtemp(join(tmpdir(), "audiolad-product-video-"));
      try {
        const [audioDownload, coverDownload] = await Promise.all([
          service.storage.from("practice-audio").download(job.source_audio_path),
          service.storage
            .from(PRODUCT_VIDEO_EXPORT_BUCKET)
            .download(job.source_cover_path),
        ]);
        if (signal.aborted) throw new ProductVideoRenderAbortedError();
        if (audioDownload.error || !audioDownload.data) {
          throw new Error("audio_source_unavailable");
        }
        if (coverDownload.error || !coverDownload.data) {
          throw new Error("cover_source_unavailable");
        }

        const audioPath = join(workspace, "source.audio");
        const coverPath = join(workspace, "cover.webp");
        const outputPath = join(workspace, "output.mp4");
        await Promise.all([
          writeFile(audioPath, Buffer.from(await audioDownload.data.arrayBuffer())),
          writeFile(coverPath, Buffer.from(await coverDownload.data.arrayBuffer())),
        ]);
        const persister = createProductVideoProgressPersister({
          minIntervalMs: PRODUCT_VIDEO_PROGRESS_WRITE_MIN_INTERVAL_MS,
          write: async (percent) => {
            try {
              await this.reportProgress(job, percent);
            } catch (error) {
              console.error(
                "product_video_progress_write_error",
                error instanceof Error ? error.message : "unknown",
              );
            }
          },
        });
        const result = await renderProductVideo({
          audioPath,
          coverPath,
          outputPath,
          orientation: job.orientation,
          signal,
          onProgress: (percent) => persister.note(percent),
        });
        await persister.settle();

        const stillOwns = await this.renewLease(job);
        if (!stillOwns || signal.aborted) {
          throw new ProductVideoRenderAbortedError();
        }

        const stream = createReadStream(outputPath);
        const { error: uploadError } = await service.storage
          .from(PRODUCT_VIDEO_EXPORT_BUCKET)
          .upload(job.output_storage_path, stream, {
            contentType: "video/mp4",
            cacheControl: "31536000",
            upsert: true,
            duplex: "half",
          });
        stream.destroy();
        if (uploadError) throw new Error("output_upload_failed");
        return result;
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    },

    async completeJob(job) {
      const { data, error } = await service
        .from("product_video_render_jobs")
        .update({
          status: "completed",
          progress_percent: 100,
          completed_at: new Date().toISOString(),
          lease_token: null,
          lease_expires_at: null,
          error_code: null,
          error_message_safe: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("lease_token", job.lease_token)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.id);
    },

    async failJob(job, error) {
      if (error instanceof ProductVideoRenderAbortedError) return false;
      const failure = classifyFailure(error);
      const { data, error: updateError } = await service
        .from("product_video_render_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          lease_token: null,
          lease_expires_at: null,
          error_code: failure.code,
          error_message_safe: failure.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("lease_token", job.lease_token)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      return Boolean(data?.id);
    },
  };
}
