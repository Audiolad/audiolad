import "server-only";

import { hasAcceptedCurrentAuthorTerms } from "@/lib/author-terms/service";

/**
 * Current Author Terms (DB is_current), not a hardcoded version label.
 * Fail closed: lookup errors hide the CTA and reject checkout.
 */
export async function hasAcceptedCurrentAppreciationTerms(
  authorId: string,
): Promise<boolean> {
  try {
    const { accepted } = await hasAcceptedCurrentAuthorTerms(authorId);
    return accepted;
  } catch {
    return false;
  }
}
