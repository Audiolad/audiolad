export type StartSuggestionProduct = {
  id: string;
  authorId: string;
};

export const HOME_START_SUGGESTIONS_LIMIT = 7;

/**
 * Prefer earlier sources, keep order within each source, and keep at most one
 * product per author. Diversity beats padding: fewer authors than `limit`
 * yields a shorter list.
 */
export function takeUniqueAuthorProducts<T extends StartSuggestionProduct>(
  sources: readonly (readonly T[])[],
  limit: number,
): T[] {
  if (limit <= 0) {
    return [];
  }

  const seenProductIds = new Set<string>();
  const seenAuthorIds = new Set<string>();
  const result: T[] = [];

  for (const source of sources) {
    for (const product of source) {
      const authorId = product.authorId.trim();

      if (
        !authorId ||
        seenAuthorIds.has(authorId) ||
        seenProductIds.has(product.id)
      ) {
        continue;
      }

      seenAuthorIds.add(authorId);
      seenProductIds.add(product.id);
      result.push(product);

      if (result.length >= limit) {
        return result;
      }
    }
  }

  return result;
}
