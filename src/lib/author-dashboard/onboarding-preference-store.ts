import {
  buildAuthorOnboardingStorageKey,
  parseAuthorOnboardingShellCollapsedPreference,
  parseAuthorOnboardingUiPreference,
  serializeAuthorOnboardingUiPreference,
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

/** null = no explicit outer-shell preference stored. */
export function readOnboardingShellCollapsedPreference(
  authorId: string,
): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseAuthorOnboardingShellCollapsedPreference(
      window.localStorage.getItem(buildAuthorOnboardingStorageKey(authorId)),
    );
  } catch {
    return null;
  }
}

export function writeOnboardingShellCollapsedPreference(
  authorId: string,
  collapsed: boolean,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const key = buildAuthorOnboardingStorageKey(authorId);
    const current = parseAuthorOnboardingUiPreference(
      window.localStorage.getItem(key),
    );
    window.localStorage.setItem(
      key,
      serializeAuthorOnboardingUiPreference({
        collapsed,
        dismissed: current.dismissed,
      }),
    );
  } catch {
    // Ignore quota / private mode failures.
  }
}
