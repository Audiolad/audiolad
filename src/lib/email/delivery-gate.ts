export const APPLICATION_SUPPRESSION_SCOPES = [
  "marketing",
  "author_marketing",
  "all_non_critical",
  "all",
] as const;

export type ApplicationSuppressionScope =
  (typeof APPLICATION_SUPPRESSION_SCOPES)[number];

export type ApplicationSuppressionEntry = {
  normalizedEmail: string;
  scope: ApplicationSuppressionScope;
  expiresAt?: string | null;
};

export type AuthorDeliveryPreference = {
  author_operational: boolean;
  author_marketing: boolean;
};

export type AuthorDeliveryDecision =
  | { ok: true }
  | {
      ok: false;
      code: "suppressed" | "preference" | "consent_required";
      reason: string;
    };

export function isApplicationSuppressionScope(
  value: string,
): value is ApplicationSuppressionScope {
  return (APPLICATION_SUPPRESSION_SCOPES as readonly string[]).includes(value);
}

export function activeSuppressionScopes(input: {
  normalizedEmail: string;
  suppressions: readonly ApplicationSuppressionEntry[];
  now?: Date;
}): Set<ApplicationSuppressionScope> {
  const now = (input.now ?? new Date()).getTime();
  const scopes = new Set<ApplicationSuppressionScope>();

  for (const entry of input.suppressions) {
    if (entry.normalizedEmail !== input.normalizedEmail) {
      continue;
    }

    if (entry.expiresAt) {
      const expires = Date.parse(entry.expiresAt);
      if (Number.isFinite(expires) && expires <= now) {
        continue;
      }
    }

    scopes.add(entry.scope);
  }

  return scopes;
}

function suppressionReason(
  scopes: Set<ApplicationSuppressionScope>,
  messageType: "author_operational" | "author_marketing",
): string | null {
  if (scopes.has("all")) {
    return "all";
  }

  if (scopes.has("all_non_critical")) {
    return "all_non_critical";
  }

  if (messageType === "author_marketing") {
    if (scopes.has("author_marketing")) {
      return "author_marketing";
    }

    if (scopes.has("marketing")) {
      return "marketing";
    }
  }

  return null;
}

/**
 * Author operational mail respects all / all_non_critical suppressions and an
 * explicit operational preference opt-out. It is not marketing: author_marketing
 * and generic marketing suppressions do not block it, and marketing consent is
 * not required.
 *
 * Author marketing requires an active author_marketing consent and preference,
 * and also respects author_marketing plus general suppressions.
 */
export function evaluateAuthorDelivery(input: {
  messageType: "author_operational" | "author_marketing";
  scopes: ReadonlySet<ApplicationSuppressionScope>;
  preference: AuthorDeliveryPreference | null;
  latestAuthorMarketingConsent: "granted" | "revoked" | null;
}): AuthorDeliveryDecision {
  const scopes = new Set(input.scopes);
  const blocked = suppressionReason(scopes, input.messageType);

  if (blocked) {
    return { ok: false, code: "suppressed", reason: blocked };
  }

  if (input.messageType === "author_operational") {
    if (input.preference && input.preference.author_operational === false) {
      return { ok: false, code: "preference", reason: "author_operational" };
    }

    return { ok: true };
  }

  if (!input.preference || input.preference.author_marketing !== true) {
    return { ok: false, code: "consent_required", reason: "author_marketing_preference" };
  }

  if (input.latestAuthorMarketingConsent !== "granted") {
    return { ok: false, code: "consent_required", reason: "author_marketing_consent" };
  }

  return { ok: true };
}

export function latestConsentStatus(
  records: readonly { purpose: string; status: "granted" | "revoked"; createdAt: string }[],
  purpose: string,
): "granted" | "revoked" | null {
  const matching = records
    .filter((record) => record.purpose === purpose)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return matching[0]?.status ?? null;
}
