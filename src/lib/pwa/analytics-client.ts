"use client";

import { sendYandexGoal } from "@/lib/analytics/yandex-metrika";
import { buildPwaYandexMetrikaParams } from "@/lib/analytics/yandex-metrika-params";
import {
  getOrCreateAnonymousSessionId,
  sanitizePwaAnalyticsPayload,
  type PwaAnalyticsEventName,
} from "@/lib/pwa/analytics-events";
import type { PwaInstallFlowSource } from "@/lib/pwa/types";

const recordedEvents = new Set<string>();

export function hasRecordedPwaAnalyticsEvent(key: string): boolean {
  return recordedEvents.has(key);
}

export function markPwaAnalyticsEventRecorded(key: string): void {
  recordedEvents.add(key);
}

export async function trackPwaEvent(
  eventName: PwaAnalyticsEventName,
  input?: {
    platform?: string | null;
    source?: PwaInstallFlowSource | null;
  },
): Promise<void> {
  const payload = sanitizePwaAnalyticsPayload({
    event_name: eventName,
    anonymous_session_id: getOrCreateAnonymousSessionId(),
    platform: input?.platform ?? null,
    source: input?.source ?? null,
  });

  if (!payload) {
    return;
  }

  try {
    await fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: payload.event_name,
        anonymous_session_id: payload.anonymous_session_id,
        payload: {
          platform: payload.platform,
          source: payload.source,
        },
      }),
      keepalive: true,
    });
  } catch {
    // Analytics must not break UX
  }

  sendYandexGoal(
    payload.event_name,
    buildPwaYandexMetrikaParams({
      platform: payload.platform,
      source: payload.source,
      isStandalone: payload.event_name === "pwa_opened_standalone",
    }),
  );
}

export function trackPwaEventOnce(
  dedupeKey: string,
  eventName: PwaAnalyticsEventName,
  input?: {
    platform?: string | null;
    source?: PwaInstallFlowSource | null;
  },
): void {
  if (hasRecordedPwaAnalyticsEvent(dedupeKey)) {
    return;
  }

  markPwaAnalyticsEventRecorded(dedupeKey);
  void trackPwaEvent(eventName, input);
}

export function resetPwaAnalyticsDedupeForTests(): void {
  recordedEvents.clear();
}
