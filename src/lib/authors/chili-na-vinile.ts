/**
 * Shared identity for the closed-beta project «Чили на виниле».
 *
 * Single source of truth for the stable author workspace UUID/slug.
 * Feature gates must import from here instead of hardcoding the UUID
 * or chaining through another feature's helper.
 *
 * Gate decisions use UUID only – never display name or slug.
 */

/** Stable «Чили на виниле» author workspace UUID. */
export const CHILI_NA_VINILE_AUTHOR_ID = "3a10c97d-cf97-4a00-8f14-76d70b02d906";

/** Documentation slug only – gate decisions use UUID. */
export const CHILI_NA_VINILE_AUTHOR_SLUG = "chili-na-vinile";

/**
 * True only for the «Чили на виниле» author workspace UUID.
 * Rejects null, undefined, empty, and whitespace-only values.
 */
export function isChiliNaVinileAuthor(
  authorId: string | null | undefined,
): boolean {
  if (typeof authorId !== "string") {
    return false;
  }

  const trimmed = authorId.trim();
  if (!trimmed) {
    return false;
  }

  return trimmed === CHILI_NA_VINILE_AUTHOR_ID;
}
