import { LISTENING_SESSION_GAP_MS } from "@/lib/analytics/constants";

type ContinuousListenItemState = {
  playStarted: boolean;
  completed: boolean;
};

type ContinuousListenSession = {
  startedAt: number;
  items: Map<string, ContinuousListenItemState>;
};

let continuousSession: ContinuousListenSession | null = null;

function itemKey(practiceId: string, audioItemId: string): string {
  return `${practiceId}:${audioItemId}`;
}

function ensureContinuousSession(now = Date.now()): ContinuousListenSession {
  if (
    !continuousSession ||
    now - continuousSession.startedAt > LISTENING_SESSION_GAP_MS
  ) {
    continuousSession = {
      startedAt: now,
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

/** First play_started for this item in the continuous session. Later auto-loops return false. */
export function rememberContinuousListenPlayStarted(
  practiceId: string,
  audioItemId: string,
): boolean {
  const session = ensureContinuousSession();
  const state = getItemState(session, practiceId, audioItemId);

  if (state.playStarted) {
    return false;
  }

  state.playStarted = true;
  session.startedAt = Date.now();
  return true;
}

/** First unique completion for this item in the continuous session. Auto-loops return false. */
export function rememberContinuousListenCompleted(
  practiceId: string,
  audioItemId: string,
): boolean {
  const session = ensureContinuousSession();
  const state = getItemState(session, practiceId, audioItemId);

  if (state.completed) {
    return false;
  }

  state.completed = true;
  session.startedAt = Date.now();
  return true;
}

/** Explicit user stop / new player context — not automatic repeat restart. */
export function resetContinuousListenSession(): void {
  continuousSession = null;
}
