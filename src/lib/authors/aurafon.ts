/**
 * Shared identity for the closed-beta project «Аурафон».
 *
 * Single source of truth for the stable author workspace UUID/slug.
 * Feature gates (SEO discovery, product wizard, …) must import from here
 * instead of hardcoding the UUID or chaining through another feature's helper.
 *
 * Gate decisions use UUID only — never display name or slug.
 */

/** Stable Auraфон / Аурофон author workspace UUID (migration 20260801120000). */
export const AURAFON_AUTHOR_ID = "59c7e5b8-eae4-4394-82fb-b815a10be6c2";

/** Documentation slug only — gate decisions use UUID. */
export const AURAFON_AUTHOR_SLUG = "aurafon";

/**
 * True only for the «Аурафон» author workspace UUID.
 * Rejects null, undefined, empty, and whitespace-only values.
 */
export function isAurafonAuthor(
  authorId: string | null | undefined,
): boolean {
  if (typeof authorId !== "string") {
    return false;
  }

  const trimmed = authorId.trim();
  if (!trimmed) {
    return false;
  }

  return trimmed === AURAFON_AUTHOR_ID;
}
