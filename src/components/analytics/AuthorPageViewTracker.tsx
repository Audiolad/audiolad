"use client";

import { useEffect, useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";

type AuthorPageViewTrackerProps = {
  authorId: string;
  path: string;
};

export default function AuthorPageViewTracker({
  authorId,
  path,
}: AuthorPageViewTrackerProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) {
      return;
    }

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId || !shouldTrackPageView(`author:${authorId}`)) {
      return;
    }

    trackedRef.current = true;

    void trackPlatformEvent({
      sessionId,
      event_name: "author_page_view",
      path,
      author_id: authorId,
    });
  }, [authorId, path]);

  return null;
}
