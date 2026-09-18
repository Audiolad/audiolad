/**
 * Scoped Studio render temp dirs under os.tmpdir().
 *
 * Prefix is exact: only `audiolad-render-<uuid>` job workspaces.
 * try/finally removes the current job dir while Node is alive; SIGKILL/OOM
 * skips finally, so a PID-aware stale sweeper reclaims orphans safely.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

/** Exact directory name prefix for claim-job workspaces (not audiolad-studio-*). */
export const STUDIO_RENDER_TEMP_PREFIX = "audiolad-render-";

/** Marker written into each workspace so sweepers can detect a live owner. */
export const STUDIO_RENDER_TEMP_OWNER_FILE = ".audiolad-render-owner.json";

/**
 * Stale TTL for orphaned job dirs after hard death (SIGKILL/OOM).
 * Worker docs allow FFmpeg runs up to ~3 hours with lease heartbeats
 * (STUDIO_RENDER_LEASE_SECONDS=1800, renew every 5 minutes). 6 hours is 2×
 * that documented max so an active long render is never swept early; dirs
 * younger than this are left alone even if the PID file is missing.
 */
export const STUDIO_RENDER_TEMP_STALE_TTL_MS = 6 * 60 * 60 * 1000;

/** libmp3lame CBR used by studioRenderFfmpegOutputArgs. */
export const STUDIO_RENDER_OUTPUT_BITRATE_BPS = 192_000;

/**
 * Absolute floor: refuse to start a heavy render when the filesystem that holds
 * temp dirs has less free space than this. Prevents filling the disk to 100%.
 * Chosen above a few GB of sources + multi-hour 192k output (~260 MB for 3h)
 * with headroom for concurrent agents on a shared box — not a per-project
 * duration cap.
 */
export const STUDIO_RENDER_MIN_FREE_BYTES = 4 * 1024 * 1024 * 1024;

/** Extra multiplier on estimated MP3 size for filter/IR scratch and upload hold. */
export const STUDIO_RENDER_DISK_SAFETY_MULTIPLIER = 4;

/** Fixed allowance for downloaded source assets beside the output MP3. */
export const STUDIO_RENDER_SOURCE_HEADROOM_BYTES = 2 * 1024 * 1024 * 1024;

const UUID_SUFFIX_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StudioRenderTempOwner = Readonly<{
  pid: number;
  startedAtMs: number;
  jobId?: string;
}>;

export class StudioRenderDiskSpaceError extends Error {
  readonly code = "studio_render_disk_space";

  constructor(
    readonly freeBytes: number,
    readonly requiredBytes: number,
    message?: string,
  ) {
    super(
      message
        ?? `Недостаточно места на диске для рендера: свободно ${freeBytes} байт, нужно минимум ${requiredBytes}.`,
    );
    this.name = "StudioRenderDiskSpaceError";
  }
}

export function isStudioRenderTempDirName(name: string): boolean {
  if (!name.startsWith(STUDIO_RENDER_TEMP_PREFIX)) return false;
  const suffix = name.slice(STUDIO_RENDER_TEMP_PREFIX.length);
  return UUID_SUFFIX_RE.test(suffix);
}

export function resolveStudioRenderTempRoot(root = tmpdir()): string {
  return root;
}

export function studioRenderTempWorkspacePath(
  id: string = randomUUID(),
  root = tmpdir(),
): string {
  return join(resolveStudioRenderTempRoot(root), `${STUDIO_RENDER_TEMP_PREFIX}${id}`);
}

export function estimateStudioRenderOutputBytes(durationSeconds: number): number {
  const safeDuration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 0;
  return Math.ceil((safeDuration * STUDIO_RENDER_OUTPUT_BITRATE_BPS) / 8);
}

export function requiredStudioRenderFreeBytes(durationSeconds: number): number {
  const estimated = estimateStudioRenderOutputBytes(durationSeconds);
  const scaled = estimated * STUDIO_RENDER_DISK_SAFETY_MULTIPLIER
    + STUDIO_RENDER_SOURCE_HEADROOM_BYTES;
  return Math.max(STUDIO_RENDER_MIN_FREE_BYTES, scaled);
}

export async function readStudioRenderFreeBytes(path = tmpdir()): Promise<number> {
  const info = await statfs(path);
  return Number(info.bavail) * Number(info.bsize);
}

export async function assertStudioRenderDiskSpace(options: {
  durationSeconds?: number;
  path?: string;
  nowFreeBytes?: number;
} = {}): Promise<{ freeBytes: number; requiredBytes: number }> {
  const requiredBytes = requiredStudioRenderFreeBytes(options.durationSeconds ?? 0);
  const freeBytes = options.nowFreeBytes
    ?? await readStudioRenderFreeBytes(options.path ?? tmpdir());
  if (freeBytes < requiredBytes) {
    throw new StudioRenderDiskSpaceError(freeBytes, requiredBytes);
  }
  return { freeBytes, requiredBytes };
}

export async function createStudioRenderTempWorkspace(options: {
  jobId?: string;
  root?: string;
  pid?: number;
  nowMs?: number;
} = {}): Promise<string> {
  const workspace = studioRenderTempWorkspacePath(randomUUID(), options.root);
  await mkdir(workspace, { recursive: true });
  const owner: StudioRenderTempOwner = {
    pid: options.pid ?? process.pid,
    startedAtMs: options.nowMs ?? Date.now(),
    ...(options.jobId ? { jobId: options.jobId } : {}),
  };
  await writeFile(
    join(workspace, STUDIO_RENDER_TEMP_OWNER_FILE),
    `${JSON.stringify(owner)}\n`,
    "utf8",
  );
  return workspace;
}

