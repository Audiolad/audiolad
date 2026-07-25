import { SESSION_TIMEOUT_MS } from "@/lib/analytics/constants";
import { readAnonymousId } from "@/lib/analytics/identity-storage";

export const SESSION_STATE_KEY = "audiolad_analytics_session_state";

const BROADCAST_CHANNEL_NAME = "audiolad-analytics-session";

export type AnalyticsSessionState = {
  sessionId: string;
  lastSeenAt: number;
  anonymousId: string;
};

export type SessionStateListener = (state: AnalyticsSessionState | null) => void;

const listeners = new Set<SessionStateListener>();
let broadcastChannel: BroadcastChannel | null = null;
let storageListenerAttached = false;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (broadcastChannel) {
    return broadcastChannel;
  }

  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch {
    broadcastChannel = null;
  }

  return broadcastChannel;
}

function parseSessionState(raw: string | null): AnalyticsSessionState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const sessionId =
      typeof record.sessionId === "string" ? record.sessionId.trim() : "";
    const anonymousId =
      typeof record.anonymousId === "string" ? record.anonymousId.trim() : "";
    const lastSeenAt =
      typeof record.lastSeenAt === "number" && Number.isFinite(record.lastSeenAt)
        ? record.lastSeenAt
        : 0;

    if (!sessionId || !anonymousId) {
      return null;
    }

    return { sessionId, anonymousId, lastSeenAt };
  } catch {
    return null;
  }
}

function notifyListeners(state: AnalyticsSessionState | null): void {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // Analytics listeners must not break UX
    }
  });
}

function ensureStorageListener(): void {
  if (storageListenerAttached || typeof window === "undefined") {
    return;
  }

  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key !== SESSION_STATE_KEY) {
      return;
    }

    notifyListeners(parseSessionState(event.newValue));
  });

  storageListenerAttached = true;
}

function broadcast(state: AnalyticsSessionState | null): void {
  const channel = getBroadcastChannel();

  if (channel) {
    try {
      channel.postMessage(state);
    } catch {
      // Analytics must not break UX
    }
  }

  notifyListeners(state);
}

export function readSessionState(): AnalyticsSessionState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseSessionState(window.localStorage.getItem(SESSION_STATE_KEY));
  } catch {
    return null;
  }
}

export function writeSessionState(
  state: {
    sessionId: string;
    anonymousId: string;
    lastSeenAt?: number;
  },
): AnalyticsSessionState {
  const next: AnalyticsSessionState = {
    sessionId: state.sessionId,
    anonymousId: state.anonymousId,
    lastSeenAt: state.lastSeenAt ?? Date.now(),
  };

  if (typeof window === "undefined") {
    return next;
  }

  try {
    window.localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable
  }

  broadcast(next);
  return next;
}

export function clearSessionState(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SESSION_STATE_KEY);
  } catch {
    // localStorage unavailable
  }

  broadcast(null);
}

export function isSessionStateActive(
  state: AnalyticsSessionState | null,
  now: number = Date.now(),
): boolean {
  if (!state) {
    return false;
  }

  if (now - state.lastSeenAt > SESSION_TIMEOUT_MS) {
    return false;
  }

  const currentAnonymousId = readAnonymousId();

  return Boolean(currentAnonymousId) && currentAnonymousId === state.anonymousId;
}

export function subscribeSessionState(listener: SessionStateListener): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  listeners.add(listener);
  ensureStorageListener();

  const channel = getBroadcastChannel();
  const handleMessage = (event: MessageEvent<AnalyticsSessionState | null>) => {
    listener(event.data ?? null);
  };

  channel?.addEventListener("message", handleMessage);

  return () => {
    listeners.delete(listener);
    channel?.removeEventListener("message", handleMessage);
  };
}
