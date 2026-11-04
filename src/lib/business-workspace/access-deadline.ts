import {
  workspacePlaybackAllowed,
  workspacePlaybackDeadline,
  workspacePlayerOpen,
  type WorkspacePageModel,
} from "./model";

export const ACCESS_REFRESH_MS = 5 * 60_000;
export const ACCESS_BEFORE_MS = 60_000;
export const ACCESS_MIN_CHECK_MS = 10_000;
// Buffered audio may continue through a failed status check for at most 15 minutes
// after the REAL access deadline. This never grants a URL: signing stays server-side.
export const ACCESS_TOLERANCE_MS = 15 * 60_000;
export const ACCESS_REQUEST_TIMEOUT_MS = 15_000;

export function workspaceControllerKey(model: Pick<WorkspacePageModel, "spaceId" | "tracks">): string {
  return `${model.spaceId}|${model.tracks.map((track) => track.audioItemId).join(",")}`;
}

/** Engine backstop, not the access decision: leave time for server verification/retries. */
export function workspaceAudioDeadline(model: WorkspacePageModel): string | null {
  const deadline = workspacePlaybackDeadline(model);
  const end = deadline ? Date.parse(deadline) : NaN;
  return Number.isFinite(end) ? new Date(end + ACCESS_TOLERANCE_MS).toISOString() : null;
}

type Deps = {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  fetchStatus: () => Promise<WorkspacePageModel>;
  onStatus: (model: WorkspacePageModel) => void;
  onExpired: () => void;
};

