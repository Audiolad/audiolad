"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  attributionToApiFields,
  parseTrafficAttributionFromSearchParams,
  resolveTrafficAttribution,
} from "@/lib/analytics/attribution";
import {
  ensureAnalyticsSession,
  setCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";
import { detectClientDeviceType } from "@/lib/analytics/device";
import {
  extractReferrerDomain,
  resolveTrafficSource,
} from "@/lib/analytics/sources";
import {
  readStoredSessionId,
  storeSessionId,
} from "@/lib/analytics/session-storage";

export default function PlatformAnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const initializedRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    const attribution = resolveTrafficAttribution(
      parseTrafficAttributionFromSearchParams(searchParams),
    );
    const referrerDomain =
      extractReferrerDomain(typeof document !== "undefined" ? document.referrer : null) ??
      null;
    const source = resolveTrafficSource({
      utmSource: attribution.utmSource,
      referrerDomain,
    });

    void (async () => {
      const sessionId = await ensureAnalyticsSession({
        sessionId: readStoredSessionId(),
        landingPath: pathname || "/",
        ...attributionToApiFields(attribution),
        referrer_domain: referrerDomain ?? (source === "direct" ? null : source),
        device_type: detectClientDeviceType(),
      });

      if (!sessionId) {
        return;
      }

      storeSessionId(sessionId);
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
  }, [pathname]);

  return children;
}
