/**
 * Mutable listening-context state for ListenAnalyticsTracker.
 * LISTENING_SESSION_GAP_MS is an *inactivity* gap (time since last playing
 * activity), not the age of the current listen since first start.
 *
 * Pending confirmed plays: a real isPlaying=true observed before analytics
 * sessionId exists is remembered and flushed when session becomes ready —
 * even if the user already paused (H2).
 */

export type PendingConfirmedPlay = {
  practiceId: string;
  trackId: string;
  confirmedAt: number;
};

export type ListenTrackerContextState = {
  playStarted: boolean;
  completionTracked: boolean;
  listeningStartedAt: number | null;
  listeningSessionKey: string | null;
  /** Last moment audio was actually playing (progress tick or start emit). */
  lastActivityAt: number | null;
  /**
   * Confirmed plays (isPlaying=true) that happened before sessionId.
   * Survives pause and track switches so A is not lost / not attributed to B.
   */
  pendingConfirmedPlays: Map<string, PendingConfirmedPlay>;
};

function pendingKey(practiceId: string, trackId: string): string {
  return `${practiceId}:${trackId}`;
}

export function createListenTrackerContextState(): ListenTrackerContextState {
  return {
    playStarted: false,
    completionTracked: false,
    listeningStartedAt: null,
    listeningSessionKey: null,
    lastActivityAt: null,
    pendingConfirmedPlays: new Map(),
  };
}

/** Reset per-track sticky state. Pending confirmed plays are kept by default (H2). */
export function resetListenTrackerContextState(
  state: ListenTrackerContextState,
  options?: { clearPending?: boolean },
): void {
  state.playStarted = false;
  state.completionTracked = false;
  state.listeningStartedAt = null;
  state.listeningSessionKey = null;
  state.lastActivityAt = null;

  if (options?.clearPending) {
    state.pendingConfirmedPlays.clear();
  }
}

/** True when the listening context broke due to inactivity (pause/stop gap). */
export function isListeningContextInactive(
  lastActivityAt: number | null,
  now: number,
  gapMs: number,
): boolean {
  if (lastActivityAt == null) {
    return false;
  }

  return now - lastActivityAt > gapMs;
}

/**
 * If inactivity exceeded the gap, clear local sticky state so the next play is
 * a new listening context. Pending confirmed plays are preserved for H2 flush.
 */
export function expireListenTrackerContextIfInactive(
  state: ListenTrackerContextState,
  now: number,
  gapMs: number,
): boolean {
  if (!isListeningContextInactive(state.lastActivityAt, now, gapMs)) {
    return false;
  }

  resetListenTrackerContextState(state);
  return true;
}

export function noteListenTrackerPlayingActivity(
  state: ListenTrackerContextState,
  now: number,
): void {
  state.lastActivityAt = now;
}

/**
 * Record that this practice/track actually reached confirmed playing while the
 * analytics session was not ready yet. Intent / play() promise must not call this.
 */
export function notePendingConfirmedPlay(
  state: ListenTrackerContextState,
  practiceId: string,
  trackId: string,
  now: number,
): void {
  const key = pendingKey(practiceId, trackId);

  if (state.pendingConfirmedPlays.has(key)) {
    noteListenTrackerPlayingActivity(state, now);
    return;
  }

  state.pendingConfirmedPlays.set(key, {
    practiceId,
    trackId,
    confirmedAt: now,
  });
  noteListenTrackerPlayingActivity(state, now);
}

export function listPendingConfirmedPlays(
  state: ListenTrackerContextState,
): PendingConfirmedPlay[] {
  return [...state.pendingConfirmedPlays.values()];
}

export function clearPendingConfirmedPlay(
  state: ListenTrackerContextState,
  practiceId: string,
  trackId: string,
): void {
  state.pendingConfirmedPlays.delete(pendingKey(practiceId, trackId));
}

export function clearAllPendingConfirmedPlays(
  state: ListenTrackerContextState,
): void {
  state.pendingConfirmedPlays.clear();
}

/**
 * Decide whether a play-started emission should be attempted for the *current*
 * track. Pending flush for other tracks is handled separately.
 */
export function shouldAttemptPlayStartedEmit(input: {
  trackId: string | null;
  practiceId: string;
  isPlaying: boolean;
  playStarted: boolean;
  sessionId: string | null;
  pendingConfirmedPlays: Map<string, PendingConfirmedPlay>;
}): boolean {
  if (!input.trackId || input.playStarted || !input.sessionId) {
    return false;
  }

  if (input.isPlaying) {
    return true;
  }

  // Session arrived after a confirmed play that already paused.
  return input.pendingConfirmedPlays.has(
    pendingKey(input.practiceId, input.trackId),
  );
}

/** True when we should remember a pending confirmed play (no session yet). */
export function shouldRecordPendingConfirmedPlay(input: {
  trackId: string | null;
  isPlaying: boolean;
  playStarted: boolean;
  sessionId: string | null;
}): boolean {
  return Boolean(
    input.trackId && input.isPlaying && !input.playStarted && !input.sessionId,
  );
}
