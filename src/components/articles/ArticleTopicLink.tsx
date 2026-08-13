"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";

type ArticleTopicLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  articleSlug: string;
  topicSlug: string;
  path: string;
  practiceId?: string;
  practiceSlug?: string;
};

export default function ArticleTopicLink({
  href,
  children,
  className,
  articleSlug,
  topicSlug,
  path,
  practiceId,
  practiceSlug,
}: ArticleTopicLinkProps) {
  function handleClick() {
    const sessionId = getCachedAnalyticsSessionId();

    if (!sessionId) {
      return;
    }

    void trackPlatformEvent({
      sessionId,
      event_name: "article_topic_click",
      path,
      practice_id: practiceId,
      properties: {
        article_slug: articleSlug,
        topic_slug: topicSlug,
        ...(practiceSlug ? { practice_slug: practiceSlug } : {}),
        placement: "topic_link",
        destination: href,
      },
    });
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
