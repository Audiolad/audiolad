/**
 * Mutable listening-context state for ListenAnalyticsTracker.
 * LISTENING_SESSION_GAP_MS is an *inactivity* gap (time since last playing
 * activity), not the age of the current listen since first start.
 *
 * Pending confirmed plays: a real isPlaying=true observed before analytics
 * sessionId exists is remembered and flushed when session becomes ready —
 * even if the user already paused or the program completed (H2).
 */

export type PendingConfirmedPlay = {
  practiceId: string;
  trackId: string;
  /** Path at the moment of confirmed playing (preserved across navigation). */
  path: string;
  /**
   * Listening-context identity (usually listeningStartedAt / first confirmedAt).
   * Distinct contexts of the same track (pause > gap) get distinct pending rows.
   */
  listeningContextId: number;
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
   * Survives pause, track switches, and programCompleted until session flush.
   */
  pendingConfirmedPlays: Map<string, PendingConfirmedPlay>;
};

export function pendingConfirmedPlayKey(
  practiceId: string,
  trackId: string,
  listeningContextId: number,
): string {
  return `${practiceId}:${trackId}:${listeningContextId}`;
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

/**
 * Reset per-track sticky state. Pending confirmed plays are always kept —
 * a real play before session must survive programCompleted and track switches.
 */
export function resetListenTrackerContextState(
  state: ListenTrackerContextState,
): void {
  state.playStarted = false;
  state.completionTracked = false;
  state.listeningStartedAt = null;
  state.listeningSessionKey = null;
  state.lastActivityAt = null;
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
 * Short pause/resume reuses the same listeningContextId; pause > gap opens a new one.
 */
export function notePendingConfirmedPlay(
  state: ListenTrackerContextState,
  input: {
    practiceId: string;
    trackId: string;
    path: string;
    now: number;
  },
): PendingConfirmedPlay {
  if (!state.listeningStartedAt) {
    state.listeningStartedAt = input.now;
  }

  const listeningContextId = state.listeningStartedAt;
  const key = pendingConfirmedPlayKey(
    input.practiceId,
    input.trackId,
    listeningContextId,
  );
  const existing = state.pendingConfirmedPlays.get(key);

  if (existing) {
    noteListenTrackerPlayingActivity(state, input.now);
    return existing;
  }

  const entry: PendingConfirmedPlay = {
    practiceId: input.practiceId,
    trackId: input.trackId,
    path: input.path,
    listeningContextId,
    confirmedAt: input.now,
  };
  state.pendingConfirmedPlays.set(key, entry);
  noteListenTrackerPlayingActivity(state, input.now);
  return entry;
}

export function listPendingConfirmedPlays(
  state: ListenTrackerContextState,
): PendingConfirmedPlay[] {
  return [...state.pendingConfirmedPlays.values()].sort(
    (a, b) => a.confirmedAt - b.confirmedAt,
  );
}

export function clearPendingConfirmedPlay(
  state: ListenTrackerContextState,
  entry: PendingConfirmedPlay,
): void {
  state.pendingConfirmedPlays.delete(
    pendingConfirmedPlayKey(
      entry.practiceId,
      entry.trackId,
      entry.listeningContextId,
    ),
  );
}

export function hasPendingConfirmedPlayForTrack(
  state: ListenTrackerContextState,
  practiceId: string,
  trackId: string,
): boolean {
  for (const entry of state.pendingConfirmedPlays.values()) {
    if (entry.practiceId === practiceId && entry.trackId === trackId) {
      return true;
    }
  }

  return false;
}

/**
 * Decide whether a play-started emission should be attempted for the *current*
 * track after pending flush. Pending flush for other contexts is separate.
 */
export function shouldAttemptPlayStartedEmit(input: {
  trackId: string | null;
  practiceId: string;
  isPlaying: boolean;
  playStarted: boolean;
  sessionId: string | null;
  hasPendingForCurrentTrack: boolean;
}): boolean {
  if (!input.trackId || input.playStarted || !input.sessionId) {
    return false;
  }

  if (input.isPlaying) {
    return true;
  }

  return input.hasPendingForCurrentTrack;
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
