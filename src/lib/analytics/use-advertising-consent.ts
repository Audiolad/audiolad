"use client";

import { useSyncExternalStore } from "react";
import {
  readAdvertisingConsent,
  subscribeAdvertisingConsent,
  type AdvertisingConsentState,
} from "@/lib/analytics/advertising-consent.mjs";

export function useAdvertisingConsent(): AdvertisingConsentState {
  return useSyncExternalStore(
    subscribeAdvertisingConsent,
    readAdvertisingConsent,
    () => "unknown" as AdvertisingConsentState,
  );
}
