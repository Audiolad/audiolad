/**
 * Closed beta for the author product create/edit wizard.
 *
 * Independent of SEO discovery: both currently allow the same workspace
 * («Аурафон»), but gates must not call each other. Identity comes from
 * `@/lib/authors/aurafon` only — no second Magic UUID here.
 */

import { isAurafonAuthor } from "@/lib/authors/aurafon";

/**
 * True only when the author workspace may use the product wizard beta.
 * Gate decisions use UUID only (via isAurafonAuthor).
 */
export function isAuthorProductWizardEnabled(
  authorId: string | null | undefined,
): boolean {
  return isAurafonAuthor(authorId);
}
