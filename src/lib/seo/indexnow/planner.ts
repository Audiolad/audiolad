import {
  buildAuthorPublicPath,
  buildPracticeCanonicalUrl,
} from "@/lib/products/paths";
import { shouldNotifyIndexNowByVisibility } from "@/lib/products/catalog-visibility";
import { getAppOrigin } from "@/lib/seo/app-origin";
import { INDEXNOW_REASONS, type IndexNowReason } from "@/lib/seo/indexnow/reasons";

export function buildAuthorCanonicalUrl(authorSlug: string): string {
  return `${getAppOrigin()}${buildAuthorPublicPath(authorSlug)}`;
}

export function buildPracticeIndexNowUrls(input: {
  authorSlug: string;
  practiceSlug: string;
  previousPracticeSlug?: string | null;
}): string[] {
  const urls: string[] = [];

  if (input.previousPracticeSlug && input.previousPracticeSlug !== input.practiceSlug) {
    urls.push(
      buildPracticeCanonicalUrl(input.authorSlug, input.previousPracticeSlug),
    );
  }

  urls.push(buildPracticeCanonicalUrl(input.authorSlug, input.practiceSlug));
  return urls;
}

/**
 * Pure planner for practice publish / republish notifications.
 */
export function planPracticePublishIndexNow(input: {
  authorSlug: string;
  practiceSlug: string;
  /** True when practice.published_at was null before this publish. */
  isFirstPublishOfPractice: boolean;
  /** Count of status=published practices before this publish. */
  publishedCountBefore: number;
  catalogVisibility?: string | null;
  isCatalogListed?: boolean | null;
}): Array<{ reason: IndexNowReason; urls: string[] }> {
  if (
    !shouldNotifyIndexNowByVisibility(
      input.catalogVisibility,
      input.isCatalogListed,
    )
  ) {
    return [];
  }

  const practiceUrl = buildPracticeCanonicalUrl(
    input.authorSlug,
    input.practiceSlug,
  );
  const authorUrl = buildAuthorCanonicalUrl(input.authorSlug);
  const events: Array<{ reason: IndexNowReason; urls: string[] }> = [];

  if (input.isFirstPublishOfPractice) {
    events.push({
      reason: INDEXNOW_REASONS.practice_published,
      urls: [practiceUrl, authorUrl],
    });

    if (input.publishedCountBefore === 0) {
      events.push({
        reason: INDEXNOW_REASONS.author_became_public,
        urls: [authorUrl],
      });
    }
  } else {
    events.push({
      reason: INDEXNOW_REASONS.practice_published,
      urls: [practiceUrl],
    });
  }

  return events;
}

export function planPracticeSlugChangeIndexNow(input: {
  authorSlug: string;
  previousSlug: string;
  nextSlug: string;
}): { reason: IndexNowReason; urls: string[] } | null {
  if (!input.previousSlug || !input.nextSlug || input.previousSlug === input.nextSlug) {
    return null;
  }

  return {
    reason: INDEXNOW_REASONS.practice_slug_changed,
    urls: [
      buildPracticeCanonicalUrl(input.authorSlug, input.previousSlug),
      buildPracticeCanonicalUrl(input.authorSlug, input.nextSlug),
    ],
  };
}
