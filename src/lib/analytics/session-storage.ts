import { SESSION_STORAGE_KEY } from "@/lib/analytics/constants";

export function readStoredSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function storeSessionId(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // sessionStorage unavailable
  }
}

export function clearStoredSessionId(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable
  }
}
