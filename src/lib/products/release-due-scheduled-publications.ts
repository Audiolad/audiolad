import type { SupabaseClient } from "@supabase/supabase-js";

import { schedulePracticePublishedSearchNotifications } from "@/lib/seo/practice-publish-notifications";
import {
  planClaimedPublicationNotifications,
  type ClaimedScheduledPublication,
} from "@/lib/seo/practice-publish-plan";

type ClaimRow = {
  practice_id?: unknown;
  author_id?: unknown;
  practice_slug?: unknown;
  author_slug?: unknown;
  catalog_visibility?: unknown;
  is_catalog_listed?: unknown;
  published_at?: unknown;
  prior_public_count?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value;
}

function parseClaimedRow(row: ClaimRow): ClaimedScheduledPublication | null {
  const practiceId = readString(row.practice_id);
  const authorId = readString(row.author_id);
  const practiceSlug = readString(row.practice_slug);
  const authorSlug = readString(row.author_slug);
  const publishedAt = readString(row.published_at);
  const prior =
    typeof row.prior_public_count === "number" &&
    Number.isFinite(row.prior_public_count)
      ? row.prior_public_count
      : 0;

  if (!practiceId || !authorId || !practiceSlug || !authorSlug || !publishedAt) {
    return null;
  }

  return {
    practiceId,
    authorId,
    practiceSlug,
    authorSlug,
    catalogVisibility:
      typeof row.catalog_visibility === "string" ? row.catalog_visibility : null,
    isCatalogListed:
      typeof row.is_catalog_listed === "boolean" ? row.is_catalog_listed : null,
    publishedAt,
    priorPublicCount: prior,
  };
}

/**
 * Stamp published_at for approved practices whose schedule has elapsed, then
 * notify search engines once per claimed row. A later call returns no rows.
 * Fail-open: a missing function or a write error must not break public reads.
 * Sorting still uses effectivePublishedAt when the stamp has not happened yet.
 */
export async function releaseDueScheduledPublications(
  supabase: SupabaseClient,
): Promise<void> {
  const rpc = (supabase as { rpc?: SupabaseClient["rpc"] }).rpc;
  if (typeof rpc !== "function") {
    return;
  }

  try {
    const { data, error } = await rpc("claim_due_scheduled_practice_publications");
    if (error || !Array.isArray(data) || data.length === 0) {
      return;
    }

    const claimed = data
      .map((row) => parseClaimedRow(row as ClaimRow))
      .filter((row): row is ClaimedScheduledPublication => row != null);

    for (const input of planClaimedPublicationNotifications(claimed)) {
      schedulePracticePublishedSearchNotifications(input);
    }
  } catch {
    // Public pages stay available when the stamp cannot run.
  }
}
