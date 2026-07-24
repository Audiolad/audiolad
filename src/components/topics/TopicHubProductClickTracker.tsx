"use client";

import type { ReactNode } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";

type TopicHubProductClickTrackerProps = {
  topicKey: string;
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

        void trackPlatformEvent({
          sessionId,
          event_name: "topic_product_clicked",
          path,
          practice_id: practiceId,
          properties: {
            topic_key: topicKey,
            hub_slug: hubSlug,
          },
        });
      }}
    >
      {children}
    </div>
  );
}
