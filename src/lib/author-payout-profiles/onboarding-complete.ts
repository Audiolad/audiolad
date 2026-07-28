import { isAuthorCommercialActiveAccess } from "@/lib/authors/access";
import type { AuthorAccessStatus } from "@/lib/authors/access";
import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";

/**
 * Onboarding presentation only for legacy commercial_active authors.
 * Must NOT be used as payout_profile_verified for activation/payouts.
 */
export function resolvePayoutStepCompleteForLegacyOnboarding(input: {
  accessStatus: AuthorAccessStatus;
  payoutProfileStatus: AuthorPayoutProfileStatus | null;
}): boolean {
  if (isAuthorCommercialActiveAccess(input.accessStatus)) {
    return true;
  }

  // Checklist presentation: saved/submitted counts as filled.
  // Activation / paid access still require isPayoutProfileVerified().
  return (
    input.payoutProfileStatus === "verified" ||
    input.payoutProfileStatus === "submitted" ||
    input.payoutProfileStatus === "in_review"
  );
}

/** Strict verification signal for future activation / payout eligibility. */
export function isPayoutProfileVerified(
  payoutProfileStatus: AuthorPayoutProfileStatus | null | undefined,
): boolean {
  return payoutProfileStatus === "verified";
}
