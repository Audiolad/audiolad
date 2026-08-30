/**
 * Author-owned heading for the public related-products block.
 * Empty / whitespace falls back to the default; stored value stays nullable.
 */
export const DEFAULT_AUTHOR_RECOMMENDATIONS_TITLE = "Рекомендации автора";
export const AUTHOR_RECOMMENDATIONS_TITLE_MAX_LENGTH = 80;

export function normalizeAuthorRecommendationsTitle(
  value: unknown,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("invalid_text_field");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveAuthorRecommendationsTitle(
  value: string | null | undefined,
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || DEFAULT_AUTHOR_RECOMMENDATIONS_TITLE;
}
