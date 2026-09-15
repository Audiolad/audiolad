import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PRACTICE_AUDIO_BUCKET } from "@/lib/author-products/product-audio-upload-contract";

import {
  PRODUCT_AUDIO_NORMALIZE_LEASE_SECONDS,
  PRODUCT_AUDIO_NORMALIZE_MAX_ATTEMPTS,
  classifyProductNormalizeError,
} from "./contract";
import {
  ProductNormalizeAbortedError,
  ProductNormalizeOutputInvalidError,
  ProductNormalizeSourceInvalidError,
  assertValidProductSourceFile,
  normalizeProductSourceToMp3,
  validateProductDeliveryMp3File,
} from "./ffmpeg";
import {
  parseClaimedProductNormalizeJob,
  type ClaimedProductNormalizeJob,
  type ProductNormalizeCleanupDecision,
  type ProductNormalizeExecuteResult,
  type ProductNormalizeWorkerPort,
} from "./worker";

export class ProductNormalizeCodedError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProductNormalizeCodedError";
  }
}

async function loadPracticeStatus(
  service: SupabaseClient,
  practiceId: string,
): Promise<"draft" | "published"> {
  const { data } = await service
    .from("practices")
    .select("status")
    .eq("id", practiceId)
    .maybeSingle();
  return data?.status === "published" ? "published" : "draft";
}

async function downloadPracticeObject(
  service: SupabaseClient,
  storagePath: string,
  destPath: string,
): Promise<void> {
  const { data, error } = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .download(storagePath);
  if (error || !data) throw new ProductNormalizeCodedError("source_unavailable");
  await writeFile(destPath, Buffer.from(await data.arrayBuffer()));
}

async function uploadPracticeMp3(
  service: SupabaseClient,
  storagePath: string,
  localPath: string,
  signal: AbortSignal,
): Promise<void> {
  const stream = createReadStream(localPath);
  const onAbort = () => stream.destroy();
  signal.addEventListener("abort", onAbort);
  try {
    if (signal.aborted) throw new ProductNormalizeAbortedError();
    const { error } = await service.storage
      .from(PRACTICE_AUDIO_BUCKET)
      .upload(storagePath, stream, {
        contentType: "audio/mpeg",
        upsert: false,
        duplex: "half",
      });
    if (signal.aborted) throw new ProductNormalizeAbortedError();
    if (error) throw new ProductNormalizeCodedError("upload_failed");
  } finally {
    signal.removeEventListener("abort", onAbort);
    stream.destroy();
  }
}

