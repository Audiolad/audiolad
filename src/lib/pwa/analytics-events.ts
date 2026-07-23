export const PWA_ANALYTICS_EVENTS = [
  "pwa_banner_shown",
  "pwa_install_clicked",
  "pwa_install_prompt_shown",
  "pwa_install_accepted",
  "pwa_install_dismissed",
  "pwa_ios_instructions_opened",
  "pwa_installed",
  "pwa_opened_standalone",
  "pwa_remind_later_clicked",
] as const;

export type PwaAnalyticsEventName = (typeof PWA_ANALYTICS_EVENTS)[number];

const EVENT_NAME_SET = new Set<string>(PWA_ANALYTICS_EVENTS);

export function isPwaAnalyticsEventName(
  value: string,
): value is PwaAnalyticsEventName {
  return EVENT_NAME_SET.has(value);
}

export type PwaAnalyticsEventPayload = {
  event_name: PwaAnalyticsEventName;
  anonymous_session_id?: string | null;
  platform?: string | null;
  source?: string | null;
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

export function sanitizePwaAnalyticsString(
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

const ALLOWED_PLATFORMS = new Set([
  "android",
  "ios",
  "desktop_chromium",
  "desktop_other",
  "unknown",
]);

const ALLOWED_SOURCES = new Set(["banner", "menu", "retention"]);

export function sanitizePwaAnalyticsPayload(
  input: Partial<PwaAnalyticsEventPayload>,
): PwaAnalyticsEventPayload | null {
  if (!input.event_name || !isPwaAnalyticsEventName(input.event_name)) {
    return null;
  }

  const platform = sanitizePwaAnalyticsString(input.platform, 32);
  const source = sanitizePwaAnalyticsString(input.source, 16);

  return {
    event_name: input.event_name,
    anonymous_session_id: sanitizePwaAnalyticsString(
      input.anonymous_session_id ?? getOrCreateAnonymousSessionId(),
      128,
    ),
    platform: platform && ALLOWED_PLATFORMS.has(platform) ? platform : null,
    source: source && ALLOWED_SOURCES.has(source) ? source : null,
  };
}

export function isAllowedAnalyticsEventName(value: string): boolean {
  return value.startsWith("promo_") || isPwaAnalyticsEventName(value);
}
