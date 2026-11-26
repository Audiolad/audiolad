import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import {
  executeBulkBatch,
  parseBulkMigrationOptions,
  summarizeBulkProgress,
  type BulkMigrationOptions,
  type BulkProgressTotals,
  type BulkStage,
} from "./bulk-migration";
import {
  acquireBulkMigrationLock,
  installBulkMigrationSignalCleanup,
  releaseBulkMigrationLock,
} from "./bulk-process-lock";

export type BulkOrchestratorRunMode =
  | "stopped"
  | "running"
  | "paused"
  | "completed"
  | "halted";

export type BulkOrchestratorJournal = {
  ticks: number;
  batchesExecuted: number;
  assetsSucceeded: number;
  bytesSucceeded: number;
  transientFailures: number;
  criticalFailures: number;
  lastTickAt: string | null;
  lastTickSummary: string | null;
};

export type BulkOrchestratorState = {
  version: 1;
  stage: BulkStage;
  runMode: BulkOrchestratorRunMode;
  afterAssetId: string | null;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  haltReason: string | null;
  deployShaAtStart: string | null;
  journal: BulkOrchestratorJournal;
  lastTotals: BulkProgressTotals | null;
};

const DEFAULT_STATE_NAME = "music-storage-bulk-orchestrator.json";

export function orchestratorStatePath(): string {
  const override = process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_STATE?.trim();
  if (override) return override;
  const shared = process.env.AUDIOLAD_DEPLOY_SHARED?.trim() || "/var/www/audiolad-deploy/shared";
  return join(shared, DEFAULT_STATE_NAME);
}

export function deployLockPath(): string {
  return process.env.DEPLOY_LOCK_FILE?.trim() || "/run/audiolad-deploy.lock";
}

export function isDeployLockHeld(): boolean {
  const path = deployLockPath();
  if (!existsSync(path)) return false;
  try {
    const fd = openSync(path, "r");
    closeSync(fd);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EAGAIN") return true;
    return false;
  }
}

function deployCommitSha(): string | null {
  const path = process.env.AUDIOLAD_DEPLOY_COMMIT_FILE?.trim()
    || "/var/www/audiolad-deploy/current/.deploy-commit";
  try {
    return readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}

export function defaultOrchestratorState(stage: BulkStage = "copy"): BulkOrchestratorState {
  return {
    version: 1,
    stage,
    runMode: "stopped",
    afterAssetId: null,
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    haltReason: null,
    deployShaAtStart: null,
    journal: {
      ticks: 0,
      batchesExecuted: 0,
      assetsSucceeded: 0,
      bytesSucceeded: 0,
      transientFailures: 0,
      criticalFailures: 0,
      lastTickAt: null,
      lastTickSummary: null,
    },
    lastTotals: null,
  };
}

export function readOrchestratorState(): BulkOrchestratorState {
  const path = orchestratorStatePath();
  if (!existsSync(path)) return defaultOrchestratorState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as BulkOrchestratorState;
    if (parsed?.version !== 1) return defaultOrchestratorState(parsed?.stage ?? "copy");
    return parsed;
  } catch {
    return defaultOrchestratorState();
  }
}

function writeOrchestratorAlert(message: string): void {
  const line = `${new Date().toISOString()}\t${message}\n`;
  console.error(`audiolad-music-storage-bulk-alert\t${message}`);
  const shared = process.env.AUDIOLAD_DEPLOY_SHARED?.trim() || "/var/www/audiolad-deploy/shared";
  const logPath = process.env.AUDIOLAD_MUSIC_STORAGE_ALERT_LOG?.trim()
    || join(shared, "music-storage-bulk-alerts.log");
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, line, { flag: "a", mode: 0o600 });
  } catch {
    // journal-only fallback
  }
}

