import {
  closeSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

import type { BulkOrchestratorState } from "./bulk-orchestrator";

function lockPath(): string {
  const override = process.env.AUDIOLAD_MUSIC_STORAGE_ORCHESTRATOR_STATE?.trim();
  const shared = process.env.AUDIOLAD_DEPLOY_SHARED?.trim() || "/var/www/audiolad-deploy/shared";
  const statePath = override || join(shared, "music-storage-bulk-orchestrator.json");
  return `${statePath}.lock`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid(path: string): number | null {
  try {
    const pid = Number(readFileSync(path, "utf8").split("\n")[0]?.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function acquireOrchestratorStateLock(): void {
  const path = lockPath();
  try {
    const fd = openSync(path, "wx");
    writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    (globalThis as { __orchStateLockFd?: number }).__orchStateLockFd = fd;
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      const holder = readLockPid(path);
      if (holder !== null && holder !== process.pid && isProcessAlive(holder)) {
        throw new Error("orchestrator_state_lock_held");
      }
      try {
        unlinkSync(path);
      } catch {
        throw new Error("orchestrator_state_lock_held");
      }
      acquireOrchestratorStateLock();
      return;
    }
    throw error;
  }
}

export function releaseOrchestratorStateLock(): void {
  const globalLock = globalThis as { __orchStateLockFd?: number };
  const fd = globalLock.__orchStateLockFd;
  if (fd !== undefined) {
    try {
      closeSync(fd);
    } finally {
      delete globalLock.__orchStateLockFd;
    }
  }
  const path = lockPath();
  try {
    unlinkSync(path);
  } catch {
    // best effort
  }
}

export function withOrchestratorStateLock<T>(
  run: () => T,
): T {
  acquireOrchestratorStateLock();
  try {
    return run();
  } finally {
    releaseOrchestratorStateLock();
  }
}

export function commitOrchestratorState(
  read: () => BulkOrchestratorState,
  write: (state: BulkOrchestratorState) => void,
  draft: BulkOrchestratorState,
  options?: { preserveControlMode?: boolean },
): BulkOrchestratorState {
  const live = read();
  if (options?.preserveControlMode && live.runMode !== "running" && draft.runMode === "running") {
    const merged: BulkOrchestratorState = {
      ...live,
      lastTotals: draft.lastTotals ?? live.lastTotals,
      journal: {
        ...live.journal,
        ticks: draft.journal.ticks,
        lastTickAt: draft.journal.lastTickAt,
        lastTickSummary: `tick_finished_while_${live.runMode}:${draft.journal.lastTickSummary ?? ""}`,
        batchesExecuted: Math.max(live.journal.batchesExecuted, draft.journal.batchesExecuted),
        assetsSucceeded: Math.max(live.journal.assetsSucceeded, draft.journal.assetsSucceeded),
        bytesSucceeded: Math.max(live.journal.bytesSucceeded, draft.journal.bytesSucceeded),
        transientFailures: Math.max(live.journal.transientFailures, draft.journal.transientFailures),
        criticalFailures: Math.max(live.journal.criticalFailures, draft.journal.criticalFailures),
      },
      updatedAt: new Date().toISOString(),
    };
    write(merged);
    return merged;
  }
  write(draft);
  return draft;
}