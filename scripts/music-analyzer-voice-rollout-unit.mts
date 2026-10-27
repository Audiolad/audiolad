import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { buildFeatures } from "../src/lib/music-analyzer-runs/features.mjs";
import {
  MUSIC_ANALYZER_CONTENT_COMMIT,
  MUSIC_ANALYZER_FREEZE_SNAPSHOT,
  MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS,
} from "../src/lib/music-analyzer-runs/constants";
import {
  analyzerChildEnv,
  assertContentCommit,
  assertFrozenHead,
  buildAnalyzeTrackArgs,
} from "../src/lib/music-analyzer-runs/python-plan";
import {
  createMusicAnalyzerWorker,
  type ClaimedMusicAnalyzerRun,
  type MusicAnalyzerExecuteResult,
  type MusicAnalyzerWorkerPort,
} from "../src/lib/music-analyzer-runs/worker";
import {
  buildVoiceLog,
  chooseVoiceDetector,
  formatMusicAnalyzerVoiceLog,
  isPrimaryNewUpload,
  parseVoiceCanaryMax,
  parseVoiceDetectorMode,
  resolveVoiceChoice,
  withWithheldVoiceDetector,
  type VoiceChoice,
} from "../src/lib/music-analyzer-runs/voice-plan";

assert.equal(MUSIC_ANALYZER_FREEZE_SNAPSHOT, "cc5b2828");
assert.equal(MUSIC_ANALYZER_CONTENT_COMMIT, "3750f3b");
assert.equal(
  assertFrozenHead("cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0"),
  "cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0",
);
assert.equal(
  assertFrozenHead("932c4ce8325c537668195afce0a56fa68d40a08c"),
  "932c4ce8325c537668195afce0a56fa68d40a08c",
);
assert.throws(
  () => assertFrozenHead("a".repeat(40)),
  /analyzer_commit_mismatch/,
);
assert.throws(
  () => assertFrozenHead(`${MUSIC_ANALYZER_CONTENT_COMMIT}${"b".repeat(33)}`),
  /analyzer_commit_mismatch/,
);

const oldSeal = /^932c4ce[0-9a-f]{0,33}$/;
const widenedSeal = /^(?:932c4ce|cc5b2828)[0-9a-f]{0,33}$/;
for (let suffix = 0; suffix <= 33; suffix += 1) {
  const historical = `932c4ce${"a".repeat(suffix)}`;
  assert.equal(oldSeal.test(historical), true);
  assert.equal(widenedSeal.test(historical), true, historical);
}
assert.equal(oldSeal.test("cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0"), false);
assert.equal(widenedSeal.test("cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0"), true);
assert.equal(widenedSeal.test("deadbeef"), false);
assert.equal(widenedSeal.test(`932c4ce${"a".repeat(34)}`), false);

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sealSql = readFileSync(
  path.join(repoRoot, "supabase/migrations/20270128120000_music_analyzer_seal_head_prefixes.sql"),
  "utf8",
);
const rollbackSql = readFileSync(
  path.join(repoRoot, "docs/music-analyzer/ROLLBACK_music_analyzer_seal_head_prefixes.sql"),
  "utf8",
);
const originalSql = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261217120000_music_analyzer_runs_v01.sql"),
  "utf8",
);
assert.match(sealSql, /ADD CONSTRAINT music_analyzer_runs_phase_check/);
assert.match(sealSql, /NOT VALID/);
assert.match(sealSql, /VALIDATE CONSTRAINT music_analyzer_runs_phase_check/);
assert.ok(sealSql.indexOf("NOT VALID") < sealSql.indexOf("VALIDATE CONSTRAINT"));
assert.match(sealSql, /932c4ce\|cc5b2828/);
assert.match(sealSql, /3750f3b/);
assert.match(sealSql, /seal_prefix_widen_rejected_existing_row/);
assert.doesNotMatch(sealSql, /DELETE\s+FROM/i);
assert.doesNotMatch(sealSql, /TRUNCATE/i);
assert.equal((sealSql.match(/\bUPDATE\b/g) ?? []).length, 1);
assert.match(originalSql, /analyzer_git_commit ~ '\^932c4ce\[0-9a-f\]\{0,33\}\$'/);
assert.doesNotMatch(originalSql, /cc5b2828/);
assert.match(rollbackSql, /NOT VALID/);
assert.match(rollbackSql, /VALIDATE CONSTRAINT music_analyzer_runs_phase_check/);
assert.match(rollbackSql, /'\^932c4ce\[0-9a-f\]\{0,33\}\$'/);
assert.doesNotMatch(rollbackSql, /cc5b2828\[0-9a-f\]/);
assert.equal(rollbackSql.includes("supabase/migrations"), false);
assert.equal(assertContentCommit(`${MUSIC_ANALYZER_CONTENT_COMMIT}${"a".repeat(33)}`).startsWith("3750f3b"), true);
assert.throws(
  () => assertContentCommit("cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0"),
  /analyzer_content_missing/,
);

