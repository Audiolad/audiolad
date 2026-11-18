/**
 * t1523u: a product passport analyzer run gets its own byte copy of the track
 * audio in the music-analyzer-runs bucket only so the worker can read it.
 * Once the run succeeded, its features live in the DB and the copy duplicates
 * the track's master (~30 MB WAV per run). This module decides when that copy
 * may go. Pure orchestration with injected I/O so it is unit-testable.
 */

export type AnalyzerRunCopyOutcome =
  | "removed"
  | "already_gone"
  | "not_succeeded"
  | "not_product_run"
  | "source_missing"
  | "source_changed"
  | "restored_after_race"
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
  | { outcome: "ok"; bytes: Uint8Array; sourceExists: () => Promise<boolean | null> }
  | { outcome: "not_product_run" | "source_missing" | "source_changed" | "lookup_failed" };

export type AnalyzerRunCopyDeps = {
  runsBucket: string;
  loadRun: (runId: string) => Promise<AnalyzerRunCopyRun | null>;
  copyExists: (path: string) => Promise<boolean | null>;
  /** Exact bytes from the track's current analysis audio, sha-verified. */
  loadSource: (runId: string, expectedSha256: string) => Promise<AnalyzerRunSource>;
  removeCopy: (path: string) => Promise<boolean>;
  restoreCopy: (path: string, bytes: Uint8Array, mimeType: string) => Promise<boolean>;
  log?: (event: string, runId: string, detail?: string) => void;
};

/**
 * Removes the run copy only when: the run succeeded (never queued, processing
 * or retryable), the object is in the analyzer runs bucket, the run is linked
 * to a product passport (lab uploads are the only copy and are never touched),
 * and the track's current analysis audio exists and hashes to the run sha256.
 * If the source disappears while we remove (audio replacement race), the copy
 * is re-uploaded from the verified bytes held in memory.
 */
export async function discardAnalyzerRunCopy(
  runId: string,
  deps: AnalyzerRunCopyDeps,
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
    if (!(await deps.removeCopy(run.storage_path))) return "lookup_failed";
    const stillThere = await source.sourceExists();
    if (stillThere !== true) {
      const restored = await deps.restoreCopy(run.storage_path, source.bytes, run.mime_type);
      log("analyzer_run_copy_restored_after_race", run.id, restored ? "ok" : "restore_failed");
      return "restored_after_race";
    }
    log("analyzer_run_copy_removed", run.id);
    return "removed";
  } catch (error) {
    log("analyzer_run_copy_check_failed", runId, error instanceof Error ? error.message : "unknown");
    return "lookup_failed";
  }
}

/**
 * Reconciliation for runs whose hook ran before their passport link existed
 * or hit a transient failure: re-check recent succeeded linked runs whose copy
 * is still present. Throttled by the caller.
 */
export async function sweepAnalyzerRunCopies(
  candidateRunIds: string[],
  deps: AnalyzerRunCopyDeps,
): Promise<Record<string, AnalyzerRunCopyOutcome>> {
  const out: Record<string, AnalyzerRunCopyOutcome> = {};
  for (const id of candidateRunIds) out[id] = await discardAnalyzerRunCopy(id, deps);
  return out;
}
