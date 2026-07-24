"use client";

import { useEffect, useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";

type ArticleViewTrackerProps = {
  path: string;
  articleSlug: string;
  topicSlug: string;
  practiceSlug: string;
};

export default function ArticleViewTracker({
  path,
  articleSlug,
  topicSlug,
  practiceSlug,
}: ArticleViewTrackerProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) {
      return;
    }

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId || !shouldTrackPageView(`article:${articleSlug}`)) {
      return;
    }

    trackedRef.current = true;

    void trackPlatformEvent({
      sessionId,
      event_name: "article_view",
      path,
      properties: {
        article_slug: articleSlug,
        topic_slug: topicSlug,
        practice_slug: practiceSlug,
      },
    });
  }, [articleSlug, path, practiceSlug, topicSlug]);

  return null;
}
