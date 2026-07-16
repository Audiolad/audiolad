import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";
import { getOrCreateAnonymousSessionId } from "@/lib/promo/analytics-events";

type SessionInitInput = {
  sessionId?: string | null;
  landingPath: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
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
};

let cachedSessionId: string | null = null;
let sessionInitPromise: Promise<string | null> | null = null;

async function postJson<T>(
  url: string,
  body: unknown,
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function ensureAnalyticsSession(
  input: SessionInitInput,
): Promise<string | null> {
  if (cachedSessionId) {
    return cachedSessionId;
  }

  if (sessionInitPromise) {
    return sessionInitPromise;
  }

  sessionInitPromise = (async () => {
    const anonymousId = getOrCreateAnonymousSessionId();

    const result = await postJson<{ session_id?: string }>(
      "/api/analytics/session",
      {
        session_id: input.sessionId ?? null,
        anonymous_id: anonymousId,
        landing_path: input.landingPath,
        utm_source: input.utm_source ?? null,
        utm_medium: input.utm_medium ?? null,
        utm_campaign: input.utm_campaign ?? null,
        utm_content: input.utm_content ?? null,
        referrer_domain: input.referrer_domain ?? null,
        device_type: input.device_type ?? null,
      },
    );

    const sessionId = result?.session_id ?? null;

    if (sessionId) {
      cachedSessionId = sessionId;
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
    anonymous_id: getOrCreateAnonymousSessionId(),
  });
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
      anonymous_id: getOrCreateAnonymousSessionId(),
    },
  );

  return Boolean(result?.recorded);
}

export async function trackPlatformEvent(input: TrackEventInput): Promise<void> {
  const anonymousId = getOrCreateAnonymousSessionId();

  void postJson("/api/analytics/track", {
    session_id: input.sessionId,
    anonymous_id: anonymousId,
    event_name: input.event_name,
    path: input.path ?? null,
    practice_id: input.practice_id ?? null,
    audio_item_id: input.audio_item_id ?? null,
    properties: input.properties ?? {},
  });
}

export function setCachedAnalyticsSessionId(sessionId: string | null): void {
  cachedSessionId = sessionId;
}

export function getCachedAnalyticsSessionId(): string | null {
  return cachedSessionId;
}
