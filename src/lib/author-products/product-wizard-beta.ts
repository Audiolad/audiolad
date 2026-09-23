/**
 * Closed beta for the author product create/edit wizard.
 *
 * Independent of SEO discovery and of the music product wizard.
 * This gate stays Aurafon-only. Music / release for every author uses
 * `isMusicProductWizardEnabled` instead — do not flip this helper to
 * always-true, or practice and course would open the new wizard.
 * Identity comes from `@/lib/authors/aurafon` only — no second Magic UUID here.
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
