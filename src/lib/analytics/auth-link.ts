export const ANALYTICS_SESSION_LINK_DONE_KEY =
  "audiolad_analytics_session_user_linked";
export const ANALYTICS_SIGNUP_DONE_KEY = "audiolad_analytics_signup_completed";
export const ANALYTICS_AUTH_LINK_FAILURE_COOLDOWN_MS = 15_000;

export function buildAnalyticsLinkDedupeKey(
  sessionId: string,
  anonymousId: string,
): string {
  return `${sessionId}:${anonymousId}`;
}

export function shouldLinkAnalyticsSessionOnAuthEvent(event: string): boolean {
  return event === "SIGNED_IN" || event === "INITIAL_SESSION";
}

export function shouldRecordSignupCompletedOnAuthEvent(event: string): boolean {
  return event === "SIGNED_IN";
}

export function shouldSkipCompletedAnalyticsCall(
  storedKey: string | null | undefined,
  currentKey: string,
): boolean {
  return Boolean(storedKey) && storedKey === currentKey;
}

export function shouldSkipAnalyticsCallForCooldown(
  lastFailureAt: number | null | undefined,
  now: number,
  cooldownMs: number = ANALYTICS_AUTH_LINK_FAILURE_COOLDOWN_MS,
): boolean {
  return (
    typeof lastFailureAt === "number" &&
    Number.isFinite(lastFailureAt) &&
    now - lastFailureAt < cooldownMs
  );
}

export function readAnalyticsLocalFlag(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeAnalyticsLocalFlag(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Analytics must not break UX when storage is unavailable.
  }
}
