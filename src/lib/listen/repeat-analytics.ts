import { LISTENING_SESSION_GAP_MS } from "@/lib/analytics/constants";

type ContinuousListenItemState = {
  playStarted: boolean;
  completed: boolean;
};

type ContinuousListenSession = {
  lastActivityAt: number;
  items: Map<string, ContinuousListenItemState>;
};

let continuousSession: ContinuousListenSession | null = null;

function itemKey(practiceId: string, audioItemId: string): string {
  return `${practiceId}:${audioItemId}`;
}

function isSessionExpired(session: ContinuousListenSession, now: number): boolean {
  return now - session.lastActivityAt > LISTENING_SESSION_GAP_MS;
}

function ensureContinuousSession(now: number): ContinuousListenSession {
  if (!continuousSession || isSessionExpired(continuousSession, now)) {
    continuousSession = {
      lastActivityAt: now,
      items: new Map(),
    };
  }

  return continuousSession;
}

function getItemState(
  session: ContinuousListenSession,
  practiceId: string,
  audioItemId: string,
): ContinuousListenItemState {
  const key = itemKey(practiceId, audioItemId);
  const existing = session.items.get(key);

  if (existing) {
    return existing;
  }

  const created = { playStarted: false, completed: false };
  session.items.set(key, created);
  return created;
}

/**
 * Keep a live continuous session alive while audio is actually playing.
 * Mount, pause, stop, and Repeat-button clicks must not call this.
 */
export function touchContinuousListenSessionActivity(now = Date.now()): void {
  if (!continuousSession || isSessionExpired(continuousSession, now)) {
    return;
  }

  continuousSession.lastActivityAt = now;
}

/** First play_started for this item in the continuous session. Later auto-loops return false. */
export function rememberContinuousListenPlayStarted(
  practiceId: string,
  audioItemId: string,
  now = Date.now(),
): boolean {
  const session = ensureContinuousSession(now);
  const state = getItemState(session, practiceId, audioItemId);
  session.lastActivityAt = now;

  if (state.playStarted) {
    return false;
  }

  state.playStarted = true;
  return true;
}

/** First unique completion for this item in the continuous session. Auto-loops return false. */
export function rememberContinuousListenCompleted(
  practiceId: string,
  audioItemId: string,
  now = Date.now(),
): boolean {
  const session = ensureContinuousSession(now);
  const state = getItemState(session, practiceId, audioItemId);
  session.lastActivityAt = now;

  if (state.completed) {
    return false;
  }

  state.completed = true;
  return true;
}

/** Explicit user stop / new player context — not automatic repeat restart. */
export function resetContinuousListenSession(): void {
  continuousSession = null;
}
