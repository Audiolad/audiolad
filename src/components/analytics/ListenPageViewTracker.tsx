"use client";

import { useEffect, useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";

type ListenPageViewTrackerProps = {
  practiceId: string;
  path: string;
};

export default function ListenPageViewTracker({
  practiceId,
  path,
}: ListenPageViewTrackerProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) {
      return;
    }

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId || !shouldTrackPageView(`listen:${practiceId}`)) {
      return;
    }

    trackedRef.current = true;

    void trackPlatformEvent({
      sessionId,
      event_name: "listen_page_view",
      path,
      practice_id: practiceId,
    });
  }, [path, practiceId]);

  return null;
}
