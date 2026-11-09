/**
 * Hall / point device: after a deploy, open tabs keep the old JS until a reload.
 * Heartbeat carries the client build id; the server echoes the current one. A mismatch
 * triggers a reload only at a safe moment (visible + paused, or right after a track change),
 * never mid-track, with a sessionStorage guard against reload loops.
 */

/** Calm owner-home note (Russian, en dash). */
export const HALL_STALE_BUILD_NOTE =
  "Устройство на старой версии – откройте приложение заново";

/** sessionStorage key: server build id we already reloaded for. */
export const HALL_BUILD_RELOAD_STORAGE_KEY = "audiolad.hall.build-reload";

/** Max length matches business_player_runtime.app_version check (1..64). */
export const HALL_APP_VERSION_MAX = 64;

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;
const NEXT_BUILD_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Accept a client/server build id for storage and comparison.
 * Prefer a full deploy commit SHA; otherwise a Next BUILD_ID-like token.
 */
export function normalizeHallAppVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > HALL_APP_VERSION_MAX) return null;
  if (FULL_GIT_SHA.test(trimmed)) return trimmed.toLowerCase();
  if (NEXT_BUILD_ID.test(trimmed)) return trimmed;
  return null;
}

export function hallBuildMismatch(
  clientVersion: string | null | undefined,
  serverVersion: string | null | undefined,
): boolean {
  const client = normalizeHallAppVersion(clientVersion ?? null);
  const server = normalizeHallAppVersion(serverVersion ?? null);
  if (!client || !server) return false;
  return client !== server;
}

export type HallSafeReloadInput = {
  /** document.visibilityState === "visible" */
  pageVisible: boolean;
  /** Music is paused / stopped / idle (not actively playing). */
  musicPaused: boolean;
  /** Controller just advanced to another track (boundary, not mid-track). */
  justChangedTrack: boolean;
  /** Server reported a newer build than this tab. */
  pendingServerBuild: string | null;
  /** Build id already reloaded for in this tab (sessionStorage). */
  alreadyReloadedFor: string | null;
};

/**
 * True only when a reload will not cut a track mid-play and will not loop.
 * Never reloads while music is playing unless we are at a track-change boundary.
 */
export function shouldReloadForNewBuild(input: HallSafeReloadInput): boolean {
  const pending = normalizeHallAppVersion(input.pendingServerBuild);
  if (!pending) return false;
  const already = normalizeHallAppVersion(input.alreadyReloadedFor);
  if (already && already === pending) return false;
  if (!input.pageVisible) return false;
  if (input.musicPaused) return true;
  return input.justChangedTrack === true;
}

export function readReloadedBuildId(
  storage: Pick<Storage, "getItem"> | null | undefined,
): string | null {
  try {
    return normalizeHallAppVersion(storage?.getItem(HALL_BUILD_RELOAD_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function rememberReloadedBuildId(
  storage: Pick<Storage, "setItem"> | null | undefined,
  buildId: string,
): void {
  const normalized = normalizeHallAppVersion(buildId);
  if (!normalized) return;
  try {
    storage?.setItem(HALL_BUILD_RELOAD_STORAGE_KEY, normalized);
  } catch {
    /* private mode */
  }
}

/** Pick deployCommit first (deploy identity), then Next BUILD_ID. */
export function pickHallBuildId(payload: {
  deployCommit?: unknown;
  buildId?: unknown;
}): string | null {
  return (
    normalizeHallAppVersion(payload.deployCommit) ??
    normalizeHallAppVersion(payload.buildId)
  );
}

type Fetch = typeof fetch;

let cachedClientBuild: { value: string | null; at: number } | null = null;
const CLIENT_BUILD_TTL_MS = 5 * 60_000;

/** Browser: cached /api/health/build → deployCommit or buildId. */
export async function resolveHallClientBuildId(
  f: Fetch = fetch,
  nowMs = Date.now(),
): Promise<string | null> {
  if (cachedClientBuild && nowMs - cachedClientBuild.at < CLIENT_BUILD_TTL_MS) {
    return cachedClientBuild.value;
  }
  try {
    const res = await f("/api/health/build", { cache: "no-store" });
    if (!res.ok) return cachedClientBuild?.value ?? null;
    const json = (await res.json()) as { deployCommit?: unknown; buildId?: unknown };
    const value = pickHallBuildId(json);
    cachedClientBuild = { value, at: nowMs };
    return value;
  } catch {
    return cachedClientBuild?.value ?? null;
  }
}

/** Test helper: clear the client build cache. */
export function resetHallClientBuildCacheForTests(): void {
  cachedClientBuild = null;
}
