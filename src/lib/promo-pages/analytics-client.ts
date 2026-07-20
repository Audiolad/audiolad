"use client";

import {
  getOrCreateAnonymousSessionId,
  sanitizeAnalyticsPosition,
  sanitizeAnalyticsString,
} from "@/lib/promo/analytics-events";
import {
  parsePromoAttributionFromSearchParams,
  resolvePromoAttribution,
  type PromoAttribution,
} from "@/lib/promo/attribution";
import {
  buildPromoPageCtaAnalyticsPayload,
  sanitizePromoPageId,
  type PromoPageAnalyticsEventName,
  type PromoPageCtaAnalyticsMetadata,
} from "@/lib/promo-pages/analytics-events";

const viewedSessionPrefix = "audiolad_promo_page_viewed:";
const playStartedSessionPrefix = "audiolad_promo_page_play:";
const completedSessionPrefix = "audiolad_promo_page_completed:";

function sessionStorageKey(prefix: string, promoPageId: string, suffix = ""): string {
  return `${prefix}${promoPageId}${suffix}`;
}

function hasRecordedPromoPageSessionEvent(key: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markPromoPageSessionEvent(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage unavailable
  }
}

export async function trackPromoPageEvent(
  eventName: PromoPageAnalyticsEventName,
  input: {
    promoPageId: string;
    practiceId?: string | null;
    trackId?: string | null;
    attribution?: PromoAttribution | null;
    currentPosition?: number | null;
    duration?: number | null;
    payload?: Record<string, string>;
  },
): Promise<void> {
  const promoPageId = sanitizePromoPageId(input.promoPageId);

  if (!promoPageId) {
    return;
  }

  const body = {
    event_name: eventName,
    promo_page_id: promoPageId,
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
    payload: input.payload ?? {},
  };

  try {
    await fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Analytics must not break navigation
  }
}

export function trackPromoPageViewedOnce(
  promoPageId: string,
  attribution: PromoAttribution | null,
): void {
  const key = sessionStorageKey(viewedSessionPrefix, promoPageId);

  if (hasRecordedPromoPageSessionEvent(key)) {
    return;
  }

  markPromoPageSessionEvent(key);

  void trackPromoPageEvent("promo_page_viewed", {
    promoPageId,
    attribution,
  });
}

export function trackPromoPagePlayStartedOnce(
  promoPageId: string,
  practiceId: string,
  trackId: string | null,
  attribution: PromoAttribution | null,
): void {
  const key = sessionStorageKey(
    playStartedSessionPrefix,
    promoPageId,
    `:${practiceId}`,
  );

  if (hasRecordedPromoPageSessionEvent(key)) {
    return;
  }

  markPromoPageSessionEvent(key);

  void trackPromoPageEvent("promo_page_play_started", {
    promoPageId,
    practiceId,
    trackId,
    attribution,
  });
}

export function trackPromoPageCompletedOnce(
  promoPageId: string,
  practiceId: string,
  trackId: string | null,
  attribution: PromoAttribution | null,
  duration: number | null,
): void {
  const key = sessionStorageKey(
    completedSessionPrefix,
    promoPageId,
    `:${practiceId}`,
  );

  if (hasRecordedPromoPageSessionEvent(key)) {
    return;
  }

  markPromoPageSessionEvent(key);

  void trackPromoPageEvent("promo_page_completed", {
    promoPageId,
    practiceId,
    trackId,
    attribution,
    duration,
    currentPosition: duration,
  });
}

export function trackPromoPageCtaClicked(
  promoPageId: string,
  metadata: PromoPageCtaAnalyticsMetadata,
  attribution: PromoAttribution | null,
): void {
  void trackPromoPageEvent("promo_page_cta_clicked", {
    promoPageId,
    attribution,
    payload: buildPromoPageCtaAnalyticsPayload(metadata),
  });
}

export function resolvePromoPageAttribution(
  searchParams: Pick<URLSearchParams, "get">,
): PromoAttribution | null {
  return resolvePromoAttribution(
    parsePromoAttributionFromSearchParams(searchParams),
  );
}
