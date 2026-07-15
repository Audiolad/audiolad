import { isPracticePublished } from "@/lib/products/access";

export type PlaylistPublishPractice = {
  id: string;
  status: string | null;
  is_free: boolean | null;
  price: number | null;
  is_catalog_listed?: boolean | null;
};

/**
 * Mirrors claim_free_practice / free catalog listen eligibility:
 * published + is_catalog_listed IS TRUE + is_free IS TRUE + price is null or not > 0.
 * Does not invent a parallel free/paid model.
 */
export function isPracticeEligibleForPublicPlaylist(
  practice: PlaylistPublishPractice,
): boolean {
  if (!isPracticePublished(practice.status)) {
    return false;
  }

  // Same as claim_free_practice: is_catalog_listed IS NOT TRUE → reject
  if (practice.is_catalog_listed !== true) {
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

export function arePracticesEligibleForPublicPlaylist(
  practices: PlaylistPublishPractice[],
): boolean {
  return practices.every(isPracticeEligibleForPublicPlaylist);
}

export const PUBLIC_PLAYLIST_CONTENT_ERROR_MESSAGE =
  "Чтобы сделать плейлист публичным, оставьте в нём только бесплатные материалы, доступные всем.";
