/**
 * t1523u: a product passport analyzer run gets its own byte copy of the track
 * audio in the music-analyzer-runs bucket only so the worker can read it.
 * Once the run succeeded, its features live in the DB and the copy duplicates
 * the track's audio (~30 MB WAV master per run). This module decides when that
 * copy may go. Pure orchestration with injected I/O so it is unit-testable.
 *
 * Invariant: the copy is removed only if, at that moment, the track's current
 * analysis audio (verified master or practice audio) holds the exact analysed
 * bytes (SHA256 equal to the run). From then on those bytes follow the track
 * audio's own lifecycle: if the author later replaces the audio, the old bytes
 * go away like any replaced audio, and the sealed features stay in the DB.
 * Anything that is not clearly a redundant copy is kept (lab uploads without a
 * passport link, unfinished or failed runs, changed or missing source, errors).
 */

export type AnalyzerRunCopyOutcome =
  | "removed"
  | "would_remove"
  | "already_gone"
  | "not_succeeded"
  | "not_product_run"
  | "source_missing"
  | "source_changed"
  | "lookup_failed";

export type AnalyzerRunCopyRun = {
  id: string;
  status: string;
  storage_bucket: string;
  storage_path: string;
  sha256: string;
  mime_type: string;
};

export type AnalyzerRunSource =
  | { outcome: "ok"; bytes: Uint8Array }
  | { outcome: "not_product_run" | "source_missing" | "source_changed" | "lookup_failed" };

export type AnalyzerRunCopyDeps = {
  runsBucket: string;
  loadRun: (runId: string) => Promise<AnalyzerRunCopyRun | null>;
  /** true / false, or null when the check itself failed. */
  copyExists: (path: string) => Promise<boolean | null>;
  /** Exact bytes from the track's current analysis audio, SHA256-verified. */
  loadSource: (runId: string, expectedSha256: string) => Promise<AnalyzerRunSource>;
  removeCopy: (path: string) => Promise<boolean>;
  log?: (event: string, runId: string, detail?: string) => void;
};

export async function discardAnalyzerRunCopy(
  runId: string,
  deps: AnalyzerRunCopyDeps,
  options: { dryRun?: boolean } = {},
): Promise<AnalyzerRunCopyOutcome> {
  const log = deps.log ?? (() => {});
  try {
    const run = await deps.loadRun(runId);
    if (!run) return "lookup_failed";
    if (run.status !== "succeeded" || run.storage_bucket !== deps.runsBucket) return "not_succeeded";
    const exists = await deps.copyExists(run.storage_path);
    if (exists === null) return "lookup_failed";
    if (!exists) return "already_gone";
    const source = await deps.loadSource(run.id, run.sha256);
    if (source.outcome !== "ok") return source.outcome;
    if (options.dryRun) return "would_remove";
    if (!(await deps.removeCopy(run.storage_path))) return "lookup_failed";
    log("analyzer_run_copy_removed", run.id);
    return "removed";
  } catch (error) {
    log("analyzer_run_copy_check_failed", runId, error instanceof Error ? error.message : "unknown");
    return "lookup_failed";
  }
}
