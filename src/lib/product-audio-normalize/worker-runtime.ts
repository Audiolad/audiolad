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

export function isStorageObjectAbsentError(error: unknown): boolean {
  if (error == null) return false;
  const rec =
    typeof error === "object" ? (error as Record<string, unknown>) : null;
  const status = String(
    rec?.statusCode ?? rec?.status ?? rec?.code ?? "",
  ).toLowerCase();
  const message = String(
    rec?.message ?? rec?.error ?? (error instanceof Error ? error.message : error),
  ).toLowerCase();
  if (status === "404" || status === "not_found" || status === "not found") {
    return true;
  }
  return (
    message.includes("not found") ||
    message.includes("not exist") ||
    message.includes("no such file") ||
    message.includes("object not found") ||
    message.includes("does not exist")
  );
}

/** Check lease immediately before a mutating Storage action. */
export async function assertProductNormalizeLeaseOwned(
  assertLease: () => Promise<boolean>,
): Promise<void> {
  const owned = await assertLease();
  if (!owned) throw new ProductNormalizeAbortedError();
}

/**
 * Remove a previous attempt's shared target only while THIS lease is current.
 * Object-not-found is success. Real Storage errors fail the attempt for retry.
 */
export async function removeStaleTargetIfLeaseOwned(args: {
  assertLease: () => Promise<boolean>;
  remove: () => Promise<{ error: unknown | null }>;
}): Promise<"cleaned" | "absent"> {
  await assertProductNormalizeLeaseOwned(args.assertLease);
  const { error } = await args.remove();
  if (!error) return "cleaned";
  if (isStorageObjectAbsentError(error)) return "absent";
  throw new ProductNormalizeCodedError("stale_target_cleanup_failed");
}

/** Upload delivery MP3 only while THIS lease is current. upsert must stay false. */
export async function uploadDeliveryIfLeaseOwned(args: {
  assertLease: () => Promise<boolean>;
  upload: () => Promise<void>;
}): Promise<"uploaded"> {
  await assertProductNormalizeLeaseOwned(args.assertLease);
  await args.upload();
  await assertProductNormalizeLeaseOwned(args.assertLease);
  return "uploaded";
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
      `source.${job.source_format}`,
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

    await uploadDeliveryIfLeaseOwned({
      assertLease: async () => {
        if (signal.aborted) return false;
        const { data, error } = await service.rpc(
          "renew_product_audio_normalize_job_lease",
          {
            p_job_id: job.id,
            p_lease_token: job.lease_token,
            p_lease_seconds: PRODUCT_AUDIO_NORMALIZE_LEASE_SECONDS,
          },
        );
        if (error) throw error;
        return data === true;
      },
      upload: () =>
        uploadPracticeMp3(service, job.target_storage_path, outputPath, signal),
    });
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

    async cleanupStaleTarget(job) {
      await removeStaleTargetIfLeaseOwned({
        assertLease: async () => {
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
        remove: async () =>
          service.storage
            .from(PRACTICE_AUDIO_BUCKET)
            .remove([job.target_storage_path]),
      });
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
      return parseCleanupDecision(data, "complete");
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
      const decision = parseCleanupDecision(data, "fail");
      if (decision.outcome === "unknown" || decision.outcome === "invalid") {
        const resolved = await service.rpc(
          "resolve_product_audio_normalize_job_interrupt",
          {
            p_job_id: job.id,
            p_lease_token: job.lease_token,
            p_max_attempts: maxAttempts,
          },
        );
        if (resolved.error) throw resolved.error;
        return parseCleanupDecision(resolved.data, "interrupt");
      }
      return decision;
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
      // Never invent deletes: only server-returned flags + explicit paths.
      const paths: string[] = [];
      const source =
        decision.sourceStoragePath ??
        (decision.cleanupSource ? job.source_storage_path : null);
      const target =
        decision.targetStoragePath ??
        (decision.cleanupTarget ? job.target_storage_path : null);
      if (decision.cleanupSource && source) paths.push(source);
      if (decision.cleanupTarget && target) paths.push(target);
      if (
        decision.cleanupPrevious &&
        decision.previousAudioPath &&
        decision.previousAudioPath !== target
      ) {
        paths.push(decision.previousAudioPath);
      }
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
      cleanupPrevious: false,
      previousAudioPath: null,
      sourceStoragePath: null,
      targetStoragePath: null,
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
    cleanupPrevious: rec.cleanup_previous === true,
    previousAudioPath:
      typeof rec.previous_audio_path === "string" ? rec.previous_audio_path : null,
    sourceStoragePath:
      typeof rec.source_storage_path === "string" ? rec.source_storage_path : null,
    targetStoragePath:
      typeof rec.target_storage_path === "string" ? rec.target_storage_path : null,
  };
}