assert.equal(parseVoiceDetectorMode(undefined), "off");
assert.equal(parseVoiceDetectorMode("  "), "off");
assert.equal(parseVoiceDetectorMode("YES"), "off");
assert.equal(parseVoiceDetectorMode(" OFF "), "off");
assert.equal(parseVoiceDetectorMode(" Canary "), "canary");
assert.equal(parseVoiceDetectorMode("on"), "on");
assert.equal(parseVoiceCanaryMax(undefined), 5);
assert.equal(parseVoiceCanaryMax("5"), 5);
assert.equal(parseVoiceCanaryMax("3"), 3);
assert.equal(parseVoiceCanaryMax("0"), 5);
assert.equal(parseVoiceCanaryMax("1001"), 5);
assert.equal(parseVoiceCanaryMax("nope"), 5);

const ready = {
  MUSIC_ANALYZER_VOICE_PYTHON: "/opt/voice/bin/python",
  MUSIC_ANALYZER_PANNS_CHECKPOINT: "/opt/panns/Cnn14_mAP=0.431.pth",
};

function envOf(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv;
}

function choice(patch: Partial<Parameters<typeof chooseVoiceDetector>[0]> = {}): VoiceChoice {
  return chooseVoiceDetector({
    mode: "on",
    canaryMax: 5,
    sealedPannsCount: 0,
    primaryNewUpload: true,
    runtimeReady: true,
    ...patch,
  });
}

assert.equal(choice({ mode: "off" }).reason, "mode_off");
assert.equal(choice({ mode: "off" }).flag, "legacy");
assert.equal(choice({ mode: "off", primaryNewUpload: false }).withholdClap, false);
assert.deepEqual(
  { flag: choice().flag, invoke: choice().invoke, reason: choice().reason, withholdClap: choice().withholdClap },
  { flag: "panns", invoke: true, reason: "on", withholdClap: true },
);
assert.equal(choice({ mode: "canary", sealedPannsCount: 4 }).flag, "panns");
assert.equal(choice({ mode: "canary", sealedPannsCount: 4 }).reason, "canary");
assert.equal(choice({ mode: "canary", sealedPannsCount: 5 }).reason, "canary_full");
assert.equal(choice({ mode: "canary", sealedPannsCount: 5 }).withholdClap, false);
assert.equal(choice({ mode: "canary", sealedPannsCount: null }).reason, "count_unavailable");
assert.equal(choice({ mode: "canary", sealedPannsCount: null }).flag, "legacy");
assert.equal(choice({ primaryNewUpload: false }).reason, "not_primary_upload");
assert.equal(choice({ primaryNewUpload: false }).invoke, false);
assert.equal(choice({ runtimeReady: false }).reason, "voice_runtime_missing");
assert.equal(choice({ runtimeReady: false }).flag, "legacy");
assert.equal(choice({ runtimeReady: false }).invoke, false);
assert.equal(choice({ runtimeReady: false }).withholdClap, true);
assert.equal(choice({ mode: "canary", sealedPannsCount: 5, runtimeReady: false }).reason, "canary_full");

assert.equal(isPrimaryNewUpload({ versionNumber: 1, mimeType: "audio/wav", passportLinked: false }), true);
assert.equal(isPrimaryNewUpload({ versionNumber: 1, mimeType: "audio/mpeg; charset=binary", passportLinked: false }), true);
assert.equal(isPrimaryNewUpload({ versionNumber: 1, mimeType: "audio/x-wav", passportLinked: false }), true);
assert.equal(isPrimaryNewUpload({ versionNumber: 2, mimeType: "audio/mpeg", passportLinked: false }), false);
assert.equal(isPrimaryNewUpload({ versionNumber: 1, mimeType: "audio/mpeg", passportLinked: true }), false);
assert.equal(isPrimaryNewUpload({ versionNumber: 1, mimeType: "audio/mpeg", passportLinked: null }), false);
assert.equal(isPrimaryNewUpload({ versionNumber: 1, mimeType: "audio/flac", passportLinked: false }), false);
assert.equal(isPrimaryNewUpload({ versionNumber: null, mimeType: "audio/wav", passportLinked: false }), false);

