/**
 * Shared identity for the closed-beta project «Кофейник».
 *
 * Single source of truth for the stable author workspace UUID/slug.
 * Feature gates must import from here instead of hardcoding the UUID
 * or chaining through another feature's helper.
 *
 * Gate decisions use UUID only – never display name or slug.
 */

/** Stable «Кофейник» author workspace UUID. */
export const KOFEYNIK_AUTHOR_ID = "8bab9913-8e09-4918-913a-556b0f9b3998";

/** Documentation slug only – gate decisions use UUID. */
export const KOFEYNIK_AUTHOR_SLUG = "kofeynik";

/**
 * True only for the «Кофейник» author workspace UUID.
 * Rejects null, undefined, empty, and whitespace-only values.
 */
export function isKofeynikAuthor(
  authorId: string | null | undefined,
): boolean {
  if (typeof authorId !== "string") {
    return false;
  }

  const trimmed = authorId.trim();
  if (!trimmed) {
    return false;
  }

  return trimmed === KOFEYNIK_AUTHOR_ID;
}
