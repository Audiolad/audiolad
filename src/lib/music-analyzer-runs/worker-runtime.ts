import type { SupabaseClient } from "@supabase/supabase-js";

import { MUSIC_ANALYZER_LEASE_SECONDS, MUSIC_ANALYZER_MAX_ATTEMPTS, isPermanentMusicAnalyzerError } from "./constants";
import { MusicAnalyzerAbortedError, MusicAnalyzerRunError, executePinnedAnalysis } from "./execute";
import { resolveMusicAnalyzerPaths } from "./paths";
import {
  parseClaimedMusicAnalyzerRun,
  type ClaimedMusicAnalyzerRun,
  type MusicAnalyzerExecuteResult,
  type MusicAnalyzerWorkerPort,
} from "./worker";

function errorCode(error: unknown): string {
  if (error instanceof MusicAnalyzerRunError) return error.code;
  if (error instanceof Error && error.message.startsWith("analyzer_")) return error.message;
  return "analyze_failed";
}

export function createMusicAnalyzerWorkerPort(
  service: SupabaseClient,
  options: { leaseSeconds?: number; maxAttempts?: number; env?: NodeJS.ProcessEnv } = {},
): MusicAnalyzerWorkerPort {
  const leaseSeconds = options.leaseSeconds ?? MUSIC_ANALYZER_LEASE_SECONDS;
  const maxAttempts = options.maxAttempts ?? MUSIC_ANALYZER_MAX_ATTEMPTS;
  const paths = resolveMusicAnalyzerPaths(options.env);

  return {
    async recoverStaleJobs() {
      const { error } = await service.rpc("recover_stale_music_analyzer_runs", {
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
    },

    async claimJob() {
      const { data, error } = await service.rpc("claim_music_analyzer_run", {
        p_lease_seconds: leaseSeconds,
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
      return parseClaimedMusicAnalyzerRun(data);
    },

    async renewLease(job) {
      const { data, error } = await service.rpc("renew_music_analyzer_run_lease", {
        p_run_id: job.id,
        p_lease_token: job.lease_token,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      return data === true;
    },

    async executeJob(job, signal) {
      const { data, error } = await service.storage.from(job.storage_bucket).download(job.storage_path);
      if (error || !data) throw new MusicAnalyzerRunError("source_unavailable");
      const bytes = new Uint8Array(await data.arrayBuffer());
      if (bytes.byteLength === 0) throw new MusicAnalyzerRunError("source_invalid");
      return executePinnedAnalysis({
        bytes,
        filename: job.source_filename,
        expectedSha256: job.sha256,
        root: paths.root,
        pythonPath: paths.pythonPath,
        checkpointPath: paths.checkpointPath,
        signal,
      });
    },

    async completeJob(job, result: MusicAnalyzerExecuteResult) {
      const { data, error } = await service.rpc("complete_music_analyzer_run", {
        p_run_id: job.id,
        p_lease_token: job.lease_token,
        p_analyzer_version: result.analyzerVersion,
        p_analyzer_git_commit: result.analyzerGitCommit,
        p_analyzer_content_commit: result.analyzerContentCommit,
        p_model_checkpoint: result.modelCheckpoint,
        p_taxonomy_version: result.taxonomyVersion,
        p_prompt_version: result.promptVersion,
        p_device: result.device,
        p_raw_json: result.rawJson,
        p_normalized_json: result.normalizedJson,
        p_provenance: result.provenance,
      });
      if (error) throw error;
      return data === true;
    },

    async failJob(job: ClaimedMusicAnalyzerRun, error: unknown) {
      if (error instanceof MusicAnalyzerAbortedError) return false;
      const code = errorCode(error);
      const { data, error: rpcError } = await service.rpc("fail_music_analyzer_run", {
        p_run_id: job.id,
        p_lease_token: job.lease_token,
        p_error_code: code,
        p_permanent: isPermanentMusicAnalyzerError(code),
        p_max_attempts: maxAttempts,
      });
      if (rpcError) throw rpcError;
      return data === true;
    },

    async releaseJob(job) {
      const { data, error } = await service.rpc("release_music_analyzer_run", {
        p_run_id: job.id,
        p_lease_token: job.lease_token,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
