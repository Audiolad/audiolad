export type EditorialDiversityHint = {
  authorName: string;
  count: number;
};

const FIRST_WINDOW = 7;
const DOMINANCE_THRESHOLD = 4;

/**
 * Soft composition hint only. Does not block save or publish.
 * If one author occupies ≥4 of the first 7 positions, return that author.
 */
export function getEditorialDiversityHint(
  items: Array<{ authorId?: string | null; authorName?: string | null }>,
): EditorialDiversityHint | null {
  const window = items.slice(0, FIRST_WINDOW);
  const counts = new Map<string, { authorName: string; count: number }>();

  for (const item of window) {
    const authorId = item.authorId?.trim();
    const authorName = item.authorName?.trim();

    if (!authorId || !authorName) {
      continue;
    }

    const current = counts.get(authorId) ?? { authorName, count: 0 };
    current.count += 1;
    counts.set(authorId, current);
  }

  let dominant: EditorialDiversityHint | null = null;

  for (const value of counts.values()) {
    if (value.count >= DOMINANCE_THRESHOLD) {
      if (!dominant || value.count > dominant.count) {
        dominant = value;
      }
    }
  }

  return dominant;
}
