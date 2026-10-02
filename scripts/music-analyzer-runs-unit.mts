import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { collectAnalyzerDocuments } from "../src/lib/music-analyzer-runs/analyze-output";
import { diffJson } from "../src/lib/music-analyzer-runs/compare";
import {
  MUSIC_ANALYZER_CONTENT_COMMIT,
  MUSIC_ANALYZER_FREEZE_SNAPSHOT,
} from "../src/lib/music-analyzer-runs/constants";
import { exportRunCsv, exportRunJson, exportRunMarkdown } from "../src/lib/music-analyzer-runs/export-run";
import {
  audioLooksLikeWav,
  buildRunStoragePath,
  normalizeAudioMime,
  validateUploadDescriptor,
} from "../src/lib/music-analyzer-runs/audio-file";
import {
  openUploadTicket,
  sealUploadTicket,
  uploadTicketExpiry,
} from "../src/lib/music-analyzer-runs/policy";
import {
  analyzerChildEnv,
  buildAnalyzeTrackArgs,
  buildAnalyzerProvenance,
  verifyAnalyzerCheckout,
} from "../src/lib/music-analyzer-runs/python-plan";
import {
  createMusicAnalyzerWorker,
  parseClaimedMusicAnalyzerRun,
  type ClaimedMusicAnalyzerRun,
  type MusicAnalyzerWorkerPort,
} from "../src/lib/music-analyzer-runs/worker";
import type { MusicAnalyzerRunClient } from "../src/lib/music-analyzer-runs/contract";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

