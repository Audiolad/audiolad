import type { EmailConsentPurpose, EmailConsentStatus } from "./types";

export type EmailConsentRecordInput = {
  contactId: string;
  userId?: string | null;
  purpose: EmailConsentPurpose;
  status: EmailConsentStatus;
  legalBasis: "consent" | "contract" | "legitimate_interest";
  textVersion: string;
  source: string;
  grantedAt?: string | null;
  revokedAt?: string | null;
};

export const MARKETING_CONSENT_PURPOSES: EmailConsentPurpose[] = [
  "listener_marketing",
  "listener_recommendations",
  "platform_news",
  "author_education",
  "author_marketing",
  "product_updates",
];

export function isMarketingConsentPurpose(
  purpose: EmailConsentPurpose,
): boolean {
  return MARKETING_CONSENT_PURPOSES.includes(purpose);
}

export function canEnableMarketingPreference(input: {
  purpose: EmailConsentPurpose;
  hasActiveConsent: boolean;
}): boolean {
  if (!isMarketingConsentPurpose(input.purpose)) {
    return true;
  }

  return input.hasActiveConsent;
}
