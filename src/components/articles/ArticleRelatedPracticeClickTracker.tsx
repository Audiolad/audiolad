"use client";

import type { ReactNode } from "react";

import { useArticlePlayback } from "@/components/articles/ArticlePlaybackProvider";

type ArticleRelatedPracticeClickTrackerProps = {
  practiceSlug: string;
  children: ReactNode;
};

export default function ArticleRelatedPracticeClickTracker({
  practiceSlug,
  children,
}: ArticleRelatedPracticeClickTrackerProps) {
  const { trackEvent } = useArticlePlayback();

  return (
    <div
      onClickCapture={() =>
        trackEvent("article_related_practice_click", {
          placement: "related_practices",
          related_practice_slug: practiceSlug,
        })
      }
    >
      {children}
    </div>
  );
}
