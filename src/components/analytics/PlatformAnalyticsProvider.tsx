"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  attributionToApiFields,
  hasTrafficAttribution,
  mergeTrafficAttribution,
  parseTrafficAttributionFromSearchParams,
  readStoredTrafficAttribution,
  storeTrafficAttribution,
} from "@/lib/analytics/attribution";
import {
  ensureAnalyticsSession,
  setCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";
import { detectClientDeviceType } from "@/lib/analytics/device";
import {
  isSessionStateActive,
  readSessionState,
} from "@/lib/analytics/session-state";
import { whenDocumentPresentForAnalytics } from "@/lib/analytics/page-presence";
import { extractReferrerDomain } from "@/lib/analytics/sources";

export default function PlatformAnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const initializedRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runAnalytics = () => {
      if (cancelled) {
        return;
      }

      const searchParams = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );
      // Session-touch: URL UTM only. Do not merge localStorage first-touch into
      // new analytics_sessions (P3.2.0). Client first-touch cache may still update
      // for a future first-touch model, but never as session payload.
      const urlAttribution = parseTrafficAttributionFromSearchParams(searchParams);
      if (hasTrafficAttribution(urlAttribution)) {
        storeTrafficAttribution(
          mergeTrafficAttribution(urlAttribution, readStoredTrafficAttribution()),
        );
      }
      const referrerDomain =
        extractReferrerDomain(typeof document !== "undefined" ? document.referrer : null) ??
        null;

      void (async () => {
        const localState = readSessionState();
        const storedSessionId = isSessionStateActive(localState)
          ? localState?.sessionId ?? null
          : null;

        if (storedSessionId) {
          setCachedAnalyticsSessionId(storedSessionId);
        }

        const sessionId = await ensureAnalyticsSession({
          sessionId: storedSessionId,
          landingPath: pathname || "/",
          ...attributionToApiFields(urlAttribution),
          referrer_domain: referrerDomain,
          device_type: detectClientDeviceType(),
        });

        if (!sessionId || cancelled) {
          return;
        }

        setCachedAnalyticsSessionId(sessionId);
        initializedRef.current = true;

        const path = pathname || "/";

        if (shouldTrackPageView(path) && lastPathRef.current !== path) {
          lastPathRef.current = path;
          await trackPlatformEvent({
            sessionId,
            event_name: "page_view",
            path,
          });
        }
      })();
    };

    let cancelScheduled: () => void = () => {};
    const scheduleAnalytics = () => {
      if (cancelled) {
        return;
      }
      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(runAnalytics, { timeout: 4000 });
        cancelScheduled = () => window.cancelIdleCallback(idleId);
        return;
      }
      const timeoutId = window.setTimeout(runAnalytics, 2000);
      cancelScheduled = () => window.clearTimeout(timeoutId);
    };

    // t1508u: prerendered or background-opened pages (search prefetch) must not
    // open an analytics session until a person can see the page.
    const cancelPresenceWait = whenDocumentPresentForAnalytics(
      typeof document !== "undefined" ? document : null,
      scheduleAnalytics,
    );

    return () => {
      cancelled = true;
      cancelPresenceWait();
      cancelScheduled();
    };
  }, [pathname]);

  return children;
}
