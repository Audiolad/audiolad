/**
 * Practice PATCH / related update keys that affect the public practice page.
 * Updates that only touch other keys must not trigger IndexNow.
 */
export const PRACTICE_PUBLIC_INDEXNOW_FIELDS = [
  "title",
  "subtitle",
  "description",
  "format",
  "slug",
  "price",
  "is_free",
  "cover_url",
  "cover_image",
  "use_shared_cover",
  "listening_notice_enabled",
  "listening_notice_title",
  "listening_notice_text",
  "is_catalog_listed",
  "catalog_visibility",
  "seo_primary_query",
  "seo_secondary_queries",
  "seo_title",
  "seo_description",
  "seo_about",
  "seo_usage_items",
  "seo_faq_items",
  "related_products",
  "related_listens",
  "seo_content",
] as const;

export type PracticePublicIndexNowField =
  (typeof PRACTICE_PUBLIC_INDEXNOW_FIELDS)[number];

const PRACTICE_PUBLIC_FIELD_SET = new Set<string>(PRACTICE_PUBLIC_INDEXNOW_FIELDS);

/** Author profile fields that change the public author page. */
export const AUTHOR_PUBLIC_INDEXNOW_FIELDS = [
  "name",
  "author_type",
  "short_bio",
  "short_positioning",
  "full_bio",
  "topic_keys",
  "featured_product_ids",
  "avatar_url",
  "banner_url",
  "avatar_image",
  "banner_image",
  "banner_position_x",
  "banner_position_y",
] as const;

const AUTHOR_PUBLIC_FIELD_SET = new Set<string>(AUTHOR_PUBLIC_INDEXNOW_FIELDS);

/**
 * True when `updates` includes at least one public-significant practice field
 * (ignores `updated_at` and other internal-only keys).
 */
export function hasPracticePublicIndexNowChanges(
  updates: Readonly<Record<string, unknown>>,
): boolean {
  return Object.keys(updates).some((key) => PRACTICE_PUBLIC_FIELD_SET.has(key));
}

/**
 * True when the author profile patch touches public-facing fields.
 * `topic_keys` / `featured_product_ids` may be applied outside the scalar update map.
 */
export function hasAuthorPublicIndexNowChanges(input: {
  scalarUpdates?: Readonly<Record<string, unknown>>;
  topicKeysProvided?: boolean;
  featuredProductIdsProvided?: boolean;
  contactsProvided?: boolean;
  assetChanged?: boolean;
}): boolean {
  if (
    input.topicKeysProvided ||
    input.featuredProductIdsProvided ||
    input.contactsProvided ||
    input.assetChanged
  ) {
    return true;
  }

  const scalar = input.scalarUpdates ?? {};
  return Object.keys(scalar).some((key) => AUTHOR_PUBLIC_FIELD_SET.has(key));
}

/**
 * Playlist PATCH public significance: visibility transitions or title/editorial
 * while already public. Private-only edits are ignored.
 */
export function resolvePlaylistIndexNowEvent(input: {
  previousVisibility: "public" | "private";
  nextVisibility: "public" | "private";
  previousSlug: string | null;
  nextSlug: string | null;
  titleChanged: boolean;
  editorialChanged: boolean;
}): {
  reason:
    | "playlist_published"
    | "playlist_updated"
    | "playlist_unpublished"
    | "playlist_slug_changed"
    | null;
  /** Playlist slugs to notify (caller builds canonical `/p/{slug}` URLs). */
  slugs: string[];
} {
  const { previousVisibility, nextVisibility, previousSlug, nextSlug } = input;

  if (previousVisibility === "private" && nextVisibility === "public") {
    return {
      reason: "playlist_published",
      slugs: nextSlug ? [nextSlug] : [],
    };
  }

  if (previousVisibility === "public" && nextVisibility === "private") {
    return {
      reason: "playlist_unpublished",
      slugs: previousSlug ? [previousSlug] : [],
    };
  }

  if (previousVisibility === "public" && nextVisibility === "public") {
    if (previousSlug && nextSlug && previousSlug !== nextSlug) {
      return {
        reason: "playlist_slug_changed",
        slugs: [previousSlug, nextSlug],
      };
    }

    if (input.titleChanged || input.editorialChanged) {
      return {
        reason: "playlist_updated",
        slugs: nextSlug ? [nextSlug] : previousSlug ? [previousSlug] : [],
      };
    }
  }

  return { reason: null, slugs: [] };
}
