const HASH_PREFIX = "#listener-comment-";
const COMMENT_HASH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Safety stop if a cursor never repeats and the comment is not in the feed. */
export const LISTENER_COMMENT_HASH_PAGE_CAP = 1000;

export function hashCommentId(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const id = hash.slice(HASH_PREFIX.length);
  return COMMENT_HASH_ID.test(id) ? id : null;
}

/**
 * Keep requesting the public feed until the hashed comment is loaded.
 * Stop when it is present, the cursor ends, the cursor repeats, or the cap is hit.
 */
export function shouldLoadAnotherCommentPage(input: {
  targetId: string | null;
  loadedIds: readonly string[];
  nextCursor: string | null;
  previousCursor: string | null;
  pagesRead: number;
}): boolean {
  if (!input.targetId) return false;
  if (input.pagesRead >= LISTENER_COMMENT_HASH_PAGE_CAP) return false;
  if (input.loadedIds.includes(input.targetId)) return false;
  if (!input.nextCursor) return false;
  if (input.nextCursor === input.previousCursor) return false;
  return true;
}
