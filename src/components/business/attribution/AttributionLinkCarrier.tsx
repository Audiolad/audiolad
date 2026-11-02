"use client";

import { useEffect } from "react";

import {
  AUDIOLAD_CARRY_STORAGE_KEY,
  BUSINESS_CARRY_PARAMS,
  businessAttributionFromLanding,
  carryBusinessAttribution,
  parseStoredBusinessAttribution,
  type BusinessAttributionPayload,
} from "@/lib/business-trial-attribution/attribution";

/**
 * Bot links land on audiolad.ru/b/atlas-kofeen?ch=max|tg (task 253821e0, PR 3).
 * Links from these pages to coffee/business are another host, so sessionStorage does
 * not follow: on click, ch/utm_* of this tab's first landing are added to the link.
 * Only those parameters, only for coffee/business links; no cookie, nothing is sent.
 */
function carried(): BusinessAttributionPayload {
  try {
    const stored = parseStoredBusinessAttribution(sessionStorage.getItem(AUDIOLAD_CARRY_STORAGE_KEY));
    if (stored) return stored;
    const landing = businessAttributionFromLanding(window.location.search, "");
    const payload: BusinessAttributionPayload = {};
    for (const key of BUSINESS_CARRY_PARAMS) if (landing[key]) payload[key] = landing[key];
    sessionStorage.setItem(AUDIOLAD_CARRY_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return {};
  }
}

export default function AttributionLinkCarrier() {
  useEffect(() => {
    const payload = carried();
    if (Object.keys(payload).length === 0) return;
    const decorate = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      const next = carryBusinessAttribution(target.href, payload, window.location.href);
      if (next) target.href = next;
    };
    document.addEventListener("click", decorate, true);
    document.addEventListener("auxclick", decorate, true);
    return () => {
      document.removeEventListener("click", decorate, true);
      document.removeEventListener("auxclick", decorate, true);
    };
  }, []);
  return null;
}
