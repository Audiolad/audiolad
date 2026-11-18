import assert from "node:assert/strict";

import {
  discardAnalyzerRunCopy,
  type AnalyzerRunCopyDeps,
  type AnalyzerRunCopyRun,
  type AnalyzerRunSource,
} from "../src/lib/music-passport/analyzer-run-copy";

const BUCKET = "music-analyzer-runs";
const baseRun: AnalyzerRunCopyRun = {
  id: "run-1", status: "succeeded", storage_bucket: BUCKET,
  storage_path: "runs/run-1/track.wav", sha256: "a".repeat(64), mime_type: "audio/wav",
};

function harness(overrides: {
  run?: AnalyzerRunCopyRun | null;
  copy?: boolean | null;
  source?: AnalyzerRunSource;
  sourceAfter?: boolean | null;
  removeOk?: boolean;
} = {}) {
  const calls: string[] = [];
  const bytes = new Uint8Array([1, 2, 3]);
  const deps: AnalyzerRunCopyDeps = {
    runsBucket: BUCKET,
    loadRun: async () => (overrides.run === undefined ? baseRun : overrides.run),
    copyExists: async () => (overrides.copy === undefined ? true : overrides.copy),
    loadSource: async () => overrides.source ?? {
      outcome: "ok", bytes, sourceExists: async () => (overrides.sourceAfter === undefined ? true : overrides.sourceAfter),
    },
    removeCopy: async (path) => { calls.push(`remove:${path}`); return overrides.removeOk ?? true; },
    restoreCopy: async (path, b, mime) => { calls.push(`restore:${path}:${b.byteLength}:${mime}`); return true; },
  };
  return { deps, calls };
}

{
  const { deps, calls } = harness();
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "removed");
  assert.deepEqual(calls, ["remove:runs/run-1/track.wav"]);
}
for (const status of ["queued", "processing", "failed"]) {
  const { deps, calls } = harness({ run: { ...baseRun, status } });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "not_succeeded", status);
  assert.deepEqual(calls, [], `${status} run keeps its copy`);
}
{
  const { deps, calls } = harness({ run: { ...baseRun, storage_bucket: "music-masters" } });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "not_succeeded");
  assert.deepEqual(calls, [], "never touches another bucket");
}
for (const outcome of ["not_product_run", "source_missing", "source_changed", "lookup_failed"] as const) {
  const { deps, calls } = harness({ source: { outcome } });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), outcome);
  assert.deepEqual(calls, [], `${outcome}: lab upload / missing or changed source keeps the copy`);
}
{
  const { deps, calls } = harness({ copy: false });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "already_gone");
  assert.deepEqual(calls, []);
}
{
  const { deps, calls } = harness({ copy: null });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "lookup_failed");
  assert.deepEqual(calls, []);
}
for (const after of [false, null]) {
  const { deps, calls } = harness({ sourceAfter: after });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "restored_after_race");
  assert.deepEqual(calls, ["remove:runs/run-1/track.wav", "restore:runs/run-1/track.wav:3:audio/wav"], "source vanished during removal: copy is put back");
}
{
  const { deps, calls } = harness({ removeOk: false });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "lookup_failed");
  assert.deepEqual(calls, ["remove:runs/run-1/track.wav"]);
}
{
  const { deps } = harness();
  deps.loadRun = async () => { throw new Error("boom"); };
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "lookup_failed", "errors never throw into the worker");
}
console.log("music-analyzer-run-copy-unit: ok");
