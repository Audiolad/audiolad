"use client";

import { useEffect, useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";

type TopicHubViewTrackerProps = {
  path: string;
  topicKey: string;
  hubSlug: string;
  productCount: number;
};

export default function TopicHubViewTracker({
  path,
  topicKey,
  hubSlug,
  productCount,
}: TopicHubViewTrackerProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) {
      return;
    }

    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId || !shouldTrackPageView(`topic_hub:${hubSlug}`)) {
      return;
    }

    trackedRef.current = true;

    void trackPlatformEvent({
      sessionId,
      event_name: "topic_page_viewed",
      path,
      properties: {
        topic_key: topicKey,
        hub_slug: hubSlug,
        product_count: productCount,
      },
    });
  }, [hubSlug, path, productCount, topicKey]);

  return null;
}
