"use client";

import { useEffect, useRef } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import { shouldTrackPageView } from "@/lib/analytics/dedup";

type TopicHubViewTrackerProps = {
  path: string;
  /** Platform topics.key when hub is topic-bound; omit for cross-topic hubs */
  topicKey?: string | null;
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

    const properties: Record<string, string | number | boolean> = {
      // Public SEO hub slug – primary dimension for hub reporting.
      topic_slug: hubSlug,
      hub_slug: hubSlug,
      product_count: productCount,
    };

    const normalizedTopicKey = topicKey?.trim();

    if (normalizedTopicKey) {
      properties.topic_key = normalizedTopicKey;
    }

    void trackPlatformEvent({
      sessionId,
      event_name: "topic_page_viewed",
      path,
      properties,
    });
  }, [hubSlug, path, productCount, topicKey]);

  return null;
}
