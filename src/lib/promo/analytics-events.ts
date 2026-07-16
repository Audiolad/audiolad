export const PROMO_ANALYTICS_EVENTS = [
  "promo_practice_viewed",
  "promo_practice_play_started",
  "promo_practice_progress_25",
  "promo_practice_progress_50",
  "promo_practice_progress_75",
  "promo_practice_completed",
  "promo_signup_prompt_shown",
  "promo_signup_clicked",
  "promo_signup_completed",
  "promo_practice_saved",
  "promo_gifts_opened",
] as const;

export type PromoAnalyticsEventName =
  (typeof PROMO_ANALYTICS_EVENTS)[number];

const EVENT_NAME_SET = new Set<string>(PROMO_ANALYTICS_EVENTS);

export function isPromoAnalyticsEventName(
  value: string,
): value is PromoAnalyticsEventName {
  return EVENT_NAME_SET.has(value);
}

export type PromoAnalyticsEventPayload = {
  event_name: PromoAnalyticsEventName;
  practice_id?: string | null;
  track_id?: string | null;
  anonymous_session_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  current_position?: number | null;
  duration?: number | null;
};

const ANONYMOUS_ID_KEY = "audiolad_anonymous_id";

function generateAnonymousId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAnonymousSessionId(): string {
  if (typeof window === "undefined") {
    return generateAnonymousId();
  }

  try {
    const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY);

    if (existing?.trim()) {
      return existing.trim();
    }

    const next = generateAnonymousId();
    window.localStorage.setItem(ANONYMOUS_ID_KEY, next);
    return next;
  } catch {
    return generateAnonymousId();
  }
}

export function sanitizeAnalyticsString(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeAnalyticsTrackId(
  value: string | null | undefined,
): string | null {
  const sanitized = sanitizeAnalyticsString(value, 64);

  if (!sanitized || !UUID_PATTERN.test(sanitized)) {
    return null;
  }

  return sanitized;
}

export function sanitizeAnalyticsPosition(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.floor(value);

  if (rounded < 0 || rounded > 86400) {
    return null;
  }

  return rounded;
}
