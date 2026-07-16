"use client";

import {
  getOrCreateAnonymousSessionId,
  sanitizeAnalyticsPosition,
  sanitizeAnalyticsString,
  type PromoAnalyticsEventName,
  type PromoAnalyticsEventPayload,
} from "@/lib/promo/analytics-events";
import type { PromoAttribution } from "@/lib/promo/attribution";

const milestoneSessionPrefix = "audiolad_promo_ms:";

function milestoneKey(
  practiceId: string,
  trackId: string,
  milestone: string,
): string {
  return `${milestoneSessionPrefix}${practiceId}:${trackId}:${milestone}`;
}

export function hasRecordedPromoMilestone(
  practiceId: string,
  trackId: string,
  milestone: string,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(milestoneKey(practiceId, trackId, milestone)) === "1";
  } catch {
    return false;
  }
}

export function markPromoMilestoneRecorded(
  practiceId: string,
  trackId: string,
  milestone: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      milestoneKey(practiceId, trackId, milestone),
      "1",
    );
  } catch {
    // sessionStorage unavailable
  }
}

export async function trackPromoEvent(
  eventName: PromoAnalyticsEventName,
  input: {
    practiceId?: string | null;
    trackId?: string | null;
    attribution?: PromoAttribution | null;
    currentPosition?: number | null;
    duration?: number | null;
  },
): Promise<void> {
  const payload: PromoAnalyticsEventPayload = {
    event_name: eventName,
    practice_id: sanitizeAnalyticsString(input.practiceId, 64),
    track_id: sanitizeAnalyticsString(input.trackId, 64),
    anonymous_session_id: getOrCreateAnonymousSessionId(),
    utm_source: sanitizeAnalyticsString(input.attribution?.utmSource, 128),
    utm_medium: sanitizeAnalyticsString(input.attribution?.utmMedium, 128),
    utm_campaign: sanitizeAnalyticsString(input.attribution?.utmCampaign, 128),
    utm_content: sanitizeAnalyticsString(input.attribution?.utmContent, 128),
    referrer:
      typeof document !== "undefined"
        ? sanitizeAnalyticsString(document.referrer, 512)
        : null,
    current_position: sanitizeAnalyticsPosition(input.currentPosition),
    duration: sanitizeAnalyticsPosition(input.duration),
  };

  try {
    await fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Analytics must not break playback
  }
}

export function trackPromoMilestoneOnce(
  milestone: PromoAnalyticsEventName,
  input: {
    practiceId: string;
    trackId: string;
    attribution?: PromoAttribution | null;
    currentPosition?: number | null;
    duration?: number | null;
  },
): void {
  if (hasRecordedPromoMilestone(input.practiceId, input.trackId, milestone)) {
    return;
  }

  markPromoMilestoneRecorded(input.practiceId, input.trackId, milestone);

  void trackPromoEvent(milestone, input);
}
