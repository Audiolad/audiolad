import type { AuthorAccessStatus } from "@/lib/authors/access";
import type { AuthorPayoutProfileStatus } from "@/lib/author-payout-profiles/types";

/**
 * Optional checklist "filled enough" signal for callers that still pass
 * payoutDetailsComplete. Must NOT treat commercial_active alone as filled,
 * and must NOT treat empty/missing draft as complete.
 * Must NOT be used as payout_profile_verified for activation/payouts.
 */
export function resolvePayoutStepCompleteForLegacyOnboarding(input: {
  accessStatus: AuthorAccessStatus;
  payoutProfileStatus: AuthorPayoutProfileStatus | null;
}): boolean {
  // accessStatus is intentionally ignored for completeness — commercial
  // activation is independent of payout requisites.
  void input.accessStatus;

  return (
    input.payoutProfileStatus === "verified" ||
    input.payoutProfileStatus === "submitted" ||
    input.payoutProfileStatus === "in_review"
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
