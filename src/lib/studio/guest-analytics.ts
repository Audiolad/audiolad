"use client";

import {
  ensureAnalyticsSession,
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";

type GuestAnalyticsProperties = Record<string, string | number | boolean | null>;

const GUEST_EVENTS = new Set<PlatformAnalyticsEventName>([
  "guest_studio_open",
  "guest_project_created",
  "guest_render_started",
  "guest_render_completed",
  "guest_mp3_downloaded",
  "guest_registration_gate_shown",
  "guest_auth_cta_clicked",
]);

export async function trackGuestStudioEvent(
  eventName: PlatformAnalyticsEventName,
  path: string,
  properties: GuestAnalyticsProperties = {},
): Promise<void> {
  if (!GUEST_EVENTS.has(eventName)) return;
  let sessionId = getCachedAnalyticsSessionId();
  if (!sessionId) {
    sessionId = await ensureAnalyticsSession({ landingPath: path });
  }
  if (!sessionId) return;
  void trackPlatformEvent({
    sessionId,
    event_name: eventName,
    path,
    properties,
  });
}
