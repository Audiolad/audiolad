"use client";

import {
  ensureAnalyticsSession,
  getCachedAnalyticsSessionId,
  trackPlatformEvent,
} from "@/lib/analytics/client";
import type { PlatformAnalyticsEventName } from "@/lib/analytics/constants";

type HelpAnalyticsProperties = Record<string, string | number | boolean | null>;

async function trackHelpEvent(
  eventName: PlatformAnalyticsEventName,
  path: string,
  properties: HelpAnalyticsProperties = {},
): Promise<void> {
  let sessionId = getCachedAnalyticsSessionId();
  if (!sessionId) {
    sessionId = await ensureAnalyticsSession({
      landingPath: path,
    });
  }
  if (!sessionId) return;

  // Never attach free-text query, email, message, or raw URLs.
  void trackPlatformEvent({
    sessionId,
    event_name: eventName,
    path,
    properties,
  });
}

export function trackHelpArticleView(input: {
  articleId: string;
  category: string;
  path: string;
}): void {
  void trackHelpEvent("help_article_view", input.path, {
    article_id: input.articleId,
    category: input.category,
  });
}

export function trackHelpSearch(input: {
  path: string;
  queryLength: number;
  resultCount: number;
}): void {
  const eventName =
    input.resultCount === 0 ? "help_search_no_results" : "help_search";
  void trackHelpEvent(eventName, input.path, {
    query_length: input.queryLength,
    result_count: input.resultCount,
  });
}

export function trackHelpSupportOpen(path: string): void {
  void trackHelpEvent("help_support_open", path, {});
}

export function trackHelpSupportSubmit(input: {
  path: string;
  category: string;
}): void {
  void trackHelpEvent("help_support_submit", input.path, {
    category: input.category,
  });
}

export function trackHelpArticleCtaClick(input: {
  articleId: string;
  path: string;
}): void {
  void trackHelpEvent("help_article_cta_click", input.path, {
    article_id: input.articleId,
  });
}
