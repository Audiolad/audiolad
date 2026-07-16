"use client";

import { useSyncExternalStore } from "react";

import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  type AnalyticsConsentState,
  isAnalyticsConsentGranted,
  readAnalyticsConsent,
} from "@/lib/analytics/analytics-consent";

function subscribe(onStoreChange: () => void) {
  const handler = () => onStoreChange();

  window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useAnalyticsConsent(): AnalyticsConsentState {
  return useSyncExternalStore(
    subscribe,
    () => readAnalyticsConsent(),
    () => "unknown" as AnalyticsConsentState,
  );
}

export function useAnalyticsConsentGranted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isAnalyticsConsentGranted(),
    () => false,
  );
}
