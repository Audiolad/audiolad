import { spawnSync } from "node:child_process";
import { statfs } from "node:fs";
import { promisify } from "node:util";
import { loadavg } from "node:os";

const statfsAsync = promisify(statfs);

export type HostGuardThresholds = {
  diskWarningPercent: number;
  diskPausePercent: number;
  diskCriticalPercent: number;
  minFreeBytes: number;
  loadAvg1Max: number | null;
};

export type HostGuardSnapshot = {
  diskUsedPercent: number | null;
  freeBytes: number | null;
  loadAvg1: number;
  level: "ok" | "warning" | "pause" | "critical";
  reasons: string[];
};

export const DEFAULT_HOST_GUARDS: HostGuardThresholds = {
  diskWarningPercent: 85,
  diskPausePercent: 88,
  diskCriticalPercent: 90,
  minFreeBytes: 5 * 1024 * 1024 * 1024,
  loadAvg1Max: 8,
};

export function readHostGuardSnapshot(
  thresholds: HostGuardThresholds = DEFAULT_HOST_GUARDS,
  path = "/",
): HostGuardSnapshot {
  const reasons: string[] = [];
  let diskUsedPercent: number | null = null;
  let freeBytes: number | null = null;

  const df = spawnSync("df", ["-P", path], { encoding: "utf8" });
  if (df.status === 0) {
    const line = df.stdout.trim().split("\n").at(-1) ?? "";
    const parts = line.split(/\s+/);
    if (parts.length >= 4) {
      const total = Number(parts[1]) * 1024;
      const available = Number(parts[3]) * 1024;
      freeBytes = Number.isFinite(available) ? available : null;
      if (Number.isFinite(total) && total > 0 && freeBytes !== null) {
        diskUsedPercent = Math.round(((total - freeBytes) / total) * 10_000) / 100;
      }
    }
  }

  const loadAvg1 = loadavg()[0] ?? 0;
  let level: HostGuardSnapshot["level"] = "ok";

  if (diskUsedPercent !== null && diskUsedPercent >= thresholds.diskCriticalPercent) {
    level = "critical";
    reasons.push(`disk_used_percent>=${thresholds.diskCriticalPercent}`);
  } else if (diskUsedPercent !== null && diskUsedPercent >= thresholds.diskPausePercent) {
    level = "pause";
    reasons.push(`disk_used_percent>=${thresholds.diskPausePercent}`);
  } else if (diskUsedPercent !== null && diskUsedPercent >= thresholds.diskWarningPercent) {
    level = "warning";
    reasons.push(`disk_used_percent>=${thresholds.diskWarningPercent}`);
  }

  if (freeBytes !== null && freeBytes < thresholds.minFreeBytes) {
    if (level === "ok") level = "pause";
    reasons.push(`free_bytes<${thresholds.minFreeBytes}`);
  }

  if (thresholds.loadAvg1Max !== null && loadAvg1 > thresholds.loadAvg1Max) {
    if (level === "ok" || level === "warning") level = "pause";
    reasons.push(`load_avg_1>${thresholds.loadAvg1Max}`);
  }

  return { diskUsedPercent, freeBytes, loadAvg1, level, reasons };
}

export async function assertTempSpaceForBytes(
  bytes: number,
  bufferBytes = 512 * 1024 * 1024,
  tempRoot = "/",
): Promise<void> {
  const stats = await statfsAsync(tempRoot);
  const free = Number(stats.bavail) * Number(stats.bsize);
  const required = bytes * 2 + bufferBytes;
  if (!Number.isFinite(free) || free < required) {
    throw new Error(`temp_space_insufficient:need=${required}:free=${free}`);
  }
}

export function isTransientMusicStorageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|music_storage_download_5|music_storage_upload_5|music_storage_head_5|timeout)/i.test(message);
}

export function retryBackoffMs(attemptCount: number, baseMs = 15_000, capMs = 600_000): number {
  const attempt = Math.max(1, attemptCount);
  return Math.min(capMs, baseMs * 2 ** Math.min(attempt - 1, 5));
}