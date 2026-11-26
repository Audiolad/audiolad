import {
  existsSync,
  mkdirSync,
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
import {
  isDeployLockHeld,
  tryAcquireDeployLockForBulk,
} from "./deploy-lock-probe";
import {
  commitOrchestratorState,
  withOrchestratorStateLock,
} from "./orchestrator-state-lock";

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
  catalogRescanEachTick: boolean;
};

export type BulkOrchestratorState = {
  version: 1;
  stage: BulkStage;
  runMode: BulkOrchestratorRunMode;
  /** Deprecated cursor; catalog is rescanned from the start every tick. */
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

export { deployLockPath, isDeployLockHeld } from "./deploy-lock-probe";

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
      catalogRescanEachTick: true,
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
    if (parsed.journal && parsed.journal.catalogRescanEachTick === undefined) {
      parsed.journal.catalogRescanEachTick = true;
    }
    parsed.afterAssetId = null;
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
  state.afterAssetId = null;
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

function bulkOptionsFromState(state: BulkOrchestratorState): BulkMigrationOptions {
  return {
    ...parseBulkMigrationOptions([]),
    stage: state.stage,
    execute: true,
    progressOnly: false,
    batchSize: Number(process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_BATCH_SIZE) || 25,
    concurrency: Number(process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_CONCURRENCY) || 1,
    afterAssetId: null,
  };
}

export async function runOrchestratorTick(
  stage: BulkStage,
): Promise<{ outcome: OrchestratorTickOutcome; state: BulkOrchestratorState; detail?: unknown }> {
  const initial = readOrchestratorState();
  if (initial.stage !== stage) {
    return { outcome: "idle_stopped", state: initial, detail: { reason: "stage_mismatch" } };
  }
  if (initial.runMode === "stopped") return { outcome: "idle_stopped", state: initial };
  if (initial.runMode === "paused") return { outcome: "idle_paused", state: initial };
  if (initial.runMode === "completed") return { outcome: "idle_completed", state: initial };
  if (initial.runMode === "halted") {
    return { outcome: "halted_critical", state: initial, detail: { haltReason: initial.haltReason } };
  }

  if (isDeployLockHeld()) {
    return withOrchestratorStateLock(() => {
      const state = readOrchestratorState();
      state.journal.lastTickSummary = "skipped_deploy_lock";
      state.journal.ticks += 1;
      state.journal.lastTickAt = new Date().toISOString();
      writeOrchestratorState(state);
      return { outcome: "skipped_deploy_lock" as const, state };
    });
  }

  const deployHold = tryAcquireDeployLockForBulk();
  if (!deployHold) {
    return withOrchestratorStateLock(() => {
      const state = readOrchestratorState();
      state.journal.lastTickSummary = "skipped_deploy_lock";
      state.journal.ticks += 1;
      state.journal.lastTickAt = new Date().toISOString();
      writeOrchestratorState(state);
      return { outcome: "skipped_deploy_lock" as const, state };
    });
  }

  const draft: BulkOrchestratorState = { ...readOrchestratorState() };
  draft.journal.ticks += 1;
  draft.journal.lastTickAt = new Date().toISOString();

  const options = bulkOptionsFromState(draft);
  installBulkMigrationSignalCleanup();
  acquireBulkMigrationLock();
  try {
    assertStageExecuteEnv(stage);
    const result = await executeBulkBatch(options);
    draft.lastTotals = result.totals;

    if (result.paused) {
      draft.journal.lastTickSummary = result.pauseReason ?? "host_guard_pause";
      const state = commitOrchestratorState(
        readOrchestratorState,
        writeOrchestratorState,
        draft,
        { preserveControlMode: true },
      );
      return { outcome: "skipped_host_pause", state, detail: result };
    }

    const results = result.results ?? [];
    if (results.length === 0) {
      if (result.totals.stageEligible === 0) {
        draft.runMode = "completed";
        draft.completedAt = new Date().toISOString();
        draft.journal.lastTickSummary = "stage_complete";
        const state = commitOrchestratorState(
          readOrchestratorState,
          writeOrchestratorState,
          draft,
          { preserveControlMode: true },
        );
        return { outcome: "idle_completed", state, detail: result.totals };
      }
      draft.journal.lastTickSummary = "catalog_rescan_pending_work";
      const state = commitOrchestratorState(
        readOrchestratorState,
        writeOrchestratorState,
        draft,
        { preserveControlMode: true },
      );
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

    draft.journal.batchesExecuted += 1;
    draft.journal.assetsSucceeded += succeeded;
    draft.journal.bytesSucceeded += bytes;
    draft.journal.transientFailures += transient;
    draft.journal.criticalFailures += critical;

    if (critical > 0) {
      draft.runMode = "halted";
      const first = results.find((row) => row.outcome === "error" || row.error);
      draft.haltReason = first?.error ?? first?.outcome ?? "critical_batch_failure";
      draft.journal.lastTickSummary = draft.haltReason;
      writeOrchestratorAlert(`stage=${stage} haltReason=${draft.haltReason}`);
      const state = commitOrchestratorState(
        readOrchestratorState,
        writeOrchestratorState,
        draft,
      );
      return { outcome: "halted_critical", state, detail: result };
    }

    if (result.totals.stageEligible === 0) {
      draft.runMode = "completed";
      draft.completedAt = new Date().toISOString();
      draft.journal.lastTickSummary = "stage_complete";
    } else {
      draft.journal.lastTickSummary = `batch_${succeeded}/${results.length}`;
    }
    const state = commitOrchestratorState(
      readOrchestratorState,
      writeOrchestratorState,
      draft,
      { preserveControlMode: true },
    );
    return {
      outcome: transient > 0 ? "batch_partial" : "batch_ok",
      state,
      detail: result,
    };
  } finally {
    deployHold.release();
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

export function orchestratorStart(stage: BulkStage, _resetCursor = false): BulkOrchestratorState {
  return withOrchestratorStateLock(() => {
    const state = readOrchestratorState();
    if (state.stage !== stage && state.runMode !== "stopped" && state.runMode !== "completed") {
      throw new Error("Cannot start another stage while orchestrator is active");
    }
    const previousMode = state.runMode;
    state.stage = stage;
    state.runMode = "running";
    state.haltReason = null;
    state.completedAt = null;
    state.afterAssetId = null;
    if (previousMode === "stopped" || previousMode === "completed") {
      state.startedAt = new Date().toISOString();
      state.deployShaAtStart = deployCommitSha();
    }
    writeOrchestratorState(state);
    return state;
  });
}

export function orchestratorStop(): BulkOrchestratorState {
  return withOrchestratorStateLock(() => {
    const state = readOrchestratorState();
    state.runMode = "stopped";
    state.haltReason = null;
    writeOrchestratorState(state);
    return state;
  });
}

export function orchestratorPause(): BulkOrchestratorState {
  return withOrchestratorStateLock(() => {
    const state = readOrchestratorState();
    if (state.runMode !== "running") throw new Error("orchestrator_not_running");
    state.runMode = "paused";
    writeOrchestratorState(state);
    return state;
  });
}

export function orchestratorResume(): BulkOrchestratorState {
  return withOrchestratorStateLock(() => {
    const state = readOrchestratorState();
    if (state.runMode !== "paused" && state.runMode !== "halted") {
      throw new Error("orchestrator_not_pausable");
    }
    state.runMode = "running";
    state.haltReason = null;
    writeOrchestratorState(state);
    return state;
  });
}