const runtime = {
  MUSIC_ANALYZER_VOICE_DETECTOR: "on",
  ...ready,
};
let offLookups = 0;
const off = await resolveVoiceChoice({
  env: envOf({ MUSIC_ANALYZER_VOICE_DETECTOR: "bogus" }),
  versionNumber: 1,
  mimeType: "audio/wav",
  runId: "run-off",
  lookup: {
    async passportLinked() {
      offLookups += 1;
      return false;
    },
    async countInvoked() {
      offLookups += 1;
      return 0;
    },
  },
  wait: async () => {
    throw new Error("off mode must not wait");
  },
});
assert.equal(off.reason, "mode_off");
assert.equal(off.flag, "legacy");
assert.equal(offLookups, 0);

let reanalysisCounts = 0;
const reanalysis = await resolveVoiceChoice({
  env: envOf(runtime),
  versionNumber: 2,
  mimeType: "audio/mpeg",
  runId: "run-again",
  lookup: {
    async passportLinked() {
      return false;
    },
    async countInvoked() {
      reanalysisCounts += 1;
      return 0;
    },
  },
  wait: async () => {},
});
assert.equal(reanalysis.reason, "not_primary_upload");
assert.equal(reanalysis.flag, "legacy");
assert.equal(reanalysis.withholdClap, false);
assert.equal(reanalysisCounts, 0);

let passportWaits = 0;
let passportReads = 0;
const linked = await resolveVoiceChoice({
  env: envOf(runtime),
  versionNumber: 1,
  mimeType: "audio/wav",
  runId: "passport-run",
  lookup: {
    async passportLinked() {
      passportReads += 1;
      return true;
    },
    async countInvoked() {
      return 0;
    },
  },
  wait: async () => {
    passportWaits += 1;
  },
});
assert.equal(linked.reason, "not_primary_upload");
assert.equal(passportReads, 1);
assert.equal(passportWaits, 0);

let graceReads = 0;
const grace = await resolveVoiceChoice({
  env: envOf({ ...runtime, MUSIC_ANALYZER_VOICE_DETECTOR: "canary" }),
  versionNumber: 1,
  mimeType: "audio/mpeg",
  runId: "late-link",
  lookup: {
    async passportLinked() {
      graceReads += 1;
      return graceReads === 1 ? false : true;
    },
    async countInvoked() {
      throw new Error("a passport link must not count a canary slot");
    },
  },
  wait: async (ms) => {
    assert.equal(ms, 2_000);
  },
});
assert.equal(grace.reason, "not_primary_upload");
assert.equal(grace.flag, "legacy");

const canary = await resolveVoiceChoice({
  env: envOf({ ...ready, MUSIC_ANALYZER_VOICE_DETECTOR: "canary", MUSIC_ANALYZER_VOICE_CANARY_MAX: "5" }),
  versionNumber: 1,
  mimeType: "audio/wav",
  runId: "new-wav",
  lookup: {
    async passportLinked() {
      return false;
    },
    async countInvoked() {
      return 4;
    },
  },
  wait: async () => {},
});
assert.equal(canary.flag, "panns");
assert.equal(canary.invoke, true);
assert.equal(canary.reason, "canary");

const full = await resolveVoiceChoice({
  env: envOf({ ...ready, MUSIC_ANALYZER_VOICE_DETECTOR: "canary" }),
  versionNumber: 1,
  mimeType: "audio/mpeg",
  runId: "new-mp3",
  lookup: {
    async passportLinked() {
      return false;
    },
    async countInvoked() {
      return 5;
    },
  },
  wait: async () => {},
});
assert.equal(full.reason, "canary_full");
assert.equal(full.flag, "legacy");
assert.equal(full.invoke, false);
assert.equal(full.withholdClap, false);

const missingRuntime = await resolveVoiceChoice({
  env: envOf({ MUSIC_ANALYZER_VOICE_DETECTOR: "on" }),
  versionNumber: 1,
  mimeType: "audio/wave",
  runId: "no-runtime",
  lookup: {
    async passportLinked() {
      return false;
    },
    async countInvoked() {
      throw new Error("on mode does not need the canary count");
    },
  },
  wait: async () => {},
});
assert.equal(missingRuntime.reason, "voice_runtime_missing");
assert.equal(missingRuntime.flag, "legacy");
assert.equal(missingRuntime.withholdClap, true);
assert.equal(missingRuntime.invoke, false);

