export type EmailSuppressionReason =
  | "hard_bounce"
  | "complaint"
  | "manual_admin"
  | "user_unsubscribe";

export type EmailSuppressionScope =
  | "all"
  | "marketing"
  | "transactional";

export function isEmailSuppressed(input: {
  normalizedEmail: string;
  suppressions: Array<{
    normalizedEmail: string;
    scope: EmailSuppressionScope;
    expiresAt?: string | null;
  }>;
  requestedScope: EmailSuppressionScope;
}): boolean {
  const now = Date.now();

  return input.suppressions.some((entry) => {
    if (entry.normalizedEmail !== input.normalizedEmail) {
      return false;
    }

    if (entry.expiresAt) {
      const expires = Date.parse(entry.expiresAt);

      if (Number.isFinite(expires) && expires <= now) {
        return false;
      }
    }

    return entry.scope === "all" || entry.scope === input.requestedScope;
  });
}
