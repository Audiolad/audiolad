"use client";

import { useEffect, useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";

type PracticeViewTrackerProps = {
  practiceId: string;
  path: string;
  productKind?: string | null;
};

export default function PracticeViewTracker({
  practiceId,
  path,
  productKind,
}: PracticeViewTrackerProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) {
      return;
    }

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId || !shouldTrackPageView(`practice:${practiceId}`)) {
      return;
    }

    trackedRef.current = true;

    void trackPlatformEvent({
      sessionId,
      event_name: "practice_view",
      path,
      practice_id: practiceId,
      properties: productKind
        ? {
            product_kind: productKind,
          }
        : undefined,
    });
  }, [path, practiceId, productKind]);

  return null;
}
