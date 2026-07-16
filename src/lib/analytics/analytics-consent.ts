export const ANALYTICS_COOKIES_STORAGE_KEY = "audiolad_analytics_cookies";

export const ANALYTICS_CONSENT_CHANGED_EVENT = "audiolad:analytics-consent-changed";

export type AnalyticsConsentState = "unknown" | "granted" | "denied";

function normalizeStoredConsent(value: string | null): AnalyticsConsentState {
  if (value === "granted" || value === "denied") {
    return value;
  }

  if (value === "0") {
    return "denied";
  }

  return "unknown";
}

export function readAnalyticsConsent(): AnalyticsConsentState {
  if (typeof window === "undefined") {
    return "unknown";
  }

  return normalizeStoredConsent(
    window.localStorage.getItem(ANALYTICS_COOKIES_STORAGE_KEY),
  );
}

export function isAnalyticsConsentGranted(): boolean {
  return readAnalyticsConsent() === "granted";
}

export function writeAnalyticsConsent(state: "granted" | "denied"): void {
  window.localStorage.setItem(ANALYTICS_COOKIES_STORAGE_KEY, state);
  window.dispatchEvent(
    new CustomEvent(ANALYTICS_CONSENT_CHANGED_EVENT, {
      detail: { state },
    }),
  );
}
