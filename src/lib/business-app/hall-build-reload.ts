/**
 * Hall / point device: after a deploy, open tabs keep the old JS until a reload.
 * Heartbeat carries the client build id; the server echoes the current one. A mismatch
 * triggers a reload only when the hall is deliberately silent (visible + paused / idle /
 * no access) – NEVER while music is meant to play, not even at a track boundary: after a
 * reload the browser blocks autoplay without a tap (iPhone, Samsung), so a boundary reload
 * silenced both halls after the 2026-11-10 deploy (t1346u). A playing hall keeps its current
 * JS until the next pause; the owner sees «Устройство на старой версии». A sessionStorage
 * guard prevents reload loops.
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
  /**
   * The hall is deliberately silent: the player status is paused / idle / no_access and the
   * element is not playing. Must come from the controller's intent (see hallMusicSilent),
   * not from audio.paused alone – the element is briefly paused between two tracks.
   */
  musicPaused: boolean;
  /**
   * Legacy (#1200): a track boundary used to allow a reload while playing. Ignored now –
   * kept so older call sites type-check; a boundary is never a reason to reload.
   */
  justChangedTrack?: boolean;
  /** Server reported a newer build than this tab. */
  pendingServerBuild: string | null;
  /** Build id already reloaded for in this tab (sessionStorage). */
  alreadyReloadedFor: string | null;
};

/**
 * True only when a reload cannot stop the music and will not loop.
 * Never reloads while music is meant to play – not mid-track, not at a track boundary.
 */
export function shouldReloadForNewBuild(input: HallSafeReloadInput): boolean {
  const pending = normalizeHallAppVersion(input.pendingServerBuild);
  if (!pending) return false;
  const already = normalizeHallAppVersion(input.alreadyReloadedFor);
  if (already && already === pending) return false;
  if (!input.pageVisible) return false;
  return input.musicPaused === true;
}

export type HallPlayerIntent = {
  /** Controller status: "playing" | "loading" | "paused" | "idle" | "no_access" | "error". */
  status: string | null | undefined;
  /** Controller is auto-recovering (error / stall retry) – music is still meant to play. */
  recovering?: boolean;
};

/**
 * Deliberately silent hall: a reload here cannot stop music. Playing, loading, error
 * (it retries / skips on its own) and any recovery all count as "music is meant to play".
 * The element state is checked too: a paused status with a still-sounding element (fade)
 * is not silent yet.
 */
export function hallMusicSilent(
  ctl: HallPlayerIntent | null | undefined,
  audio: { paused: boolean; ended: boolean } | null | undefined,
): boolean {
  if (!ctl) return !audio || audio.paused || audio.ended;
  if (ctl.recovering === true) return false;
  const status = ctl.status ?? "idle";
  if (status !== "paused" && status !== "idle" && status !== "no_access") return false;
  return !audio || audio.paused || audio.ended;
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

/**
 * Sticky per-tab client build id: captured once from /api/health/build when this
 * JS session first loads. Must NOT refresh from later health polls – after a
 * deploy the server returns the new SHA, and refreshing would hide the mismatch
 * (old JS would claim to be the new build).
 */
let stickyClientBuild: { value: string | null; resolved: boolean } | null = null;

/** Browser: one-shot /api/health/build → deployCommit or buildId for this tab. */
export async function resolveHallClientBuildId(
  f: Fetch = fetch,
): Promise<string | null> {
  if (stickyClientBuild?.resolved) {
    return stickyClientBuild.value;
  }
  try {
    const res = await f("/api/health/build", { cache: "no-store" });
    if (!res.ok) return stickyClientBuild?.value ?? null;
    const json = (await res.json()) as { deployCommit?: unknown; buildId?: unknown };
    const value = pickHallBuildId(json);
    stickyClientBuild = { value, resolved: true };
    return value;
  } catch {
    return stickyClientBuild?.value ?? null;
  }
}

/** Test helper: clear the sticky client build. */
export function resetHallClientBuildCacheForTests(): void {
  stickyClientBuild = null;
}
