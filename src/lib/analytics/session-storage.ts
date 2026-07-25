import { getOrCreateAnonymousId } from "@/lib/analytics/identity-storage";
import {
  clearSessionState,
  isSessionStateActive,
  readSessionState,
  writeSessionState,
} from "@/lib/analytics/session-state";

/**
 * @deprecated Session id is now tracked via session-state (localStorage), not
 * sessionStorage. Kept for backward compatibility with existing callers.
 */
export function readStoredSessionId(): string | null {
  const state = readSessionState();

  if (!state || !isSessionStateActive(state)) {
    return null;
  }

  return state.sessionId;
}

/**
 * @deprecated Writes to session-state (localStorage) instead of sessionStorage.
 */
export function storeSessionId(sessionId: string): void {
  writeSessionState({
    sessionId,
    anonymousId: getOrCreateAnonymousId(),
  });
}

/**
 * @deprecated Clears session-state (localStorage) instead of sessionStorage.
 */
export function clearStoredSessionId(): void {
  clearSessionState();
}
