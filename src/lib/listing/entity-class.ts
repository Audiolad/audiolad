/**
 * Listing entity class is not a product kind.
 *
 * Products stay class "product" with kind practice | music | audio_post | program.
 * Playlists are a separate listing stream: class "playlist".
 * Do not add playlist as a product kind.
 */

export const LISTING_ENTITY_CLASS = {
  PRODUCT: "product",
  PLAYLIST: "playlist",
} as const;

export type ListingEntityClass =
  (typeof LISTING_ENTITY_CLASS)[keyof typeof LISTING_ENTITY_CLASS];