/** One instance per persistent player/space, shared with the workspace through context. */
export function createAccessDeadline(initial: WorkspacePageModel, d: Deps) {
  let model = initial;
  let timer: unknown = null;
  let inFlight: Promise<void> | null = null;
  let lastCheck = -Infinity;
  let retryAt = Infinity;
  let failures = 0;
  let revision = 0;
  let needsConfirmation = false;
  let conflictKey: string | null = null;
  let stopped = false;
  let disposed = false;
  const missingDeadlineAt = d.now();
  const end = () => {
    const raw = workspacePlaybackDeadline(model);
    const value = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(value) ? value : missingDeadlineAt;
  };
  const expire = () => {
    if (stopped || disposed) return;
    stopped = true;
    if (timer !== null) d.clearTimer(timer);
    timer = null;
    d.onExpired();
  };
  const arm = () => {
    if (timer !== null) d.clearTimer(timer);
    if (disposed || stopped) return;
    const now = d.now();
    const deadline = end();
    const before = deadline - ACCESS_BEFORE_MS;
    let next = inFlight ? deadline + ACCESS_TOLERANCE_MS : lastCheck + ACCESS_REFRESH_MS;
    if (!inFlight && now < before) next = Math.min(next, before);
    if (!inFlight && now < deadline) next = Math.min(next, deadline);
    if (!inFlight) next = Math.min(next, retryAt);
    next = Math.max(next, lastCheck + ACCESS_MIN_CHECK_MS);
    // A successful focus/online check just before expiry cannot delay the
    // mandatory server check across the deadline. Failed checks retain backoff.
    if (!inFlight && failures === 0 && lastCheck < deadline) next = Math.min(next, deadline);
    if (!inFlight && needsConfirmation && failures === 0) next = now;
    if (!inFlight && failures > 0) next = Math.max(next, retryAt);
    // A hung request must not bypass the bounded offline tolerance.
    next = Math.min(next, deadline + ACCESS_TOLERANCE_MS);
    timer = d.setTimer(() => {
      timer = null;
      if (d.now() >= end() + ACCESS_TOLERANCE_MS) return expire();
      void refresh();
    }, Math.max(0, Math.min(next - now, 2 ** 31 - 1)));
  };
  const failed = () => {
    if (d.now() >= end() + ACCESS_TOLERANCE_MS) return expire();
    retryAt = d.now() + Math.min(10_000 * 2 ** Math.min(failures++, 3), 60_000);
  };
  const validate = (next: WorkspacePageModel) => {
    // A 200/unavailable model represents a backend outage, not confirmed expiry.
    if (next.status === "unavailable") throw new Error("access_unavailable");
    if (next.spaceId !== model.spaceId) throw new Error("access_space_mismatch");
    if (!workspacePlayerOpen(next)) return;
    const deadline = workspacePlaybackDeadline(next);
    if (!deadline || !Number.isFinite(Date.parse(deadline))) throw new Error("access_invalid_deadline");
  };
  const conflicts = (next: WorkspacePageModel) => !workspacePlayerOpen(next) ||
    Date.parse(workspacePlaybackDeadline(next) ?? "") < end() ||
    !workspacePlaybackAllowed(workspacePlaybackDeadline(next), d.now());
  const confirm = (next: WorkspacePageModel) => {
    const key = `${next.status}|${next.spaceEnabled}|${workspacePlaybackDeadline(next)}`;
    if (needsConfirmation && conflictKey === key) return;
    needsConfirmation = true;
    conflictKey = key;
    revision++;
    failures = 0;
    retryAt = Infinity;
  };
  const accept = (next: WorkspacePageModel) => {
    model = next;
    needsConfirmation = false;
    conflictKey = null;
    failures = 0;
    retryAt = Infinity;
  };
  const refresh = (): Promise<void> => {
    if (disposed || stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    const now = d.now();
    const crossingDeadline = lastCheck < end() && now >= end();
    if ((failures > 0 && now < retryAt) || (!needsConfirmation && !crossingDeadline && now - lastCheck < ACCESS_MIN_CHECK_MS)) {
      arm();
      return Promise.resolve();
    }
    lastCheck = d.now();
    const requestRevision = revision;
    const confirmsConflict = needsConfirmation;
    let requestStarted = now;
    inFlight = Promise.resolve().then(() => {
      requestStarted = d.now();
      return d.fetchStatus();
    }).then((next) => {
      if (disposed || stopped || requestRevision !== revision) return;
      validate(next);
      if (conflicts(next)) {
        // A snapshot taken before expiry/conflict cannot confirm a later loss of
        // access. Keep the accepted window until a request begun afterwards answers.
        const elapsed = d.now() >= end();
        if ((!confirmsConflict && !(elapsed && requestStarted >= end())) ||
          (elapsed && requestStarted < end())) {
          confirm(next);
          return;
        }
        if (!workspacePlayerOpen(next) ||
          !workspacePlaybackAllowed(workspacePlaybackDeadline(next), d.now())) return expire();
      }
      accept(next);
      d.onStatus(next);
    }).catch(() => {
      if (disposed || stopped || requestRevision !== revision) return;
      // 10, 20, 40, then 60 seconds, also respected by focus/online events.
      failed();
    }).finally(() => {
      inFlight = null;
      if (!disposed && !stopped && needsConfirmation && failures === 0) void refresh();
      else arm();
    });
    // Also arm the tolerance watchdog while the request is unresolved.
    arm();
    return inFlight;
  };
  arm();
  return {
    refresh,
    allowsPlayback: () => !disposed && !stopped && workspacePlayerOpen(model) && d.now() < end() + ACCESS_TOLERANCE_MS,
    update(next: WorkspacePageModel) {
      if (disposed || stopped) return false;
      try {
        validate(next);
        if (conflicts(next)) {
          // Navigation can arrive out of order. Deduplicate conflicts and verify
          // through the status endpoint before either stopping or shortening access.
          confirm(next);
          void refresh();
          return false;
        }
        // Preserve the revision guard: payment supersedes older pending outcomes.
        revision++;
        accept(next);
      } catch {
        revision++;
        failed();
        arm();
        return false;
      }
      arm();
      return !stopped;
    },
    dispose() {
      disposed = true;
      if (timer !== null) d.clearTimer(timer);
    },
  };
}

/** Same endpoint resolves account/guest and paired al-point sessions on the server. */
export async function fetchWorkspaceAccess(spaceId: string): Promise<WorkspacePageModel> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ACCESS_REQUEST_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ space: spaceId });
    const res = await fetch(`/api/business/workspace/state?${params.toString()}`, {
      credentials: "same-origin", cache: "no-store", signal: ac.signal,
    });
    if (!res.ok) throw new Error("access_network");
    const json = await res.json() as { ok?: boolean; model?: WorkspacePageModel };
    if (json.ok !== true || !json.model || typeof json.model.spaceEnabled !== "boolean" ||
      !["anonymous", "unconfirmed", "unavailable", "trial", "paid", "grace", "offer"].includes(json.model.status)) {
      throw new Error("access_invalid_response");
    }
    return json.model;
  } finally {
    clearTimeout(timer);
  }
}
