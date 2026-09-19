/**
 * Mutable *local* listening-context state for ListenAnalyticsTracker.
 * LISTENING_SESSION_GAP_MS is an *inactivity* gap (time since last playing
 * activity), not the age of the current listen since first start.
 *
 * H2 pending confirmed plays live in pending-confirmed-plays-store (stable
 * across GlobalPlayerEngine remount). This module only owns per-instance sticky
 * state: playStarted, progress anchors, lastActivityAt.
 */

import {
  getPendingConfirmedPlaysStore,
  type PendingConfirmedPlay,
  type PendingConfirmedPlaysStore,
} from "@/lib/analytics/pending-confirmed-plays-store";

export type { PendingConfirmedPlay } from "@/lib/analytics/pending-confirmed-plays-store";
export {
  createPendingConfirmedPlaysStore,
  getPendingConfirmedPlaysStore,
  pendingConfirmedPlayKey,
  resetPendingConfirmedPlaysStoreForTests,
} from "@/lib/analytics/pending-confirmed-plays-store";

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

/**
 * Reset per-track sticky state for this tracker instance.
 * Does not touch the stable pending store (H2 remount survival).
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
 * a new listening context. Pending store entries are preserved.
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
 * Record confirmed playing into the stable pending store while session is absent.
 * Short pause/resume reuses listeningContextId; pause > gap opens a new one.
 */
export function notePendingConfirmedPlay(
  state: ListenTrackerContextState,
  input: {
    practiceId: string;
    trackId: string;
    path: string;
    now: number;
  },
  store: PendingConfirmedPlaysStore = getPendingConfirmedPlaysStore(),
): PendingConfirmedPlay {
  if (!state.listeningStartedAt) {
    state.listeningStartedAt = input.now;
  }

  const entry = store.note({
    practiceId: input.practiceId,
    trackId: input.trackId,
    path: input.path,
    listeningContextId: state.listeningStartedAt,
    now: input.now,
  });
  noteListenTrackerPlayingActivity(state, input.now);
  return entry;
}

export function listPendingConfirmedPlays(
  store: PendingConfirmedPlaysStore = getPendingConfirmedPlaysStore(),
): PendingConfirmedPlay[] {
  return store.list();
}

export function clearPendingConfirmedPlay(
  entry: PendingConfirmedPlay,
  store: PendingConfirmedPlaysStore = getPendingConfirmedPlaysStore(),
): void {
  store.clear(entry);
}

export function hasPendingConfirmedPlayForTrack(
  practiceId: string,
  trackId: string,
  store: PendingConfirmedPlaysStore = getPendingConfirmedPlaysStore(),
): boolean {
  return store.hasForTrack(practiceId, trackId);
}

/**
 * Decide whether a play-started emission should be attempted for the *current*
 * track after pending flush.
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
