import {
  sanitizeAnalyticsString,
  sanitizeAnalyticsTrackId,
} from "@/lib/promo/analytics-events";

export const PROMO_PAGE_ANALYTICS_EVENTS = [
  "promo_page_viewed",
  "promo_page_play_started",
  "promo_page_completed",
  "promo_page_cta_clicked",
] as const;

export type PromoPageAnalyticsEventName =
  (typeof PROMO_PAGE_ANALYTICS_EVENTS)[number];

const EVENT_NAME_SET = new Set<string>(PROMO_PAGE_ANALYTICS_EVENTS);

export function isPromoPageAnalyticsEventName(
  value: string,
): value is PromoPageAnalyticsEventName {
  return EVENT_NAME_SET.has(value);
}

export type PromoPageCtaAnalyticsMetadata = {
  position: "after_practices";
  destination_kind: "internal" | "external";
  destination_host: string | null;
  open_mode: "same_tab" | "new_tab";
};

export function sanitizePromoPageAnalyticsPayload(
  payload: Record<string, unknown>,
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const [key, raw] of Object.entries(payload)) {
    if (typeof raw !== "string") {
      continue;
    }

    const sanitized = sanitizeAnalyticsString(raw, 128);

    if (sanitized) {
      next[key] = sanitized;
    }
  }

  return next;
}

export function buildPromoPageCtaAnalyticsPayload(
  input: PromoPageCtaAnalyticsMetadata,
): Record<string, string> {
  return sanitizePromoPageAnalyticsPayload({
    position: input.position,
    destination_kind: input.destination_kind,
    destination_host: input.destination_host,
    open_mode: input.open_mode,
  });
}

export function sanitizePromoPageId(
  value: string | null | undefined,
): string | null {
  return sanitizeAnalyticsTrackId(value);
}
