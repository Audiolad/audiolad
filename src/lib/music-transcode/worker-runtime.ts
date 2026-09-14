import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { MUSIC_MASTERS_BUCKET } from "@/lib/author-products/music-master-upload-contract";

import {
  MUSIC_STREAM_MIME,
  MUSIC_STREAMS_BUCKET,
  MUSIC_TRANSCODE_LEASE_SECONDS,
  MUSIC_TRANSCODE_MAX_ATTEMPTS,
  buildMusicStreamStoragePath,
  canReuseVerifiedStreamAsset,
  classifyMusicTranscodeError,
  musicStreamOriginalFileName,
  type MusicStreamAssetLike,
} from "./contract";
import {
  MusicTranscodeAbortedError,
  transcodeWavToMp3,
  validateMusicStreamFile,
} from "./ffmpeg";
import {
  parseClaimedMusicTranscodeJob,
  type ClaimedMusicTranscodeJob,
  type MusicTranscodeExecuteResult,
  type MusicTranscodeWorkerPort,
} from "./worker";

type MasterRow = {
  id: string;
  audio_item_id: string;
  asset_role: string;
  lifecycle_state: string;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  size_bytes: number | null;
  duration_seconds: number | string | null;
};

function asNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export class MusicTranscodeCodedError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MusicTranscodeCodedError";
  }
}

