import {
  authorAccessAllowsPaidProducts,
  isAuthorCommercialApprovedAccess,
  type AuthorAccessStatus,
} from "@/lib/authors/access";

/**
 * Explicit commercial capability flags after application approval.
 * Paid create/publish stay false until commercial_active (or legacy commercial).
 */
export type AuthorCommercialCapabilities = {
  can_access_commercial_onboarding: boolean;
  can_edit_payout_profile: boolean;
  can_view_commercial_terms: boolean;
  /** False until a published terms edition exists. */
  can_accept_commercial_terms: boolean;
  can_create_paid_product: boolean;
  can_publish_paid_product: boolean;
};

export type ResolveAuthorCommercialCapabilitiesInput = {
  accessStatus: AuthorAccessStatus | string | null | undefined;
  /** When a published cooperation-terms edition exists. */
  publishedTermsAvailable?: boolean;
};

export function resolveAuthorCommercialCapabilities(
  input: ResolveAuthorCommercialCapabilitiesInput,
): AuthorCommercialCapabilities {
  const accessStatus = input.accessStatus ?? null;
  const canAccessOnboarding = isAuthorCommercialApprovedAccess(accessStatus);
  const publishedTermsAvailable = input.publishedTermsAvailable === true;
  const paid = authorAccessAllowsPaidProducts(accessStatus);

  return {
    can_access_commercial_onboarding: canAccessOnboarding,
    can_edit_payout_profile:
      canAccessOnboarding && accessStatus !== "commercial_suspended",
    can_view_commercial_terms: canAccessOnboarding,
    // Acceptance for current/new editions: onboarding + live commercial authors.
    can_accept_commercial_terms:
      publishedTermsAvailable &&
      canAccessOnboarding &&
      accessStatus !== "commercial_suspended",
    can_create_paid_product: paid,
    can_publish_paid_product: paid,
  };
}
