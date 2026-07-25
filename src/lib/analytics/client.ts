import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";
import { createClientEventId } from "@/lib/analytics/event-id";
import { getOrCreateAnonymousId } from "@/lib/analytics/identity-storage";
import {
  enqueueAnalyticsRetry,
  flushAnalyticsRetryQueue,
  type AnalyticsRetryItem,
  type AnalyticsRetrySendResult,
} from "@/lib/analytics/retry-queue";
import {
  isSessionStateActive,
  readSessionState,
  writeSessionState,
} from "@/lib/analytics/session-state";
import {
  isYandexMetrikaGoalName,
  sendYandexGoal,
} from "@/lib/analytics/yandex-metrika";

export const CLIENT_VERSION = "p1";

type SessionInitInput = {
  sessionId?: string | null;
  landingPath: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer_domain?: string | null;
  device_type?: string | null;
};

type TrackEventInput = {
  sessionId: string;
  event_name: PlatformAnalyticsEventName;
  path?: string | null;
  practice_id?: string | null;
  audio_item_id?: string | null;
  properties?: Record<string, string | number | boolean | null>;
  /** Optional stable id for idempotent retries of the same physical action. */
  client_event_id?: string | null;
};

export type TrackPlatformEventResult = {
  client_event_id: string;
  accepted: boolean;
};

let cachedSessionId: string | null = null;
let sessionInitPromise: Promise<string | null> | null = null;

type PostJsonResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

async function postJson<T>(url: string, body: unknown): Promise<PostJsonResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });

    const data = (await response.json().catch(() => null)) as T | null;

    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function getUserAgent(): string | null {
  return typeof navigator !== "undefined" ? navigator.userAgent : null;
}

function touchSessionState(): void {
  const state = readSessionState();

  if (!state || !isSessionStateActive(state)) {
    return;
  }

  writeSessionState({
    sessionId: state.sessionId,
    anonymousId: state.anonymousId,
    lastSeenAt: Date.now(),
  });
}

async function sendRetryItem(item: AnalyticsRetryItem): Promise<AnalyticsRetrySendResult> {
  const result = await postJson(item.url, item.body);

  if (result.ok) {
    return { ok: true };
  }

  if (result.status === 0 || result.status === 429 || result.status >= 500) {
    return { ok: false, retry: true };
  }

  return { ok: false, retry: false };
}

export async function ensureAnalyticsSession(
  input: SessionInitInput,
): Promise<string | null> {
  if (sessionInitPromise) {
    return sessionInitPromise;
  }

  const anonymousId = getOrCreateAnonymousId();
  const localState = readSessionState();
  const isLocalStateActive = isSessionStateActive(localState);

  if (isLocalStateActive && localState) {
    cachedSessionId = localState.sessionId;
  }

  sessionInitPromise = (async () => {
    const result = await postJson<{ session_id?: string }>(
      "/api/analytics/session",
      {
        session_id:
          input.sessionId ?? (isLocalStateActive ? localState?.sessionId : null) ?? null,
        anonymous_id: anonymousId,
        landing_path: input.landingPath,
        utm_source: input.utm_source ?? null,
        utm_medium: input.utm_medium ?? null,
        utm_campaign: input.utm_campaign ?? null,
        utm_content: input.utm_content ?? null,
        utm_term: input.utm_term ?? null,
        referrer_domain: input.referrer_domain ?? null,
        device_type: input.device_type ?? null,
        user_agent: getUserAgent(),
        client_version: CLIENT_VERSION,
      },
    );

    const sessionId = result.data?.session_id ?? null;

    if (sessionId) {
      cachedSessionId = sessionId;
      writeSessionState({ sessionId, anonymousId });
    }

    sessionInitPromise = null;
    return sessionId;
  })();

  return sessionInitPromise;
}

export async function linkAnalyticsSessionUser(): Promise<void> {
  const sessionId = cachedSessionId;

  if (!sessionId) {
    return;
  }

  await postJson("/api/analytics/session/link", {
    session_id: sessionId,
    anonymous_id: getOrCreateAnonymousId(),
  });
}

/** Close active identity links for the current authenticated user (call before sign-out). */
export async function unlinkAnalyticsIdentity(): Promise<void> {
  await postJson("/api/analytics/identity/unlink", {});
}

export async function recordPlatformSignupCompleted(): Promise<boolean> {
  const sessionId = cachedSessionId;

  if (!sessionId) {
    return false;
  }

  const result = await postJson<{ recorded?: boolean }>(
    "/api/analytics/signup/complete",
    {
      session_id: sessionId,
      anonymous_id: getOrCreateAnonymousId(),
    },
  );

  const recorded = Boolean(result.data?.recorded);

  if (recorded) {
    sendYandexGoal("signup_completed");
  }

  return recorded;
}

export async function trackPlatformEvent(
  input: TrackEventInput,
): Promise<TrackPlatformEventResult> {
  const anonymousId = getOrCreateAnonymousId();
  const clientEventId =
    typeof input.client_event_id === "string" && input.client_event_id.trim()
      ? input.client_event_id.trim()
      : createClientEventId();

  const body = {
    session_id: input.sessionId,
    anonymous_id: anonymousId,
    event_name: input.event_name,
    path: input.path ?? null,
    practice_id: input.practice_id ?? null,
    audio_item_id: input.audio_item_id ?? null,
    properties: input.properties ?? {},
    client_event_id: clientEventId,
    client_version: CLIENT_VERSION,
  };

  const result = await postJson("/api/analytics/track", body);

  if (
    !result.ok &&
    (result.status === 0 || result.status === 429 || result.status >= 500)
  ) {
    enqueueAnalyticsRetry({
      id: clientEventId,
      url: "/api/analytics/track",
      body,
    });
  }

  touchSessionState();

  if (isYandexMetrikaGoalName(input.event_name)) {
    sendYandexGoal(input.event_name);
  }

  return { client_event_id: clientEventId, accepted: result.ok };
}

export function setCachedAnalyticsSessionId(sessionId: string | null): void {
  cachedSessionId = sessionId;
}

export function getCachedAnalyticsSessionId(): string | null {
  return cachedSessionId;
}

export type CurrentAnalyticsIdentity = {
  sessionId: string;
  anonymousId: string;
};

/**
 * Read current analytics identity for checkout claims.
 * Does not create a session. Returns null when session is missing/expired.
 */
export function getCurrentAnalyticsIdentity(): CurrentAnalyticsIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  const localState = readSessionState();
  if (!isSessionStateActive(localState) || !localState) {
    return null;
  }

  return {
    sessionId: localState.sessionId,
    anonymousId: localState.anonymousId,
  };
}

if (typeof window !== "undefined") {
  void flushAnalyticsRetryQueue(sendRetryItem);

  window.addEventListener("online", () => {
    void flushAnalyticsRetryQueue(sendRetryItem);
  });
}
