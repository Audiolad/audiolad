/**
 * Existing admin-managed platform-owned / owner-controlled author class.
 *
 * `authors.can_bypass_product_moderation` is set only by operators for
 * platform-owned workspaces. It is never inferred from name, slug, or UUID
 * at runtime. This is the canonical distinction already used for product
 * moderation bypass — not a new allowlist.
 */
export function isOwnerControlledAuthorWorkspace(
  canBypassProductModeration: boolean | null | undefined,
): boolean {
  return canBypassProductModeration === true;
}

/**
 * Appreciation-only current Author Terms policy.
 * External commercial authors still require a stored current-version
 * acceptance. Owner-controlled / auto-commercial workspaces do not require
 * a separate self-acceptance of the same platform-authored terms.
 */
export function isAppreciationCurrentTermsSatisfied(input: {
  currentTermsAccepted: boolean;
  ownerControlled: boolean;
}): boolean {
  return input.currentTermsAccepted === true || input.ownerControlled === true;
}
