/**
 * Mutable listening-context state for ListenAnalyticsTracker.
 * LISTENING_SESSION_GAP_MS is an *inactivity* gap (time since last playing
 * activity), not the age of the current listen since first start.
 */

export type ListenTrackerContextState = {
  playStarted: boolean;
  completionTracked: boolean;
  listeningStartedAt: number | null;
  listeningSessionKey: string | null;
  /** Last moment audio was actually playing (progress tick or start emit). */
  lastActivityAt: number | null;
};

export function createListenTrackerContextState(): ListenTrackerContextState {
  return {
    playStarted: false,
    completionTracked: false,
    listeningStartedAt: null,
    listeningSessionKey: null,
    lastActivityAt: null,
  };
}

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
 * If inactivity exceeded the gap, clear local tracker sticky state so the next
 * play is a new listening context. Returns true when a reset happened.
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
 * Decide whether a play-started emission should be attempted for this tick.
 * Does not consult continuous-session dedupe or analytics session readiness.
 */
export function shouldAttemptPlayStartedEmit(input: {
  trackId: string | null;
  isPlaying: boolean;
  playStarted: boolean;
  sessionId: string | null;
}): boolean {
  return Boolean(
    input.trackId && input.isPlaying && !input.playStarted && input.sessionId,
  );
}
