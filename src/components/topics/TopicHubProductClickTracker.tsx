"use client";

import type { ReactNode } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";

type TopicHubProductClickTrackerProps = {
  topicKey?: string | null;
  hubSlug: string;
  practiceId: string;
  path: string;
  children: ReactNode;
  className?: string;
};

export default function TopicHubProductClickTracker({
  topicKey,
  hubSlug,
  practiceId,
  path,
  children,
  className,
}: TopicHubProductClickTrackerProps) {
  return (
    <div
      className={className}
      onClickCapture={() => {
        const sessionId = getCachedAnalyticsSessionId();

        if (!sessionId) {
          return;
        }

        const properties: Record<string, string | number | boolean> = {
          topic_slug: hubSlug,
          hub_slug: hubSlug,
        };

        const normalizedTopicKey = topicKey?.trim();

        if (normalizedTopicKey) {
          properties.topic_key = normalizedTopicKey;
        }

        void trackPlatformEvent({
          sessionId,
          event_name: "topic_product_clicked",
          path,
          practice_id: practiceId,
          properties,
        });
      }}
    >
      {children}
    </div>
  );
}
