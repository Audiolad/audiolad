export type PlaylistListedAtPublishInput = {
  ownerType: "platform" | "user" | null | undefined;
  isEditorial: boolean;
  currentListedAt: string | null | undefined;
  publishedAt: string;
};

/**
 * First-list stamp for platform editorial publish.
 * Returns undefined when listed_at must stay untouched (user-owned / non-editorial).
 */
export function resolveListedAtOnPublish(
  input: PlaylistListedAtPublishInput,
): string | undefined {
  if (input.ownerType !== "platform" || input.isEditorial !== true) {
    return undefined;
  }

  const existing = input.currentListedAt?.trim() || null;
  return existing ?? input.publishedAt;
}
