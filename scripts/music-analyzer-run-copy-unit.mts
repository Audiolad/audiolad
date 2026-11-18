import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  removeOk?: boolean;
} = {}) {
  const calls: string[] = [];
  const deps: AnalyzerRunCopyDeps = {
    runsBucket: BUCKET,
    loadRun: async () => (overrides.run === undefined ? baseRun : overrides.run),
    copyExists: async () => (overrides.copy === undefined ? true : overrides.copy),
    loadSource: async (runId, sha) => {
      calls.push(`source:${runId}:${sha.slice(0, 4)}`);
      return overrides.source ?? { outcome: "ok", bytes: new Uint8Array([1, 2, 3]) };
    },
    removeCopy: async (path) => { calls.push(`remove:${path}`); return overrides.removeOk ?? true; },
  };
  return { deps, calls };
}

{
  const { deps, calls } = harness();
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "removed");
  assert.deepEqual(calls, ["source:run-1:aaaa", "remove:runs/run-1/track.wav"], "verifies source sha before removal");
}
{
  const { deps, calls } = harness();
  assert.equal(await discardAnalyzerRunCopy("run-1", deps, { dryRun: true }), "would_remove");
  assert.deepEqual(calls, ["source:run-1:aaaa"], "dry run never removes");
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
{
  const { deps } = harness({ run: null });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "lookup_failed");
}
for (const outcome of ["not_product_run", "source_missing", "source_changed", "lookup_failed"] as const) {
  const { deps, calls } = harness({ source: { outcome } });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), outcome);
  assert.deepEqual(calls, ["source:run-1:aaaa"], `${outcome}: lab upload / missing or changed source keeps the copy`);
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
{
  const { deps } = harness({ removeOk: false });
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "lookup_failed");
}
{
  const { deps } = harness();
  deps.loadSource = async () => { throw new Error("boom"); };
  assert.equal(await discardAnalyzerRunCopy("run-1", deps), "lookup_failed", "errors never throw into the worker");
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pilot = read("src/lib/music-passport/jazz-relax-pilot.ts");
assert.match(pilot, /runsBucket: MUSIC_ANALYZER_RUNS_BUCKET/);
assert.match(pilot, /sha256Hex\(bytes\) !== expectedSha256\) return \{ outcome: "source_changed" \}/);
assert.match(pilot, /if \(!link\) return \{ outcome: "not_product_run" \}/);
const reconcile = read("scripts/music-analyzer-run-copy-reconcile.mts");
assert.match(reconcile, /process\.argv\.includes\("--apply"\) && process\.env\.MUSIC_ANALYZER_RUN_COPY_APPLY === "1"/);
assert.match(reconcile, /dryRun: !apply/);
const reanalyze = read("src/app/api/music-analyzer/runs/reanalyze/route.ts");
assert.match(reanalyze, /jazzRelaxRunSourceBytes\(source\.id, source\.sha256\)/);
console.log("music-analyzer-run-copy-unit: ok");
