import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPublicPlaylistCanonicalUrl } from "@/lib/playlists/public-url";
import {
  notifyIndexNowUrls,
  type NotifyIndexNowOptions,
  type NotifyIndexNowResult,
} from "@/lib/seo/indexnow/notify";
import type { IndexNowReason } from "@/lib/seo/indexnow/reasons";

export {
  buildAuthorCanonicalUrl,
  buildPracticeIndexNowUrls,
  planPracticePublishIndexNow,
  planPracticeSlugChangeIndexNow,
} from "@/lib/seo/indexnow/planner";

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

/**
 * Count of every published product owned by the author, including
 * unlisted and selected_users. This is an author-capability / first-publish
 * counter, not a public-catalog visibility count. Do not filter to listed.
 */
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
