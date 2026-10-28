/**
 * Account-level B2B offer. The version and hash must match
 * accept_business_offer in 20270205130000_business_subscription_payment.sql.
 * The cabinet links to the text on this site. There is no third-party address.
 */

export const BUSINESS_OFFER_HREF = "/documents/b2b-terms";

export const BUSINESS_OFFER_TITLE = "Условия лицензирования музыки для бизнеса";

export const BUSINESS_ONBOARDING_HREF = "/onboarding";

export type BusinessOfferEdition = {
  documentKey: "b2b-terms";
  version: string;
  contentHash: string;
};

const CURRENT_EDITION: BusinessOfferEdition = {
  documentKey: "b2b-terms",
  version: "r8-2026-10-18",
  contentHash: "0fbbfe610f344920a084e58b5987cce5f4d7033528abc8760aac07b89de7078a",
};

const LEGACY_EDITION: BusinessOfferEdition = {
  documentKey: "b2b-terms",
  version: "r6.1-2026-10-18",
  contentHash: "a3e74c3a6b06bd6c8e29ecc6e832984a7a2f7f5af75c44252c7ba1a85c98bc88",
};

export function currentBusinessOfferEdition(unifiedAgreementEnabled: boolean): BusinessOfferEdition {
  return unifiedAgreementEnabled ? CURRENT_EDITION : LEGACY_EDITION;
}