export function writeOrchestratorState(state: BulkOrchestratorState): void {
  const path = orchestratorStatePath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

export function stageExecuteEnvNames(stage: BulkStage): string[] {
  const names = ["AUDIOLAD_MUSIC_STORAGE_BULK"];
  if (stage === "cutover") names.push("AUDIOLAD_MUSIC_STORAGE_CUTOVER");
  if (stage === "release-local") names.push("AUDIOLAD_MUSIC_STORAGE_RELEASE_LOCAL");
  return names;
}

export function assertStageExecuteEnv(stage: BulkStage): void {
  for (const name of stageExecuteEnvNames(stage)) {
    if (process.env[name] !== "1") {
      throw new Error(`Execution requires ${name}=1`);
    }
  }
}

export type OrchestratorTickOutcome =
  | "idle_stopped"
  | "idle_paused"
  | "idle_completed"
  | "skipped_deploy_lock"
  | "skipped_host_pause"
  | "skipped_empty"
  | "batch_ok"
  | "batch_partial"
  | "halted_critical";

function outcomeIsSuccess(outcome: string): boolean {
  return [
    "already_verified",
    "cut_over",
    "already_cut_over",
    "local_released",
    "already_released",
    "already_local",
  ].includes(outcome);
}

function bulkOptionsFromState(
  state: BulkOrchestratorState,
  overrides: Partial<BulkMigrationOptions> = {},
): BulkMigrationOptions {
  return {
    ...parseBulkMigrationOptions([]),
    stage: state.stage,
    execute: true,
    progressOnly: false,
    batchSize: Number(process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_BATCH_SIZE) || 25,
    concurrency: Number(process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_CONCURRENCY) || 1,
    afterAssetId: state.afterAssetId,
    ...overrides,
  };
}

export async function runOrchestratorTick(
  stage: BulkStage,
): Promise<{ outcome: OrchestratorTickOutcome; state: BulkOrchestratorState; detail?: unknown }> {
  const state = readOrchestratorState();
  if (state.stage !== stage) {
    return { outcome: "idle_stopped", state, detail: { reason: "stage_mismatch" } };
  }
  if (state.runMode === "stopped") return { outcome: "idle_stopped", state };
  if (state.runMode === "paused") return { outcome: "idle_paused", state };
  if (state.runMode === "completed") return { outcome: "idle_completed", state };
  if (state.runMode === "halted") {
    return { outcome: "halted_critical", state, detail: { haltReason: state.haltReason } };
  }

  if (isDeployLockHeld()) {
    state.journal.lastTickSummary = "skipped_deploy_lock";
    state.journal.ticks += 1;
    state.journal.lastTickAt = new Date().toISOString();
    writeOrchestratorState(state);
    return { outcome: "skipped_deploy_lock", state };
  }

  state.journal.ticks += 1;
  state.journal.lastTickAt = new Date().toISOString();

  const options = bulkOptionsFromState(state);
  installBulkMigrationSignalCleanup();
  acquireBulkMigrationLock();
  try {
    assertStageExecuteEnv(stage);
    const result = await executeBulkBatch(options);
    state.lastTotals = result.totals;

    if (result.paused) {
      state.journal.lastTickSummary = result.pauseReason ?? "host_guard_pause";
      writeOrchestratorState(state);
      return { outcome: "skipped_host_pause", state, detail: result };
    }

    const results = result.results ?? [];
    if (results.length === 0) {
      if (result.totals.stageEligible === 0) {
        state.runMode = "completed";
        state.completedAt = new Date().toISOString();
        state.journal.lastTickSummary = "stage_complete";
        writeOrchestratorState(state);
        return { outcome: "idle_completed", state, detail: result.totals };
      }
      state.journal.lastTickSummary = "no_work_in_batch";
      writeOrchestratorState(state);
      return { outcome: "skipped_empty", state, detail: result };
    }

    let critical = 0;
    let transient = 0;
    let bytes = 0;
    let succeeded = 0;
    for (const row of results) {
      if (row.outcome === "transient_failed" || row.outcome === "paused") {
        transient += 1;
        continue;
      }
      if (row.outcome === "error" || row.error) {
        critical += 1;
        continue;
      }
      if (outcomeIsSuccess(row.outcome)) {
        succeeded += 1;
        const batchEntry = result.batch.find((entry) => entry.id === row.id);
        bytes += batchEntry?.sizeBytes ?? 0;
      }
    }

    state.journal.batchesExecuted += 1;
    state.journal.assetsSucceeded += succeeded;
    state.journal.bytesSucceeded += bytes;
    state.journal.transientFailures += transient;
    state.journal.criticalFailures += critical;

    const lastId = result.batch[result.batch.length - 1]?.id;
    if (lastId) state.afterAssetId = lastId;

    if (critical > 0) {
      state.runMode = "halted";
      const first = results.find((row) => row.outcome === "error" || row.error);
      state.haltReason = first?.error ?? first?.outcome ?? "critical_batch_failure";
      state.journal.lastTickSummary = state.haltReason;
      writeOrchestratorAlert(`stage=${stage} haltReason=${state.haltReason}`);
      writeOrchestratorState(state);
      return { outcome: "halted_critical", state, detail: result };
    }

    if (result.totals.stageEligible === 0) {
      state.runMode = "completed";
      state.completedAt = new Date().toISOString();
      state.journal.lastTickSummary = "stage_complete";
    } else {
      state.journal.lastTickSummary = `batch_${succeeded}/${results.length}`;
    }
    writeOrchestratorState(state);
    return {
      outcome: transient > 0 ? "batch_partial" : "batch_ok",
      state,
      detail: result,
    };
  } finally {
    releaseBulkMigrationLock();
  }
}

export async function orchestratorStatus(stage: BulkStage) {
  const state = readOrchestratorState();
  const totals = await summarizeBulkProgress(stage);
  return {
    state,
    totals,
    deployLockHeld: isDeployLockHeld(),
    deployCommit: deployCommitSha(),
    statePath: orchestratorStatePath(),
  };
}

export function orchestratorStart(stage: BulkStage, resetCursor = false): BulkOrchestratorState {
  const state = readOrchestratorState();
  if (state.stage !== stage && state.runMode !== "stopped" && state.runMode !== "completed") {
    throw new Error("Cannot start another stage while orchestrator is active");
  }
  const previousMode = state.runMode;
  state.stage = stage;
  state.runMode = "running";
  state.haltReason = null;
  state.completedAt = null;
  if (resetCursor || previousMode === "stopped" || previousMode === "completed") {
    state.afterAssetId = null;
  }
  state.startedAt = new Date().toISOString();
  state.deployShaAtStart = deployCommitSha();
  writeOrchestratorState(state);
  return state;
}

export function orchestratorStop(): BulkOrchestratorState {
  const state = readOrchestratorState();
  state.runMode = "stopped";
  state.haltReason = null;
  writeOrchestratorState(state);
  return state;
}

export function orchestratorPause(): BulkOrchestratorState {
  const state = readOrchestratorState();
  if (state.runMode !== "running") throw new Error("orchestrator_not_running");
  state.runMode = "paused";
  writeOrchestratorState(state);
  return state;
}

export function orchestratorResume(): BulkOrchestratorState {
  const state = readOrchestratorState();
  if (state.runMode !== "paused" && state.runMode !== "halted") {
    throw new Error("orchestrator_not_pausable");
  }
  state.runMode = "running";
  state.haltReason = null;
  writeOrchestratorState(state);
  return state;
}