const unknownCount = await resolveVoiceChoice({
  env: envOf({ ...ready, MUSIC_ANALYZER_VOICE_DETECTOR: "canary" }),
  versionNumber: 1,
  mimeType: "audio/mpeg",
  runId: "count-down",
  lookup: {
    async passportLinked() {
      return false;
    },
    async countInvoked() {
      return null;
    },
  },
  wait: async () => {},
});
assert.equal(unknownCount.reason, "count_unavailable");
assert.equal(unknownCount.withholdClap, false);

const queryError = await resolveVoiceChoice({
  env: envOf(runtime),
  versionNumber: 1,
  mimeType: "audio/mpeg",
  runId: "link-error",
  lookup: {
    async passportLinked() {
      return null;
    },
    async countInvoked() {
      throw new Error("link error must not invoke panns");
    },
  },
  wait: async () => {
    throw new Error("a failed link lookup must not wait");
  },
});
assert.equal(queryError.reason, "not_primary_upload");

const clap = {
  vocal: {
    type: "mixed",
    scores: {
      instrumental: { average: 0.65 },
      vocal: { average: 0.1 },
      spoken_word: { average: 0.1 },
      mixed: { average: 0.2 },
    },
  },
};
assert.equal(buildFeatures(clap).features.vocal_role.source, "analyzer:vocal.scores:conservative-v2");
const stamped = withWithheldVoiceDetector(clap, "detector_exit");
const withheld = buildFeatures(stamped).features.vocal_role;
assert.equal(withheld.value, null);
assert.equal(withheld.source, "analyzer:vocal.detector:panns-voice:2");
assert.equal(withheld.source.includes("conservative"), false);
assert.equal("detector" in clap.vocal, false);
const already = {
  vocal: {
    type: "instrumental",
    detector: {
      rule: "panns-voice:2",
      status: "ok",
      model: "Cnn14_mAP=0.431.pth",
      confidence_label: "medium",
      type: "instrumental",
      windows: [{ Speech: 0.9 }],
      elapsed_s: 8.7,
    },
  },
};
assert.equal(withWithheldVoiceDetector(already, "detector_exit"), already);
assert.equal(buildFeatures(already).features.vocal_role.value, "instrumental");

