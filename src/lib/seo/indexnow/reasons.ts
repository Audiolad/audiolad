/**
 * Stable IndexNow reason codes for runtime hooks and CLI.
 * Must not contain user IDs, secrets, or free-form user text.
 */
export const INDEXNOW_REASONS = {
  practice_published: "practice_published",
  practice_updated: "practice_updated",
  practice_unpublished: "practice_unpublished",
  practice_archived: "practice_archived",
  practice_slug_changed: "practice_slug_changed",
  playlist_published: "playlist_published",
  playlist_updated: "playlist_updated",
  playlist_unpublished: "playlist_unpublished",
  playlist_slug_changed: "playlist_slug_changed",
  author_profile_updated: "author_profile_updated",
  author_became_public: "author_became_public",
  cli_manual: "cli_manual",
  cli_live: "cli_live",
} as const;

export type IndexNowReason =
  (typeof INDEXNOW_REASONS)[keyof typeof INDEXNOW_REASONS];

export function isIndexNowReason(value: string): value is IndexNowReason {
  return Object.values(INDEXNOW_REASONS).includes(value as IndexNowReason);
}
