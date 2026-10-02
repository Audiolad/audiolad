/**
 * Phase 2A automated runs. The human listening lab stays on music_lab_*
 * and /music-analyzer. This module does not write Music Passport.
 *
 * Python execution is pinned to Audiolad/music-analyzer
 * branch cursor/benchmark-harness-v01 @ 932c4ce
 * (analyzer content 3750f3b). Candidate A is not selected.
 */

export const MUSIC_ANALYZER_RUNS_BUCKET = "music-analyzer-runs" as const;

export const MUSIC_ANALYZER_RUNS_ROUTE = "/music-analyzer/runs" as const;

export const MUSIC_ANALYZER_FREEZE_BRANCH = "cursor/benchmark-harness-v01" as const;

export const MUSIC_ANALYZER_FREEZE_SNAPSHOT = "932c4ce" as const;

export const MUSIC_ANALYZER_CONTENT_COMMIT = "3750f3b" as const;

export const MUSIC_ANALYZER_ROOT_DEFAULT = "/var/lib/audiolad/music-analyzer" as const;

export const MUSIC_ANALYZER_VENV_DIR = ".venv-v03-clap" as const;

export const MUSIC_ANALYZER_SCRIPT = "analyze_track.py" as const;

export const MUSIC_ANALYZER_DEVICE = "cpu" as const;

export const MUSIC_ANALYZER_CHECKPOINT_FILENAME =
  "music_audioset_epoch_15_esc_90.14.pt" as const;

export const MUSIC_ANALYZER_CHECKPOINT_DEFAULT =
  "/var/lib/audiolad/music-analyzer/music_audioset_epoch_15_esc_90.14.pt" as const;

export const MUSIC_ANALYZER_INSTRUMENT_STRATEGY = "checkout_default" as const;

export const MUSIC_ANALYZER_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const MUSIC_ANALYZER_UPLOAD_TICKET_TTL_MS = 20 * 60 * 1000;

export const MUSIC_ANALYZER_MAX_ATTEMPTS = 2;

export const MUSIC_ANALYZER_LEASE_SECONDS = 1800;

export const MUSIC_ANALYZER_HEARTBEAT_INTERVAL_MS = 60_000;

export const MUSIC_ANALYZER_HEARTBEAT_RETRY_MS = 15_000;

export const MUSIC_ANALYZER_IDLE_INTERVAL_MS = 5_000;

export const MUSIC_ANALYZER_LEASE_HOLD_SAFETY_MS = 90_000;

export const MUSIC_ANALYZER_SHUTDOWN_DRAIN_MS = 20_000;

export const MUSIC_ANALYZER_ANALYZE_TIMEOUT_MS = 25 * 60 * 1000;

export const MUSIC_ANALYZER_VERSION_FALLBACK = "snapshot:932c4ce" as const;

export const MUSIC_ANALYZER_PERMANENT_ERROR_CODES = [
  "analyzer_commit_mismatch",
  "analyzer_content_missing",
  "analyzer_content_not_ancestor",
  "checkpoint_missing",
  "analyzer_runtime_missing",
  "source_invalid",
  "source_sha_mismatch",
  "analyzer_output_missing",
  "analyzer_output_invalid",
  "analyzer_output_too_large",
  "wav_convert_failed",
] as const;

export function isPermanentMusicAnalyzerError(code: string): boolean {
  return (MUSIC_ANALYZER_PERMANENT_ERROR_CODES as readonly string[]).includes(code);
}
