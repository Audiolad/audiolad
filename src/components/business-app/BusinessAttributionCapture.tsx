"use client";

import { useEffect } from "react";

import {
  BUSINESS_ATTRIBUTION_STORAGE_KEY,
  businessAttributionFromLanding,
} from "@/lib/business-trial-attribution/attribution";

/**
 * Remembers where this tab first landed on coffee/business (task 253821e0, PR 3):
 * ch=max|tg, utm_* and the referrer domain, in sessionStorage only. Nothing is sent
 * until the visitor starts the gift week; no cookie, no fingerprint, no third party.
 */
export default function BusinessAttributionCapture() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(BUSINESS_ATTRIBUTION_STORAGE_KEY) !== null) return;
      const payload = businessAttributionFromLanding(window.location.search, document.referrer);
      sessionStorage.setItem(BUSINESS_ATTRIBUTION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage unavailable */
    }
  }, []);
  return null;
}
