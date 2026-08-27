import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAuthorPublicPath,
  buildPracticeCanonicalUrl,
} from "@/lib/products/paths";
import { buildPublicPlaylistCanonicalUrl } from "@/lib/playlists/public-url";
import { getAppOrigin } from "@/lib/seo/app-origin";
import {
  notifyIndexNowUrls,
  type NotifyIndexNowOptions,
  type NotifyIndexNowResult,
} from "@/lib/seo/indexnow/notify";
import type { IndexNowReason } from "@/lib/seo/indexnow/reasons";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import { shouldNotifyIndexNowByVisibility } from "@/lib/products/catalog-visibility";

export type ScheduleIndexNowOptions = NotifyIndexNowOptions & {
  /**
   * When true, run inline (for unit tests) instead of Next.js `after()`.
   * Never enables network by itself — still gated by INDEXNOW_ENABLED.
   */
  syncForTests?: boolean;
};

/**
 * Fire-and-forget IndexNow notify after a successful domain write.
 * Uses Next.js `after()` so the API response is not blocked.
 * Never throws to callers.
 */
export function scheduleIndexNowNotification(
  urls: ReadonlyArray<string | null | undefined>,
  reason: IndexNowReason,
  options: ScheduleIndexNowOptions = {},
): void {
  const cleaned = urls.filter((url): url is string => Boolean(url && String(url).trim()));

  if (cleaned.length === 0) {
    return;
  }

  const run = () => {
    void notifyIndexNowUrls(cleaned, reason, options).catch(() => {
      // notifyIndexNowUrls already swallows errors; keep an extra belt.
    });
  };

  if (options.syncForTests) {
    run();
    return;
  }

  try {
    after(run);
  } catch {
    // Outside a request context (scripts/tests): do not block, still non-fatal.
    run();
  }
}

export function buildAuthorCanonicalUrl(authorSlug: string): string {
  return `${getAppOrigin()}${buildAuthorPublicPath(authorSlug)}`;
}

export async function loadAuthorSlug(
  supabase: SupabaseClient,
  authorId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("authors")
    .select("slug")
    .eq("id", authorId)
    .maybeSingle();

  if (error || !data?.slug || typeof data.slug !== "string") {
    return null;
  }

  return data.slug;
}

export async function countAuthorPublishedPractices(
  supabase: SupabaseClient,
  authorId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("practices")
    .select("id", { count: "exact", head: true })
    .eq("author_id", authorId)
    .eq("status", "published");

  if (error || count == null) {
    return 0;
  }

  return count;
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

export function playlistCanonicalFromSlug(slug: string | null | undefined): string | null {
  if (!slug?.trim()) {
    return null;
  }

  return buildPublicPlaylistCanonicalUrl(slug.trim());
}

/** Test helper: await notify directly (no after). */
export async function notifyIndexNowForTests(
  urls: ReadonlyArray<string | null | undefined>,
  reason: IndexNowReason,
  options: NotifyIndexNowOptions = {},
): Promise<NotifyIndexNowResult> {
  return notifyIndexNowUrls(urls, reason, options);
}
