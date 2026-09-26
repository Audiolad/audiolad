"use client";

import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_PROMO_ANALYTICS_PATH } from "@/lib/max/host";
import { getOrCreateAnonymousSessionId } from "@/lib/promo/analytics-events";
import {
  parsePromoAttributionFromSearchParams,
  resolvePromoAttribution,
  type PromoAttribution,
} from "@/lib/promo/attribution";
import {
  buildPromoPageCtaAnalyticsPayload,
  type PromoPageAnalyticsEventName,
  type PromoPageCtaAnalyticsMetadata,
} from "@/lib/promo-pages/analytics-events";

const VIEWED_PREFIX = "audiolad_max_promo_viewed:";
const PLAY_PREFIX = "audiolad_max_promo_play:";
const COMPLETED_PREFIX = "audiolad_max_promo_completed:";

function attribution(): PromoAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    return resolvePromoAttribution(
      parsePromoAttributionFromSearchParams(new URLSearchParams(window.location.search)),
    );
  } catch {
    return null;
  }
}

function marked(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function mark(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Analytics must not break the promo flow.
  }
}

async function send(
  eventName: PromoPageAnalyticsEventName,
  input: {
    promoPageId: string;
    practiceId?: string | null;
    trackId?: string | null;
    currentPosition?: number | null;
    duration?: number | null;
    payload?: Record<string, string>;
  },
): Promise<void> {
  const initData = readMaxInitData();
  if (!initData) return;

  const source = attribution();
  try {
    await fetch(MAX_PROMO_ANALYTICS_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      keepalive: true,
      body: JSON.stringify({
        initData,
        eventName,
        promoPageId: input.promoPageId,
        practiceId: input.practiceId ?? null,
        trackId: input.trackId ?? null,
        anonymousSessionId: getOrCreateAnonymousSessionId(),
        utmSource: source?.utmSource ?? null,
        utmMedium: source?.utmMedium ?? null,
        utmCampaign: source?.utmCampaign ?? null,
        utmContent: source?.utmContent ?? null,
        referrer: typeof document !== "undefined" ? document.referrer : null,
        currentPosition: input.currentPosition ?? null,
        duration: input.duration ?? null,
        payload: input.payload ?? {},
      }),
    });
  } catch {
    // Analytics is best-effort.
  }
}

export function trackMaxPromoViewedOnce(promoPageId: string): void {
  const key = `${VIEWED_PREFIX}${promoPageId}`;
  if (marked(key)) return;
  mark(key);
  void send("promo_page_viewed", { promoPageId });
}

export function trackMaxPromoPlayStartedOnce(
  promoPageId: string,
  practiceId: string,
  trackId: string | null,
): void {
  const key = `${PLAY_PREFIX}${promoPageId}:${practiceId}`;
  if (marked(key)) return;
  mark(key);
  void send("promo_page_play_started", {
    promoPageId,
    practiceId,
    trackId,
  });
}

export function trackMaxPromoCompletedOnce(
  promoPageId: string,
  practiceId: string,
  trackId: string | null,
  duration: number | null,
): void {
  const key = `${COMPLETED_PREFIX}${promoPageId}:${practiceId}`;
  if (marked(key)) return;
  mark(key);
  void send("promo_page_completed", {
    promoPageId,
    practiceId,
    trackId,
    currentPosition: duration,
    duration,
  });
}

export function trackMaxPromoCtaClicked(
  promoPageId: string,
  metadata: PromoPageCtaAnalyticsMetadata,
): void {
  void send("promo_page_cta_clicked", {
    promoPageId,
    payload: buildPromoPageCtaAnalyticsPayload(metadata),
  });
}
