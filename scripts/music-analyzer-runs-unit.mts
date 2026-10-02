import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { StorageClient } from "@supabase/storage-js";

import { collectAnalyzerDocuments } from "../src/lib/music-analyzer-runs/analyze-output";
import { readMusicAnalyzerPassport } from "../src/lib/music-analyzer-runs/passport";
import {
  classifySignedUploadError,
  fileForSignedUpload,
  readSignedUploadClientReport,
} from "../src/lib/music-analyzer-runs/browser-upload";
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

const workspace = read("src/components/music-analyzer-runs/RunsWorkspace.tsx");
assert.match(workspace, /fileForSignedUpload\(file, file\.name, mime\)/);
assert.match(workspace, /classifySignedUploadError\(uploaded\.error\)/);
assert.match(workspace, /message\(storageError\.code\)/);
assert.doesNotMatch(workspace, /setError\(message\("object_missing"\)\)/);
const abandon = read("src/app/api/music-analyzer/runs/uploads/abandon/route.ts");
assert.match(abandon, /readSignedUploadClientReport/);
assert.match(abandon, /music-analyzer browser upload rejected/);
assert.match(abandon, /code: storageError\.code/);

async function signedUploadPartType(file: Blob, contentType: "audio/wav" | "audio/mpeg"): Promise<string> {
  let raw = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    if (init?.body instanceof FormData) {
      const probe = new Request("https://example.test/put", { method: "PUT", body: init.body });
      raw = await probe.text();
    }
    return new Response(JSON.stringify({ Key: "music-analyzer-runs/runs/id/file" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const storage = new StorageClient(
    "https://example.test/storage/v1",
    { apikey: "test" },
    fetchImpl,
  );
  const uploaded = await storage.from("music-analyzer-runs").uploadToSignedUrl(
    "runs/id/file",
    "signed-token",
    file,
    { contentType, upsert: false },
  );
  assert.equal(uploaded.error, null);
  const match = raw.match(/content-type:\s*([^\r\n]+)/i);
  return (match?.[1] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

const emptyWav = new File([Uint8Array.from([82, 73, 70, 70])], "Трек 1.wav", { type: "" });
const octetWav = new File([Uint8Array.from([82, 73, 70, 70])], "track.wav", { type: "application/octet-stream" });
const octetMp3 = new File([Uint8Array.from([73, 68, 51])], "song.mp3", { type: "application/octet-stream" });
const emptyBlob = new Blob([Uint8Array.from([82, 73, 70, 70])], { type: "" });
const octetBlob = new Blob([Uint8Array.from([82, 73, 70, 70])], { type: "application/octet-stream" });
assert.equal(await signedUploadPartType(emptyWav, "audio/wav"), "application/octet-stream");
assert.equal(await signedUploadPartType(emptyBlob, "audio/wav"), "application/octet-stream");
assert.equal(await signedUploadPartType(octetBlob, "audio/wav"), "application/octet-stream");
assert.equal(await signedUploadPartType(fileForSignedUpload(emptyWav, emptyWav.name, "audio/wav"), "audio/wav"), "audio/wav");
assert.equal(await signedUploadPartType(fileForSignedUpload(emptyBlob, "clip.wav", "audio/wav"), "audio/wav"), "audio/wav");
assert.equal(await signedUploadPartType(fileForSignedUpload(octetWav, octetWav.name, "audio/wav"), "audio/wav"), "audio/wav");
assert.equal(await signedUploadPartType(fileForSignedUpload(octetBlob, "clip.wav", "audio/wav"), "audio/wav"), "audio/wav");
assert.equal(await signedUploadPartType(fileForSignedUpload(octetMp3, octetMp3.name, "audio/mpeg"), "audio/mpeg"), "audio/mpeg");
assert.equal(fileForSignedUpload(emptyWav, emptyWav.name, "audio/wav").type, "audio/wav");

assert.equal(classifySignedUploadError({
  status: 415,
  statusCode: "415",
  error: "invalid_mime_type",
  message: "mime type application/octet-stream is not supported",
}).code, "invalid_mime_type");
assert.equal(classifySignedUploadError({
  status: 400,
  message: "InvalidMimeType",
}).code, "invalid_mime_type");
assert.equal(classifySignedUploadError(new TypeError("Failed to fetch")).code, "upload_network");
assert.equal(classifySignedUploadError({ name: "StorageUnknownError", message: "Failed to fetch" }).code, "upload_network");
assert.equal(classifySignedUploadError({ status: 404, statusCode: "404", message: "Object not found" }).code, "object_missing");
assert.equal(classifySignedUploadError({ status: 400, statusCode: "InvalidJWT", message: "Invalid Compact JWS" }).code, "upload_rejected");
const leaked = classifySignedUploadError({
  status: 415,
  statusCode: "415",
  message: "mime rejected token=secret eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln",
});
assert.equal(leaked.code, "invalid_mime_type");
assert.match(leaked.message ?? "", /token=\[redacted\]/);
assert.doesNotMatch(leaked.message ?? "", /eyJ/);
assert.equal(readSignedUploadClientReport({
  code: "invalid_mime_type",
  status: 415,
  statusCode: "415",
  message: leaked.message,
})?.code, "invalid_mime_type");
assert.equal(readSignedUploadClientReport({ code: "object_missing", status: 404, message: "Object not found" })?.code, "object_missing");
assert.equal(readSignedUploadClientReport({ code: "drop_table", message: "nope" }), null);
assert.equal(readSignedUploadClientReport(null), null);

const goldLike = {
  technical: {
    bpm: null,
    bpm_candidate: 70.3,
    bpm_raw: 140.6,
    bpm_confidence: "low",
    bpm_gate: "not_published",
    duration_s: 200.5,
    lufs: -15.1,
    sample_rate: 44100,
    channels: 2,
    format: "wav",
  },
  key: { candidate: "F", mode: "major", published: null },
  genres: [
    { label: "Jazz", score: 0.91, band: "high" },
    { label: "Lounge", score: 0.4, band: "medium" },
    { label: "Ambient", score: 0.2, band: "low" },
    { label: "Pop", score: 0.1, band: "low" },
  ],
  styles: [
    { name: "Smooth jazz" },
    { name: "Lounge jazz" },
    { name: "Spa" },
    { name: "Extra" },
  ],
  moods: [
    { label: "Calm", score: 0.8, band: "high" },
    { label: "Warm", score: 0.5, band: "medium" },
  ],
  instruments: [
    { label: "Saxophone", score: 0.7, rank: 2 },
    { label: "Piano", score: 0.9, rank: 1 },
  ],
  sound_character: [{ label: "Soft", score: 0.66 }],
  taxonomy: { version: "listening-v05" },
};
const goldPassport = readMusicAnalyzerPassport({ normalized: goldLike });
assert.equal(goldPassport.bpm.headline, "70.3 BPM · кандидат");
assert.equal(goldPassport.bpm.lines.includes("raw 140.6"), true);
assert.equal(goldPassport.bpm.lines.includes("опубликовано: —"), true);
assert.equal(goldPassport.bpm.lines.some((line) => line.includes("низкая уверенность")), true);
assert.equal(goldPassport.bpm.lines.some((line) => line.includes("не опубликован")), true);
assert.equal(goldPassport.bpm.headline.startsWith("140.6"), false);
assert.equal(goldPassport.bpm.headline.includes("кандидат"), true);
assert.equal(goldPassport.key.headline, "F major · кандидат");
assert.equal(goldPassport.key.lines.includes("опубликовано: —"), true);
assert.equal(goldPassport.genres.map((row) => row.label).join(","), "Jazz,Lounge,Ambient");
assert.equal(goldPassport.genres[0]?.tone, "high");
assert.equal(goldPassport.genres[2]?.tone, "low");
assert.equal(goldPassport.styles.map((row) => row.label).join(","), "Smooth jazz,Lounge jazz,Spa");
assert.deepEqual(goldPassport.moods.map((row) => row.label), ["Calm", "Warm"]);
assert.deepEqual(goldPassport.instruments.map((row) => row.label), ["Piano", "Saxophone"]);
assert.equal(goldPassport.instruments[0]?.rank, 1);
assert.equal(goldPassport.sound?.label, "Soft");
assert.equal(goldPassport.technical.find((row) => row.label === "Длительность")?.value, "200.5 с");
assert.equal(goldPassport.technical.find((row) => row.label === "LUFS")?.value, "-15.1");
assert.equal(goldPassport.technical.find((row) => row.label === "Частота дискретизации")?.value, "44100 Гц");
assert.equal(goldPassport.technical.find((row) => row.label === "Каналы")?.value, "2");
assert.equal(goldPassport.technical.find((row) => row.label === "Формат")?.value, "wav");
assert.equal(goldPassport.taxonomy, "listening-v05");
assert.equal(goldPassport.prompt, null);
assert.equal(goldPassport.sources.bpmPublished, "technical.bpm");
assert.equal(goldPassport.sources.bpmCandidate, "technical.bpm_candidate");
assert.equal(goldPassport.sources.bpmRaw, "technical.bpm_raw");
assert.equal(goldPassport.sources.bpmConfidence, "technical.bpm_confidence");
assert.equal(goldPassport.sources.bpmGate, "technical.bpm_gate");
assert.equal(goldPassport.sources.keyCandidate, "key.candidate");
assert.equal(goldPassport.sources.keyCandidateMode, "key.mode");
assert.equal(goldPassport.sources.genres, "genres");
assert.equal(goldPassport.sources.styles, "styles");
assert.equal(goldPassport.sources.moods, "moods");
assert.equal(goldPassport.sources.instruments, "instruments");
assert.equal(goldPassport.sources.soundCharacter, "sound_character");
assert.equal(goldPassport.sources.duration, "technical.duration_s");
assert.equal(goldPassport.sources.lufs, "technical.lufs");
assert.equal(goldPassport.sources.sampleRate, "technical.sample_rate");
assert.equal(goldPassport.sources.channels, "technical.channels");
assert.equal(goldPassport.sources.format, "technical.format");
assert.equal(goldPassport.sources.taxonomy, "taxonomy.version");
assert.equal(goldPassport.sources.prompt, null);

const nestedPassport = readMusicAnalyzerPassport({
  normalized: {
    technical: { bpm: null, duration: 12, sample_rate: 48000, channels: 1, format: "mp3" },
    bpm: { candidate: 70.3, raw: 140.6, published: null, confidence: "low", gate_passed: false },
    key: { candidate: "F major", published: null },
    meta: { taxonomy_version: "tax-nested" },
  },
});
assert.equal(nestedPassport.bpm.headline, "70.3 BPM · кандидат");
assert.equal(nestedPassport.bpm.lines.includes("raw 140.6"), true);
assert.equal(nestedPassport.key.headline, "F major · кандидат");
assert.equal(nestedPassport.sources.bpmPublished, "technical.bpm");
assert.equal(nestedPassport.sources.bpmCandidate, "bpm.candidate");
assert.equal(nestedPassport.sources.bpmRaw, "bpm.raw");
assert.equal(nestedPassport.sources.bpmGate, "bpm.gate_passed");
assert.equal(nestedPassport.sources.keyCandidate, "key.candidate");
assert.equal(nestedPassport.taxonomy, "tax-nested");
assert.equal(nestedPassport.sources.taxonomy, "meta.taxonomy_version");
assert.equal(nestedPassport.technical.find((row) => row.label === "Длительность")?.value, "12");

const publishedPassport = readMusicAnalyzerPassport({
  normalized: {
    technical: { bpm: 90 },
    tempo: { candidate_bpm: 70.3, raw_bpm: 140.6 },
    technical_key: null,
    key: { published: "C", published_mode: "minor", candidate: "F major" },
  },
});
assert.equal(publishedPassport.bpm.headline, "90 BPM");
assert.equal(publishedPassport.bpm.headline.includes("кандидат"), false);
assert.equal(publishedPassport.bpm.lines.includes("кандидат: 70.3 BPM"), true);
assert.equal(publishedPassport.bpm.lines.includes("raw 140.6"), true);
assert.equal(publishedPassport.key.headline, "C minor");
assert.equal(publishedPassport.sources.bpmPublished, "technical.bpm");
assert.equal(publishedPassport.sources.bpmCandidate, "tempo.candidate_bpm");
assert.equal(publishedPassport.sources.bpmRaw, "tempo.raw_bpm");
assert.equal(publishedPassport.sources.keyPublished, "key.published");
assert.equal(publishedPassport.sources.keyPublishedMode, "key.published_mode");

const versionPassport = readMusicAnalyzerPassport({
  normalized: { taxonomy: { version: "from-json" }, prompt: { version: "prompt-2" } },
  raw: { meta: { taxonomy_version: "from-raw" } },
  taxonomyVersion: "from-column",
  promptVersion: null,
});
assert.equal(versionPassport.taxonomy, "from-column");
assert.equal(versionPassport.sources.taxonomy, "column");
assert.equal(versionPassport.prompt, "prompt-2");
assert.equal(versionPassport.sources.prompt, "prompt.version");

const detail = read("src/components/music-analyzer-runs/RunDetail.tsx");
const passportUi = read("src/components/music-analyzer-runs/RunPassport.tsx");
assert.match(detail, /RunPassport/);
assert.match(detail, /Технические данные \/ Raw JSON/);
assert.match(passportUi, /Музыкальный паспорт/);
assert.match(detail, /format=json/);
assert.match(detail, /format=csv/);
assert.match(detail, /format=markdown/);
assert.match(passportUi, /Темп \(BPM\)/);
assert.match(passportUi, /Тональность/);
assert.match(passportUi, /Характер \/ настроение/);
assert.match(passportUi, /Инструменты/);
assert.doesNotMatch(`${detail}\n${passportUi}`, /ведущий инструмент/);
assert.doesNotMatch(read("src/lib/music-analyzer-runs/export-run.ts"), /passport/);

console.log("music-analyzer-runs-unit: ok");