const sql = read("supabase/migrations/20261217120000_music_analyzer_runs_v01.sql");
assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.music_analyzer_runs/);
assert.match(sql, /music_analyzer_run_sealed/);
assert.match(sql, /music_analyzer_run_immutable/);
assert.match(sql, /GRANT SELECT ON TABLE public\.music_analyzer_runs TO service_role/);
assert.match(sql, /candidate_a' = 'false'/);
assert.match(sql, /instrument_strategy' = 'checkout_default'/);
assert.match(sql, /music-analyzer-runs/);
assert.doesNotMatch(sql, /ALTER TABLE public\.music_lab/);
assert.doesNotMatch(sql, /INSERT INTO public\.music_passport/);
assert.doesNotMatch(sql, /ALTER TABLE public\.music_passport/);
assert.doesNotMatch(sql, /DROP TABLE/);
assert.doesNotMatch(sql, /64\.188\.59\.113/);

const hub = read("src/app/(platform)/music-analyzer/page.tsx");
assert.match(hub, /Прослушивание/);
assert.match(hub, /Похожесть/);
assert.match(hub, /BPM \/ тональность/);
assert.match(hub, /\/music-analyzer\/runs/);
assert.match(hub, /Автоанализ/);

const deploy = read("deploy/scripts/deploy.sh");
assert.match(deploy, /assert_music_analyzer_worker_release_tree/);
assert.match(deploy, /ensure-music-analyzer-worker\.sh/);
assert.match(deploy, /music_analyzer_worker_ensure_failed/);
assert.match(read("deploy/music-analyzer-worker.ecosystem.config.cjs"), /audiolad-music-analyzer-worker/);
assert.match(read("deploy/scripts/ensure-music-analyzer-worker.sh"), /music_analyzer_worker_already_online/);
assert.match(read("scripts/run-music-analyzer-worker.mts"), /audiolad-music-analyzer-worker/);
assert.doesNotMatch(read("src/lib/music-analyzer-runs/python-plan.ts"), /64\.188\.59\.113/);
assert.match(read("deploy/music-analyzer-worker.ecosystem.config.cjs"), /env: \{ NODE_ENV: "production" \}/);

assert.deepEqual(buildAnalyzeTrackArgs("/tmp/in.wav", "/tmp/out"), [
  "analyze_track.py",
  "/tmp/in.wav",
  "--output-dir",
  "/tmp/out",
  "--device",
  "cpu",
]);

const childEnv = analyzerChildEnv({
  PATH: "/usr/bin",
  HOME: "/root",
  SUPABASE_SERVICE_ROLE_KEY: "secret",
  CANDIDATE_A: "1",
  INSTRUMENT_STRATEGY: "candidate-a",
} as unknown as NodeJS.ProcessEnv, "/var/lib/audiolad/music-analyzer/.venv-v03-clap/bin/python");
assert.equal(childEnv.PATH, "/usr/bin");
assert.equal(childEnv.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(childEnv.CANDIDATE_A, undefined);
assert.equal(childEnv.INSTRUMENT_STRATEGY, undefined);
assert.equal(childEnv.VIRTUAL_ENV, "/var/lib/audiolad/music-analyzer/.venv-v03-clap");

const collected = collectAnalyzerDocuments({
  "report.json": { duration_s: 1.2, analyzer_version: "lab-test", taxonomy_version: "tax-1" },
});
assert.equal("bpm" in (collected.normalized as object), false);
assert.equal("genre" in (collected.normalized as object), false);
assert.equal("mood" in (collected.normalized as object), false);
assert.equal(collected.hints.analyzerVersion, "lab-test");
assert.equal(collected.hints.taxonomyVersion, "tax-1");
assert.equal(collected.hints.promptVersion, null);
assert.equal(collected.normalizedSource, "file:report.json");

const provenance = buildAnalyzerProvenance({
  head: `${MUSIC_ANALYZER_FREEZE_SNAPSHOT}${"a".repeat(33)}`,
  content: `${MUSIC_ANALYZER_CONTENT_COMMIT}${"b".repeat(33)}`,
  checkpointFilename: "music_audioset_epoch_15_esc_90.14.pt",
  checkpointSha256: "abc",
  normalizedSource: collected.normalizedSource,
  outputFiles: collected.outputFiles,
  pythonPath: "/var/lib/audiolad/music-analyzer/.venv-v03-clap/bin/python",
});
assert.equal(provenance.candidate_a, false);
assert.equal(provenance.instrument_strategy, "checkout_default");
assert.deepEqual(provenance.invoke, [
  ".venv-v03-clap/bin/python",
  "analyze_track.py",
  "<wav>",
  "--output-dir",
  "<dir>",
  "--device",
  "cpu",
]);

const head = `${MUSIC_ANALYZER_FREEZE_SNAPSHOT}${"c".repeat(33)}`;
const content = `${MUSIC_ANALYZER_CONTENT_COMMIT}${"d".repeat(33)}`;
const verified = await verifyAnalyzerCheckout("/opt/analyzer", async (command, args) => {
  assert.equal(command, "git");
  if (args[0] === "rev-parse" && args[1] === "HEAD") return { code: 0, stdout: `${head}\n`, stderr: "" };
  if (args[1]?.includes("3750f3b")) return { code: 0, stdout: content, stderr: "" };
  if (args[0] === "merge-base") return { code: 0, stdout: "", stderr: "" };
  return { code: 1, stdout: "", stderr: "no" };
});
assert.equal(verified.head, head);
assert.equal(verified.content, content);
await assert.rejects(
  () => verifyAnalyzerCheckout("/opt/analyzer", async () => ({ code: 0, stdout: "deadbeef", stderr: "" })),
  /analyzer_commit_mismatch/,
);

assert.equal(normalizeAudioMime("song.wav", ""), "audio/wav");
assert.equal(normalizeAudioMime("song.mp3", "audio/mpeg"), "audio/mpeg");
assert.equal(normalizeAudioMime("notes.txt", "text/plain"), null);
const descriptor = validateUploadDescriptor({ filename: "a.wav", byteSize: 12, mime: "audio/wav" });
assert.equal("mime" in descriptor ? descriptor.mime : null, "audio/wav");
assert.equal(audioLooksLikeWav(Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
])), true);

const runId = "11111111-1111-4111-8111-111111111111";
const filename = "take 1.wav";
const intent = {
  v: 1 as const,
  userId: "user-1",
  runId,
  storagePath: buildRunStoragePath(runId, filename),
  byteSize: 32,
  mime: "audio/wav" as const,
  filename: "take 1.wav",
  exp: uploadTicketExpiry(1_000),
};
const token = sealUploadTicket(intent, "test-secret");
assert.deepEqual(openUploadTicket(token, "test-secret", 1_000)?.runId, runId);
assert.equal(openUploadTicket(token, "test-secret", intent.exp + 1), null);
assert.equal(openUploadTicket(token, "other", 1_000), null);

const clientRun = {
  id: runId,
  createdAt: "2026-10-02T00:00:00.000Z",
  startedAt: null,
  finishedAt: "2026-10-02T00:01:00.000Z",
  status: "succeeded" as const,
  sourceFilename: "take 1.wav",
  sha256: "a".repeat(64),
  byteSize: 32,
  mimeType: "audio/wav",
  versionNumber: 2,
  analyzerVersion: "snapshot:932c4ce",
  analyzerGitCommit: head,
  analyzerContentCommit: content,
  modelCheckpoint: "music_audioset_epoch_15_esc_90.14.pt",
  taxonomyVersion: null,
  promptVersion: null,
  device: "cpu",
  rawJson: { files: { "report.json": { duration_s: 1 } } },
  normalizedJson: { duration_s: 1 },
  provenance,
  errorCode: null,
  attemptCount: 1,
} satisfies MusicAnalyzerRunClient;
assert.match(exportRunJson(clientRun), /"sha256"/);
assert.doesNotMatch(exportRunJson(clientRun), /storage_path/);
assert.match(exportRunCsv(clientRun), /normalized\.duration_s/);
assert.match(exportRunMarkdown(clientRun), /# Прогон/);
const changes = diffJson({ duration_s: 1, mood: "a" }, { duration_s: 1, energy: 0.2 });
assert.equal(changes.find((entry) => entry.path === "duration_s")?.state, "same");
assert.equal(changes.find((entry) => entry.path === "mood")?.state, "only_left");
assert.equal(changes.find((entry) => entry.path === "energy")?.state, "only_right");

assert.equal(parseClaimedMusicAnalyzerRun({
  id: "run-1",
  lease_token: "lease",
  storage_path: "runs/x/a.wav",
  source_filename: "a.wav",
  sha256: "b".repeat(64),
})?.id, "run-1");
assert.equal(parseClaimedMusicAnalyzerRun({ id: "run-1" }), null);

const claimed: ClaimedMusicAnalyzerRun = {
  id: "run-1",
  lease_token: "lease",
  storage_bucket: "music-analyzer-runs",
  storage_path: "runs/x/a.wav",
  source_filename: "a.wav",
  mime_type: "audio/wav",
  sha256: "b".repeat(64),
  attempt_count: 1,
};
const recorded = {
  completed: [] as string[],
  failed: [] as string[],
  released: [] as string[],
};
const port: MusicAnalyzerWorkerPort = {
  async recoverStaleJobs() {},
  async claimJob() {
    return recorded.completed.length === 0 ? claimed : null;
  },
  async renewLease() {
    return true;
  },
  async executeJob() {
    return {
      analyzerVersion: "snapshot:932c4ce",
      analyzerGitCommit: head,
      analyzerContentCommit: content,
      modelCheckpoint: "music_audioset_epoch_15_esc_90.14.pt",
      taxonomyVersion: null,
      promptVersion: null,
      device: "cpu",
      rawJson: { files: {} },
      normalizedJson: { duration_s: 1 },
      provenance,
    };
  },
  async completeJob(job) {
    recorded.completed.push(job.id);
    return true;
  },
  async failJob(job) {
    recorded.failed.push(job.id);
    return true;
  },
  async releaseJob(job) {
    recorded.released.push(job.id);
    return true;
  },
};
const worker = createMusicAnalyzerWorker(port, {
  idleIntervalMs: 15,
  heartbeatIntervalMs: 10_000,
  shutdownDrainMs: 40,
  logger: { info() {}, error() {} },
});
const running = worker.run();
const start = Date.now();
while (!recorded.completed.includes("run-1") && Date.now() - start < 1500) {
  await delay(10);
}
worker.requestShutdown();
await running;
assert.deepEqual(recorded.completed, ["run-1"]);
assert.equal(recorded.failed.length, 0);

console.log("music-analyzer-runs-unit: ok");
