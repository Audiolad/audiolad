import {
  closeSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK_BASENAME = "audiolad-music-storage-bulk.lock";

function lockPath(): string {
  const override = process.env.AUDIOLAD_MUSIC_STORAGE_BULK_LOCK?.trim();
  return override || join(tmpdir(), LOCK_BASENAME);
}

let heldFd: number | null = null;

function readLockPid(path: string): number | null {
  try {
    const pid = Number(readFileSync(path, "utf8").split("\n")[0]?.trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryCreateLock(path: string): number {
  try {
    const fd = openSync(path, "wx");
    const payload = `${process.pid}\n${new Date().toISOString()}\n`;
    writeSync(fd, payload);
    return fd;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      const holder = readLockPid(path);
      if (holder !== null && holder !== process.pid && isProcessAlive(holder)) {
        throw new Error("bulk_migration_already_running");
      }
      try {
        unlinkSync(path);
      } catch {
        throw new Error("bulk_migration_already_running");
      }
      return tryCreateLock(path);
    }
    throw error;
  }
}

/** Exclusive lock for bulk execute — one process per host. */
export function acquireBulkMigrationLock(): { pid: number; path: string } {
  const path = lockPath();
  heldFd = tryCreateLock(path);
  return { pid: process.pid, path };
}

export function releaseBulkMigrationLock(): void {
  if (heldFd === null) return;
  const path = lockPath();
  try {
    closeSync(heldFd);
  } finally {
    heldFd = null;
    try {
      unlinkSync(path);
    } catch {
      // best effort
    }
  }
}

export function installBulkMigrationSignalCleanup(onRelease?: () => void): void {
  const cleanup = (signal: string) => {
    onRelease?.();
    releaseBulkMigrationLock();
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    process.exit(process.exitCode);
  };
  process.once("SIGINT", () => cleanup("SIGINT"));
  process.once("SIGTERM", () => cleanup("SIGTERM"));
}