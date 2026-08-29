import {
  buildAuthorOnboardingStorageKey,
  parseAuthorOnboardingUiPreference,
} from "@/lib/author-dashboard/onboarding-checklist";

/**
 * Legacy combined-card localStorage. Must not drive UI.
 * Read only for a one-time hide bridge when both checklists are complete.
 */
export function readLegacyOnboardingDismissed(authorId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return parseAuthorOnboardingUiPreference(
      window.localStorage.getItem(buildAuthorOnboardingStorageKey(authorId)),
    ).dismissed;
  } catch {
    return false;
  }
}

export function clearLegacyOnboardingPreference(authorId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(buildAuthorOnboardingStorageKey(authorId));
  } catch {
    // Ignore quota / private mode failures.
  }
}