export async function executeClaimedProductNormalizeJob(
  service: SupabaseClient,
  job: ClaimedProductNormalizeJob,
  signal: AbortSignal = new AbortController().signal,
): Promise<ProductNormalizeExecuteResult> {
  const workspace = join(tmpdir(), `audiolad-product-normalize-${randomUUID()}`);
  const cleanupPaths: string[] = [];
  try {
    await mkdir(workspace, { recursive: true });
    const sourcePath = join(
      workspace,
      `source.${job.source_format === "m4a" ? "m4a" : "aac"}`,
    );
    const outputPath = join(workspace, "delivery.mp3");
    await downloadPracticeObject(service, job.source_storage_path, sourcePath);
    if (signal.aborted) throw new ProductNormalizeAbortedError();

    const source = await assertValidProductSourceFile(
      sourcePath,
      job.source_format,
      signal,
    );

    try {
      await normalizeProductSourceToMp3(sourcePath, outputPath, signal);
    } catch (error) {
      if (error instanceof ProductNormalizeAbortedError || signal.aborted) {
        throw new ProductNormalizeAbortedError();
      }
      throw new ProductNormalizeCodedError("normalize_failed");
    }

    let validated: { sizeBytes: number; durationSeconds: number };
    try {
      validated = await validateProductDeliveryMp3File(
        outputPath,
        source.durationSeconds,
        signal,
      );
    } catch (error) {
      if (error instanceof ProductNormalizeAbortedError) throw error;
      throw new ProductNormalizeOutputInvalidError();
    }

    await uploadPracticeMp3(service, job.target_storage_path, outputPath, signal);
    cleanupPaths.push(job.target_storage_path);

    const productStatus = await loadPracticeStatus(service, job.practice_id);
    return {
      targetStoragePath: job.target_storage_path,
      sizeBytes: validated.sizeBytes,
      durationSeconds: Math.round(validated.durationSeconds),
      originalFileName: job.source_original_filename,
      productStatus,
      cleanupPaths,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export function createProductAudioNormalizeWorkerPort(
  service: SupabaseClient,
  options: { leaseSeconds?: number; maxAttempts?: number } = {},
): ProductNormalizeWorkerPort {
  const leaseSeconds = options.leaseSeconds ?? PRODUCT_AUDIO_NORMALIZE_LEASE_SECONDS;
  const maxAttempts = options.maxAttempts ?? PRODUCT_AUDIO_NORMALIZE_MAX_ATTEMPTS;

  return {
    async recoverStaleJobs() {
      const { error } = await service.rpc("recover_stale_product_audio_normalize_jobs", {
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
    },

    async claimJob() {
      const { data, error } = await service.rpc("claim_product_audio_normalize_job", {
        p_lease_seconds: leaseSeconds,
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
      return parseClaimedProductNormalizeJob(data);
    },

    async renewLease(job) {
      const { data, error } = await service.rpc(
        "renew_product_audio_normalize_job_lease",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_lease_seconds: leaseSeconds,
        },
      );
      if (error) throw error;
      return data === true;
    },

    async executeJob(job, signal) {
      return executeClaimedProductNormalizeJob(service, job, signal);
    },

    async completeJob(job, result) {
      const { data, error } = await service.rpc("complete_product_audio_normalize_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_target_storage_path: result.targetStoragePath,
        p_duration_seconds: result.durationSeconds,
        p_file_size_bytes: result.sizeBytes,
        p_original_file_name: result.originalFileName,
        p_status: result.productStatus,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const applied = Boolean(row && (row as { applied?: unknown }).applied === true);
      const previous =
        row && typeof (row as { previous_audio_path?: unknown }).previous_audio_path === "string"
          ? (row as { previous_audio_path: string }).previous_audio_path
          : null;
      const sourcePath =
        row && typeof (row as { source_storage_path?: unknown }).source_storage_path === "string"
          ? (row as { source_storage_path: string }).source_storage_path
          : job.source_storage_path;
      const targetPath =
        row && typeof (row as { target_storage_path?: unknown }).target_storage_path === "string"
          ? (row as { target_storage_path: string }).target_storage_path
          : job.target_storage_path;

      const cleanup: string[] = [];
      if (applied) {
        cleanup.push(sourcePath);
        if (previous && previous !== targetPath) cleanup.push(previous);
      } else {
        // Stale / not applied: remove orphan target; keep old delivery; drop source best-effort.
        cleanup.push(targetPath, sourcePath);
      }
      return { applied, cleanupPaths: cleanup };
    },

    async failJob(job, error) {
      let code = classifyProductNormalizeError(error).code;
      const safeMessage = classifyProductNormalizeError(error).safeMessage;
      if (
        error instanceof ProductNormalizeSourceInvalidError ||
        error instanceof ProductNormalizeOutputInvalidError ||
        error instanceof ProductNormalizeCodedError
      ) {
        code = error.code;
      }
      const { data, error: rpcError } = await service.rpc(
        "fail_product_audio_normalize_job",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_error_code: code,
          p_error_message_safe: safeMessage,
          p_max_attempts: maxAttempts,
        },
      );
      if (rpcError) throw rpcError;
      return parseCleanupDecision(data);
    },

    async resolveInterrupt(job) {
      const { data, error } = await service.rpc(
        "resolve_product_audio_normalize_job_interrupt",
        {
          p_job_id: job.id,
          p_lease_token: job.lease_token,
          p_max_attempts: maxAttempts,
        },
      );
      if (error) throw error;
      return parseCleanupDecision(data, "interrupt");
    },

    pathsForCleanupDecision(job, decision) {
      const paths: string[] = [];
      if (decision.cleanupSource) paths.push(job.source_storage_path);
      if (decision.cleanupTarget) paths.push(job.target_storage_path);
      return paths;
    },

    async cleanupPaths(paths) {
      const unique = [...new Set(paths.filter(Boolean))];
      if (unique.length === 0) return;
      const { error } = await service.storage.from(PRACTICE_AUDIO_BUCKET).remove(unique);
      if (error) {
        console.error("product_audio_normalize_cleanup_error", error.message);
      }
    },
  };
}

function parseCleanupDecision(
  data: unknown,
  fallbackOutcome = "unknown",
): ProductNormalizeCleanupDecision {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return {
      outcome: fallbackOutcome,
      finalStatus: null,
      cleanupSource: false,
      cleanupTarget: false,
    };
  }
  const rec = row as Record<string, unknown>;
  return {
    outcome:
      typeof rec.outcome === "string"
        ? rec.outcome
        : typeof rec.final_status === "string"
          ? rec.final_status
          : fallbackOutcome,
    finalStatus: typeof rec.final_status === "string" ? rec.final_status : null,
    cleanupSource: rec.cleanup_source === true,
    cleanupTarget: rec.cleanup_target === true,
  };
}
