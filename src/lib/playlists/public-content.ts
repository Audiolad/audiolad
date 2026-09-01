import { isFixtureMarkedPractice } from "@/lib/fixtures/test-fixture-marker";
import { isPracticePublished } from "@/lib/products/access";

export type PlaylistPublishPractice = {
  id: string;
  status: string | null;
  is_free: boolean | null;
  price: number | null;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
  cover_image?: unknown;
};

export type PlaylistStorefrontPractice = {
  id?: string;
  status: string | null;
  is_catalog_listed?: boolean | null;
  catalog_visibility?: string | null;
  cover_image?: unknown;
};

/**
 * Two different public-playlist rules — do not mix them:
 *
 * - isPracticeEligibleForPublicPlaylist = membership/publishing rule for
 *   user-owned public playlists. Gift-only. Paid products stay out.
 * - isPracticePlayableOnPublicStorefront = public display/play rule for
 *   /p, /listens, and catalog playlist Play. Paid published listed products
 *   are playable via catalog preview when the listener has no entitlement.
 */
function isPublishedListedNonFixturePractice(
  practice: PlaylistStorefrontPractice,
): boolean {
  if (isFixtureMarkedPractice(practice)) {
    return false;
  }

  if (!isPracticePublished(practice.status)) {
    return false;
  }

  // Same as claim_free_practice: is_catalog_listed IS NOT TRUE → reject
  if (
    practice.catalog_visibility === "selected_users" ||
    practice.catalog_visibility === "unlisted" ||
    practice.is_catalog_listed !== true
  ) {
    return false;
  }

  return true;
}

/**
 * Mirrors claim_free_practice / free catalog listen eligibility:
 * published + is_catalog_listed IS TRUE + is_free IS TRUE + price is null or not > 0.
 * Does not invent a parallel free/paid model.
 */
export function isPracticeEligibleForPublicPlaylist(
  practice: PlaylistPublishPractice,
): boolean {
  if (!isPublishedListedNonFixturePractice(practice)) {
    return false;
  }

  if (practice.is_free !== true) {
    return false;
  }

  // Same as claim_free_practice: reject only when price is a positive amount
  if (practice.price !== null && practice.price > 0) {
    return false;
  }

  return true;
}

/**
 * Public storefront display/play: published listed catalog products, including
 * paid ones. Does not grant full listen access and does not inspect price.
 */
export function isPracticePlayableOnPublicStorefront(
  practice: PlaylistStorefrontPractice,
): boolean {
  return isPublishedListedNonFixturePractice(practice);
}

export function arePracticesEligibleForPublicPlaylist(
  practices: PlaylistPublishPractice[],
): boolean {
  return practices.every(isPracticeEligibleForPublicPlaylist);
}

export const PUBLIC_PLAYLIST_CONTENT_ERROR_MESSAGE =
  "Чтобы сделать плейлист публичным, оставьте в нём только подарочные материалы, доступные всем.";