/** Sync variant for tests that need mkdirSync-style setup. */
export function createStudioRenderTempWorkspaceSync(options: {
  jobId?: string;
  root?: string;
  pid?: number;
  nowMs?: number;
  id?: string;
} = {}): string {
  const workspace = studioRenderTempWorkspacePath(options.id ?? randomUUID(), options.root);
  mkdirSync(workspace, { recursive: true });
  const owner: StudioRenderTempOwner = {
    pid: options.pid ?? process.pid,
    startedAtMs: options.nowMs ?? Date.now(),
    ...(options.jobId ? { jobId: options.jobId } : {}),
  };
  writeFileSync(
    join(workspace, STUDIO_RENDER_TEMP_OWNER_FILE),
    `${JSON.stringify(owner)}\n`,
    "utf8",
  );
  return workspace;
}

export function assertScopedStudioRenderTempPath(
  workspace: string,
  root = tmpdir(),
): void {
  const name = basename(workspace);
  if (!isStudioRenderTempDirName(name)) {
    throw new Error(`refusing to touch non-render temp path: ${name}`);
  }
  const expectedRoot = resolveStudioRenderTempRoot(root);
  if (!workspace.startsWith(expectedRoot)) {
    throw new Error(`refusing to touch temp path outside ${expectedRoot}`);
  }
}

export async function removeStudioRenderTempWorkspace(
  workspace: string,
  root = tmpdir(),
): Promise<void> {
  assertScopedStudioRenderTempPath(workspace, root);
  await rm(workspace, { recursive: true, force: true });
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EPERM") return true;
    return false;
  }
}

export async function readStudioRenderTempOwner(
  workspace: string,
): Promise<StudioRenderTempOwner | null> {
  try {
    const raw = await readFile(join(workspace, STUDIO_RENDER_TEMP_OWNER_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<StudioRenderTempOwner>;
    if (typeof parsed.pid !== "number" || typeof parsed.startedAtMs !== "number") {
      return null;
    }
    return {
      pid: parsed.pid,
      startedAtMs: parsed.startedAtMs,
      ...(typeof parsed.jobId === "string" ? { jobId: parsed.jobId } : {}),
    };
  } catch {
    return null;
  }
}

export type SweepStudioRenderTempDirsResult = Readonly<{
  scanned: number;
  removed: string[];
  skippedActive: string[];
  skippedFresh: string[];
  skippedForeign: string[];
}>;

export async function sweepStaleStudioRenderTempDirs(options: {
  root?: string;
  nowMs?: number;
  ttlMs?: number;
  isAlive?: (pid: number) => boolean;
} = {}): Promise<SweepStudioRenderTempDirsResult> {
  const root = resolveStudioRenderTempRoot(options.root);
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? STUDIO_RENDER_TEMP_STALE_TTL_MS;
  const isAlive = options.isAlive ?? isPidAlive;
  const removed: string[] = [];
  const skippedActive: string[] = [];
  const skippedFresh: string[] = [];
  const skippedForeign: string[] = [];
  let scanned = 0;

  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return {
      scanned,
      removed,
      skippedActive,
      skippedFresh,
      skippedForeign,
    };
  }

  for (const name of names) {
    if (!name.startsWith(STUDIO_RENDER_TEMP_PREFIX)) {
      continue;
    }
    if (!isStudioRenderTempDirName(name)) {
      skippedForeign.push(name);
      continue;
    }
    scanned += 1;
    const workspace = join(root, name);
    let dirStat;
    try {
      dirStat = await stat(workspace);
      if (!dirStat.isDirectory()) {
        skippedForeign.push(name);
        continue;
      }
    } catch {
      continue;
    }

    const owner = await readStudioRenderTempOwner(workspace);
    if (owner && isAlive(owner.pid)) {
      skippedActive.push(name);
      continue;
    }

    const ageAnchorMs = owner?.startedAtMs
      ?? dirStat.mtimeMs
      ?? dirStat.ctimeMs
      ?? nowMs;
    const ageMs = nowMs - ageAnchorMs;
    if (ageMs < ttlMs) {
      skippedFresh.push(name);
      continue;
    }

    try {
      await removeStudioRenderTempWorkspace(workspace, root);
      removed.push(name);
    } catch (error) {
      console.error(JSON.stringify({
        event: "studio_render_temp_sweep_failed",
        workspace: name,
        error: error instanceof Error ? error.message : "unknown_error",
      }));
    }
  }

  return {
    scanned,
    removed,
    skippedActive,
    skippedFresh,
    skippedForeign,
  };
}

/** Sync helpers used by focused unit tests. */
export function listStudioRenderTempDirNamesSync(root = tmpdir()): string[] {
  try {
    return readdirSync(root).filter((name) => isStudioRenderTempDirName(name));
  } catch {
    return [];
  }
}

export function readStudioRenderTempOwnerSync(
  workspace: string,
): StudioRenderTempOwner | null {
  try {
    const raw = readFileSync(join(workspace, STUDIO_RENDER_TEMP_OWNER_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<StudioRenderTempOwner>;
    if (typeof parsed.pid !== "number" || typeof parsed.startedAtMs !== "number") {
      return null;
    }
    return {
      pid: parsed.pid,
      startedAtMs: parsed.startedAtMs,
      ...(typeof parsed.jobId === "string" ? { jobId: parsed.jobId } : {}),
    };
  } catch {
    return null;
  }
}

export function workspaceMtimeMsSync(workspace: string): number {
  return statSync(workspace).mtimeMs;
}
