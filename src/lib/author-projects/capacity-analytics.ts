"use client";

import {
  ensureAnalyticsSession,
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";

type CapacityAnalyticsProperties = Record<
  string,
  string | number | boolean | null
>;

const CAPACITY_EVENTS = new Set<PlatformAnalyticsEventName>([
  "author_project_create_clicked",
  "author_project_capacity_offer_viewed",
  "author_project_capacity_package_selected",
  "author_project_capacity_checkout_started",
  "author_project_capacity_purchase_succeeded",
  "author_project_capacity_purchase_failed",
]);

export async function trackAuthorProjectCapacityEvent(
  eventName: PlatformAnalyticsEventName,
  properties: CapacityAnalyticsProperties = {},
  path = "/author-dashboard",
): Promise<void> {
  if (!CAPACITY_EVENTS.has(eventName)) {
    return;
  }

  let sessionId = getCachedAnalyticsSessionId();
  if (!sessionId) {
    sessionId = await ensureAnalyticsSession({ landingPath: path });
  }
  if (!sessionId) {
    return;
  }

  void trackPlatformEvent({
    sessionId,
    event_name: eventName,
    path,
    properties,
  });
}