const failedLog = buildVoiceLog({
  choice: { mode: "canary", flag: "legacy", invoke: true, withholdClap: true, reason: "canary" },
  analysisSeconds: 11.25,
  voiceSeconds: null,
  detectorStatus: null,
  detectorReason: null,
  detectorError: "/var/lib/secret token",
});
assert.equal(failedLog.status, "unavailable");
assert.equal(failedLog.error, "_var_lib_secret_token");
assert.doesNotMatch(failedLog.error ?? "", /\//);
const timeoutLog = buildVoiceLog({
  choice: { mode: "on", flag: "panns", invoke: true, withholdClap: true, reason: "on" },
  analysisSeconds: MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS,
  voiceSeconds: null,
  detectorStatus: "timeout",
  detectorReason: "voice timeout",
  detectorError: null,
});
assert.equal(timeoutLog.status, "timeout");
assert.equal(timeoutLog.reason, "detector_timeout");
assert.equal(timeoutLog.error, "detector_timeout");
const line = formatMusicAnalyzerVoiceLog({
  mode: "canary",
  status: "ok",
  reason: "canary",
  analysis_seconds: 12.5,
  voice_seconds: 8.7,
  error: null,
});
assert.equal(line.includes("\n"), false);
const parsed = JSON.parse(line) as Record<string, unknown>;
assert.deepEqual(Object.keys(parsed), [
  "event",
  "mode",
  "status",
  "reason",
  "analysis_seconds",
  "voice_seconds",
  "error",
]);
assert.equal(parsed.event, "music_analyzer_voice");
assert.equal(parsed.voice_seconds, 8.7);
assert.doesNotMatch(line, /secret|filename|sha256|\.pth|SUPABASE/);

assert.deepEqual(buildAnalyzeTrackArgs("/tmp/in.wav", "/tmp/out", "panns").slice(-2), [
  "--voice-detector",
  "panns",
]);
const child = analyzerChildEnv({
  PATH: "/usr/bin",
  SUPABASE_SERVICE_ROLE_KEY: "secret",
  MUSIC_ANALYZER_VOICE_PYTHON: ready.MUSIC_ANALYZER_VOICE_PYTHON,
  MUSIC_ANALYZER_PANNS_CHECKPOINT: ready.MUSIC_ANALYZER_PANNS_CHECKPOINT,
  MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS: "1",
} as unknown as NodeJS.ProcessEnv, "/var/lib/audiolad/music-analyzer/.venv-v03-clap/bin/python", "/ckpt", {
  voiceThreads: true,
});
assert.equal(child.MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS, "120");
assert.equal(child.OMP_NUM_THREADS, "2");
assert.equal(child.MKL_NUM_THREADS, "2");
assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(child.MUSIC_ANALYZER_VOICE_PYTHON, ready.MUSIC_ANALYZER_VOICE_PYTHON);
const legacyChild = analyzerChildEnv({
  OMP_NUM_THREADS: "8",
  MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS: "1",
} as unknown as NodeJS.ProcessEnv, "/var/lib/audiolad/music-analyzer/.venv-v03-clap/bin/python");
assert.equal(legacyChild.OMP_NUM_THREADS, undefined);
assert.equal(legacyChild.MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS, undefined);

const claimed: ClaimedMusicAnalyzerRun = {
  id: "run-voice",
  lease_token: "lease",
  storage_bucket: "music-analyzer-runs",
  storage_path: "runs/x/a.wav",
  source_filename: "a.wav",
  mime_type: "audio/wav",
  sha256: "b".repeat(64),
  attempt_count: 1,
  version_number: 1,
};
const sealed: MusicAnalyzerExecuteResult = {
  analyzerVersion: "snapshot:cc5b2828",
  analyzerGitCommit: "cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0",
  analyzerContentCommit: "3750f3b000000000000000000000000000000000",
  modelCheckpoint: "music_audioset_epoch_15_esc_90.14.pt",
  taxonomyVersion: null,
  promptVersion: null,
  device: "cpu",
  rawJson: {},
  normalizedJson: {},
  provenance: { candidate_a: false },
  voice: {
    mode: "on",
    status: "ok",
    reason: "on",
    analysis_seconds: 9.1,
    voice_seconds: 8.7,
    error: null,
  },
};
const info: string[] = [];
let claimedOnce = false;
const port: MusicAnalyzerWorkerPort = {
  async recoverStaleJobs() {},
  async claimJob() {
    if (claimedOnce) return null;
    claimedOnce = true;
    return claimed;
  },
  async renewLease() {
    return true;
  },
  async executeJob() {
    return sealed;
  },
  async completeJob() {
    return true;
  },
  async failJob() {
    return true;
  },
  async releaseJob() {
    return true;
  },
};
const worker = createMusicAnalyzerWorker(port, {
  idleIntervalMs: 15,
  heartbeatIntervalMs: 10_000,
  shutdownDrainMs: 40,
  logger: {
    info(message) {
      info.push(message);
    },
    error(message) {
      info.push(message);
    },
  },
});
const running = worker.run();
const started = Date.now();
while (!info.some((message) => message.includes("music_analyzer_voice")) && Date.now() - started < 1500) {
  await delay(10);
}
worker.requestShutdown();
await running;
const voiceLine = info.find((message) => message.includes("music_analyzer_voice"));
assert.ok(voiceLine);
const voiceEvent = JSON.parse(voiceLine ?? "{}") as Record<string, unknown>;
assert.equal(voiceEvent.mode, "on");
assert.equal(voiceEvent.status, "ok");
assert.equal(voiceEvent.analysis_seconds, 9.1);
assert.equal(voiceEvent.voice_seconds, 8.7);
assert.equal(voiceEvent.error, null);
assert.equal("jobId" in voiceEvent, false);

const errors: string[] = [];
let failedOnce = false;
const failPort: MusicAnalyzerWorkerPort = {
  ...port,
  async claimJob() {
    if (failedOnce) return null;
    failedOnce = true;
    return { ...claimed, id: "run-voice-fail" };
  },
  async executeJob() {
    const error = new Error("analyze_failed") as Error & { voice: NonNullable<MusicAnalyzerExecuteResult["voice"]> };
    error.voice = {
      mode: "canary",
      status: "unavailable",
      reason: "detector_exit",
      analysis_seconds: 4,
      voice_seconds: null,
      error: "detector_exit",
    };
    throw error;
  },
};
const failWorker = createMusicAnalyzerWorker(failPort, {
  idleIntervalMs: 15,
  heartbeatIntervalMs: 10_000,
  shutdownDrainMs: 40,
  logger: {
    info(message) {
      errors.push(message);
    },
    error(message) {
      errors.push(message);
    },
  },
});
const failing = failWorker.run();
const failStarted = Date.now();
while (!errors.some((message) => message.includes("detector_exit")) && Date.now() - failStarted < 1500) {
  await delay(10);
}
failWorker.requestShutdown();
await failing;
assert.ok(errors.some((message) => {
  const event = JSON.parse(message) as { event?: string; error?: string };
  return event.event === "music_analyzer_voice" && event.error === "detector_exit";
}));

console.log("music-analyzer-voice-rollout-unit: ok");
