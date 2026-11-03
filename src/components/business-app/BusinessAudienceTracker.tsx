"use client";

import { Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import AnalyticsConsentBanner from "@/components/analytics/AnalyticsConsentBanner";
import YandexMetrika from "@/components/analytics/YandexMetrika";
import { useBusinessDomain } from "./BusinessDomainProvider";
import { useBusinessChromeAccess } from "./BusinessAccessLine";
import { usePathname } from "next/navigation";
import { useAnalyticsConsentGranted } from "@/lib/analytics/use-analytics-consent";
import { isBusinessNoAnalyticsRoute } from "@/lib/analytics/yandex-metrika-environment";
import {
  isYandexMetrikaReady,
  sendYandexGoal,
  YANDEX_METRIKA_READY_EVENT,
} from "@/lib/analytics/yandex-metrika";

function subscribeReady(onChange: () => void) {
  window.addEventListener(YANDEX_METRIKA_READY_EVENT, onChange);
  return () => window.removeEventListener(YANDEX_METRIKA_READY_EVENT, onChange);
}

const serverReady = () => false;

const PRIVACY_HREF = "https://audiolad.ru/privacy#section-8";

/** Metrika has no stop API: once tag.js is in this document, its clickmap/link tracking stays on. */
function metrikaLoadedInDocument(): boolean {
  return isYandexMetrikaReady() || Boolean(document.getElementById("yandex-metrika-tag"));
}

/** Reuses the existing counter and consent gate. No account consent is inferred from login. */
export default function BusinessAudienceTracker({ pointDevice }: { pointDevice: boolean }) {
  const domain = useBusinessDomain();
  const access = useBusinessChromeAccess();
  const consent = useAnalyticsConsentGranted();
  const ready = useSyncExternalStore(subscribeReady, isYandexMetrikaReady, serverReady);
  // Memory only: account IDs and period stamps never go into Metrika or browser storage.
  const sent = useRef(new Set<string>());
  const userId = domain.status === "authenticated" ? domain.owner.userId : null;
  const pathname = usePathname();

  // Privacy boundary: entering /documents, /point, /player or /coffee-handoff by SPA navigation
  // after Metrika loaded reloads the document, so these screens never run with an active counter.
  // A fresh load there starts without Metrika; the next allowed page loads it with its own first hit.
  useEffect(() => {
    if (!isBusinessNoAnalyticsRoute(window.location.pathname || pathname)) return;
    if (metrikaLoadedInDocument()) window.location.reload();
  }, [pathname]);

  useEffect(() => {
    if (!userId || pointDevice || !consent || !ready) return;
    const once = (goal: string, period = "") => {
      const key = `${userId}:${goal}:${period}`;
      if (!sent.current.has(key) && sendYandexGoal(goal)) sent.current.add(key);
    };
    once("business_cabinet_signed_in");
    if (access.endsAt) {
      // Also excludes a previously used gift when its live period has ended.
      once("business_access_used_confirmed");
      if (access.mode === "trial") once("business_trial_access_confirmed", access.endsAt);
      if (access.mode === "paid") once("business_paid_access_confirmed", access.endsAt);
    }
  }, [access.endsAt, access.mode, consent, pointDevice, ready, userId]);

  // The root layout deliberately omits BaseProviders on business hosts: no platform identity
  // linker here. The consent prompt is the same approved audiolad.ru banner (per-origin choice).
  if (pointDevice) return null;
  return (
    <>
      <Suspense fallback={null}><YandexMetrika /></Suspense>
      <AnalyticsConsentBanner privacyHref={PRIVACY_HREF} />
    </>
  );
}
