import "server-only";

import { AuthorTermsAcceptanceRequiredError } from "@/lib/author-terms/errors";
import { hasAcceptedCurrentAuthorTerms } from "@/lib/author-terms/service";

/**
 * Server-side domain guard for commercial write-actions.
 * Membership/auth must already be verified by the caller.
 */
export async function requireCurrentAuthorTermsAcceptance(
  authorId: string,
): Promise<{ termsVersionId: string }> {
  const { accepted, currentVersion } =
    await hasAcceptedCurrentAuthorTerms(authorId);

  if (!currentVersion) {
    throw new AuthorTermsAcceptanceRequiredError({
      termsVersionId: "unpublished",
      termsUrl: "/author-terms",
    });
  }

  if (!accepted) {
    throw new AuthorTermsAcceptanceRequiredError({
      termsVersionId: currentVersion.id,
      termsUrl: "/author-terms",
    });
  }

  return { termsVersionId: currentVersion.id };
}