export function createMusicTranscodeWorkerPort(
  service: SupabaseClient,
  options: { leaseSeconds?: number; maxAttempts?: number } = {},
): MusicTranscodeWorkerPort {
  const leaseSeconds = options.leaseSeconds ?? MUSIC_TRANSCODE_LEASE_SECONDS;
  const maxAttempts = options.maxAttempts ?? MUSIC_TRANSCODE_MAX_ATTEMPTS;

  return {
    async recoverStaleJobs() {
      const { error } = await service.rpc("recover_stale_music_transcode_jobs", {
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
    },

    async claimJob() {
      const { data, error } = await service.rpc("claim_music_transcode_job", {
        p_lease_seconds: leaseSeconds,
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
      return parseClaimedMusicTranscodeJob(data);
    },

    async renewLease(job) {
      const { data, error } = await service.rpc("renew_music_transcode_job_lease", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return data === true;
    },

    async executeJob(job, signal) {
      return executeClaimedMusicTranscodeJob(service, job, signal);
    },

    async completeJob(job, result) {
      const { data, error } = await service.rpc("complete_music_transcode_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_output_asset_id: result.outputAssetId,
      });
      if (error) throw error;
      return data === true;
    },

    async failJob(job, error) {
      const code = classifyMusicTranscodeError(error);
      const { data, rpcError } = await failJobSafe(service, job, code, maxAttempts);
      if (rpcError) {
        console.error(JSON.stringify({
          event: "music_transcode_fail_rpc_error",
          jobId: job.id,
        }));
        return false;
      }
      return data === true;
    },

    async releaseJob(job) {
      const { data, error } = await service.rpc("release_music_transcode_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
      });
      if (error) return false;
      return data === true;
    },
  };
}

async function failJobSafe(
  service: SupabaseClient,
  job: ClaimedMusicTranscodeJob,
  code: string,
  maxAttempts: number,
): Promise<{ data: unknown; rpcError: unknown }> {
  const { data, error } = await service.rpc("fail_music_transcode_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_error_code: code,
    p_error_message_safe: "",
    p_max_attempts: maxAttempts,
  });
  return { data, rpcError: error };
}

export async function loadVerifiedMusicMaster(
  service: SupabaseClient,
  sourceAssetId: string,
): Promise<MasterRow> {
  const { data, error } = await service
    .from("music_audio_assets")
    .select("id,audio_item_id,asset_role,lifecycle_state,storage_bucket,storage_path,original_file_name,size_bytes,duration_seconds")
    .eq("id", sourceAssetId)
    .maybeSingle();
  if (error || !data) throw new MusicTranscodeCodedError("source_unavailable");
  const master = data as MasterRow;
  if (
    master.asset_role !== "master"
    || master.lifecycle_state !== "verified"
    || master.storage_bucket !== MUSIC_MASTERS_BUCKET
    || !(asNumber(master.size_bytes) > 0)
    || !(asNumber(master.duration_seconds) > 0)
  ) {
    throw new MusicTranscodeCodedError("source_invalid");
  }
  return master;
}

export async function findReusableStreamAsset(
  service: SupabaseClient,
  master: MasterRow,
  storagePath: string,
): Promise<MusicStreamAssetLike | null> {
  const { data, error } = await service
    .from("music_audio_assets")
    .select("id,audio_item_id,source_asset_id,asset_role,storage_bucket,storage_path,lifecycle_state")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (error || !data) return null;
  const asset = data as MusicStreamAssetLike;
  if (!canReuseVerifiedStreamAsset(asset, {
    audioItemId: master.audio_item_id,
    sourceAssetId: master.id,
    storagePath,
  })) {
    throw new MusicTranscodeCodedError("output_invalid");
  }
  return asset;
}

async function assertLeaseHeld(
  service: SupabaseClient,
  job: ClaimedMusicTranscodeJob,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new MusicTranscodeAbortedError();
  const { data, error } = await service.rpc("renew_music_transcode_job_lease", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_lease_seconds: MUSIC_TRANSCODE_LEASE_SECONDS,
  });
  if (error) throw error;
  if (data !== true) throw new MusicTranscodeAbortedError();
}

export async function executeClaimedMusicTranscodeJob(
  service: SupabaseClient,
  job: ClaimedMusicTranscodeJob,
  signal: AbortSignal = new AbortController().signal,
): Promise<MusicTranscodeExecuteResult> {
  const master = await loadVerifiedMusicMaster(service, job.source_asset_id);
  const storagePath = buildMusicStreamStoragePath(master.audio_item_id, master.id);
  const existing = await findReusableStreamAsset(service, master, storagePath);
  if (existing) {
    await assertLeaseHeld(service, job, signal);
    return {
      outputAssetId: existing.id,
      sizeBytes: asNumber(master.size_bytes),
      durationSeconds: asNumber(master.duration_seconds),
    };
  }

  const workspace = join(tmpdir(), `audiolad-music-transcode-${randomUUID()}`);
  try {
    await mkdir(workspace, { recursive: true });
    const masterPath = join(workspace, "master.wav");
    const outputPath = join(workspace, "mp3-256.mp3");
    const { data: blob, error: downloadError } = await service.storage
      .from(MUSIC_MASTERS_BUCKET)
      .download(master.storage_path);
    if (downloadError || !blob) throw new MusicTranscodeCodedError("source_unavailable");
    await writeFile(masterPath, Buffer.from(await blob.arrayBuffer()));
    if (signal.aborted) throw new MusicTranscodeAbortedError();

    try {
      await transcodeWavToMp3(masterPath, outputPath, signal);
    } catch (error) {
      if (error instanceof MusicTranscodeAbortedError || signal.aborted) {
        throw new MusicTranscodeAbortedError();
      }
      throw new MusicTranscodeCodedError("transcode_failed");
    }

    const validated = await validateMusicStreamFile(
      outputPath,
      asNumber(master.duration_seconds),
      signal,
    );
    await assertLeaseHeld(service, job, signal);

    const { error: uploadError } = await service.storage
      .from(MUSIC_STREAMS_BUCKET)
      .upload(storagePath, createReadStream(outputPath), {
        contentType: MUSIC_STREAM_MIME,
        upsert: true,
      });
    if (uploadError) throw new MusicTranscodeCodedError("upload_failed");
    await assertLeaseHeld(service, job, signal);

    const reusedAfterUpload = await findReusableStreamAsset(service, master, storagePath);
    if (reusedAfterUpload) {
      return {
        outputAssetId: reusedAfterUpload.id,
        sizeBytes: validated.sizeBytes,
        durationSeconds: validated.durationSeconds,
      };
    }

    const insert = await service
      .from("music_audio_assets")
      .insert({
        audio_item_id: master.audio_item_id,
        source_asset_id: master.id,
        asset_role: "stream",
        storage_bucket: MUSIC_STREAMS_BUCKET,
        storage_path: storagePath,
        original_file_name: musicStreamOriginalFileName(master.original_file_name),
        accepted_mime_type: MUSIC_STREAM_MIME,
        size_bytes: validated.sizeBytes,
        duration_seconds: validated.durationSeconds,
        lifecycle_state: "verified",
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insert.error || !insert.data) {
      const raced = await findReusableStreamAsset(service, master, storagePath);
      if (raced) {
        return {
          outputAssetId: raced.id,
          sizeBytes: validated.sizeBytes,
          durationSeconds: validated.durationSeconds,
        };
      }
      throw new MusicTranscodeCodedError("upload_failed");
    }
    return {
      outputAssetId: insert.data.id as string,
      sizeBytes: validated.sizeBytes,
      durationSeconds: validated.durationSeconds,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

