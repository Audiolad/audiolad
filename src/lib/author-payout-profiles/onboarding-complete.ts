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

  // Optional step: any saved/submitted profile counts as "filled" for display.
  // Commercial activation does NOT depend on payout profile.
  return (
    input.payoutProfileStatus === "verified" ||
    input.payoutProfileStatus === "submitted" ||
    input.payoutProfileStatus === "in_review" ||
    input.payoutProfileStatus === "draft"
  );
}

/** Strict verification signal for payout/withdrawal eligibility only. */
export function isPayoutProfileVerified(
  payoutProfileStatus: AuthorPayoutProfileStatus | null | undefined,
): boolean {
  return payoutProfileStatus === "verified";
}

/** True when author may request a payout / withdrawal. */
export function isPayoutProfileReadyForWithdrawal(
  payoutProfileStatus: AuthorPayoutProfileStatus | null | undefined,
): boolean {
  return isPayoutProfileVerified(payoutProfileStatus);
}
