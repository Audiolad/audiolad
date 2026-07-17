import { canEnableMarketingPreference } from "./consent";
import type { EmailConsentPurpose } from "./types";

export type EmailPreferenceFlags = {
  service_notifications: boolean;
  listener_product_updates: boolean;
  listener_recommendations: boolean;
  platform_news: boolean;
  listener_marketing: boolean;
  author_operational: boolean;
  author_sales: boolean;
  author_product_status: boolean;
  author_education: boolean;
  author_marketing: boolean;
  digest_frequency: "immediate" | "daily" | "weekly";
};

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferenceFlags = {
  service_notifications: true,
  listener_product_updates: false,
  listener_recommendations: false,
  platform_news: false,
  listener_marketing: false,
  author_operational: true,
  author_sales: true,
  author_product_status: true,
  author_education: false,
  author_marketing: false,
  digest_frequency: "immediate",
};

const PREFERENCE_TO_CONSENT: Partial<
  Record<keyof EmailPreferenceFlags, EmailConsentPurpose>
> = {
  listener_product_updates: "product_updates",
  listener_recommendations: "listener_recommendations",
  platform_news: "platform_news",
  listener_marketing: "listener_marketing",
  author_education: "author_education",
  author_marketing: "author_marketing",
};

export function applyConsentToPreferences(
  preferences: EmailPreferenceFlags,
  activeConsents: Set<EmailConsentPurpose>,
): EmailPreferenceFlags {
  const next = { ...preferences };

  for (const [preferenceKey, purpose] of Object.entries(PREFERENCE_TO_CONSENT)) {
    if (!purpose) {
      continue;
    }

    const key = preferenceKey as keyof EmailPreferenceFlags;

    if (
      typeof next[key] === "boolean" &&
      next[key] === true &&
      !canEnableMarketingPreference({
        purpose,
        hasActiveConsent: activeConsents.has(purpose),
      })
    ) {
      (next as Record<string, boolean | string>)[key] = false;
    }
  }

  return next;
}

export function revokeConsentPreferences(
  preferences: EmailPreferenceFlags,
  revokedPurpose: EmailConsentPurpose,
): EmailPreferenceFlags {
  const next = { ...preferences };

  for (const [preferenceKey, purpose] of Object.entries(PREFERENCE_TO_CONSENT)) {
    if (purpose !== revokedPurpose) {
      continue;
    }

    const key = preferenceKey as keyof EmailPreferenceFlags;

    if (typeof next[key] === "boolean") {
      (next as Record<string, boolean | string>)[key] = false;
    }
  }

  return next;
}
