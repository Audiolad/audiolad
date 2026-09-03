/**
 * Fail-closed checkout gate for canonical Author Finance accrual.
 * Uses existing payout_eligible + resolve_author_commercial_terms.
 * Does not invent a share/hold formula.
 */

export function isCommercialTermsFound(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return (raw as { found?: unknown }).found === true;
}

export function canReceiveCanonicalAppreciationAccrual(input: {
  payoutEligible: boolean;
  commercialTermsFound: boolean;
}): boolean {
  return input.payoutEligible === true && input.commercialTermsFound === true;
}
