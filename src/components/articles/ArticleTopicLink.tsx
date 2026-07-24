"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useArticlePlayback } from "@/components/articles/ArticlePlaybackProvider";

type ArticleTopicLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

export default function ArticleTopicLink({
  href,
  children,
  className,
}: ArticleTopicLinkProps) {
  const { trackEvent } = useArticlePlayback();

  return (
    <Link
      href={href}
      className={className}
      onClick={() =>
        trackEvent("article_topic_click", {
          placement: "topic_link",
          destination: href,
        })
      }
    >
      {children}
    </Link>
  );
}
