/**
 * Temporary partner UI beta allowlist.
 *
 * Gates the «Ваши 20%» author-cabinet tab/page to Sergey Petrov's workspace
 * only, by canonical authors.slug. Do not scatter
 * `slug === "sergey-petrov"` across components — import here.
 *
 * No hardcoded author UUID: production UUID is not verified in repo SoT.
 * Server actions must resolve authorId → authors.slug before granting access.
 *
 * Not finance PR4: this gate covers invite-link UI only.
 */

/** Canonical beta workspace slug (GitHub / product SoT). */
export const PARTNER_UI_BETA_AUTHOR_SLUG = "sergey-petrov";

export type PartnerUiBetaInput = {
  authorSlug?: string | null | undefined;
};

/**
 * True only when the author workspace slug is exactly sergey-petrov.
 * Rejects empty / whitespace. Does NOT accept bare authorId — callers that
 * only have an id must resolve authors.slug server-side first.
 */
export function isAuthorPartnerUiBetaEnabled(
  input: PartnerUiBetaInput | string | null | undefined,
): boolean {
  if (input == null) {
    return false;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed === PARTNER_UI_BETA_AUTHOR_SLUG;
  }

  const slug =
    typeof input.authorSlug === "string" ? input.authorSlug.trim() : "";
  return slug === PARTNER_UI_BETA_AUTHOR_SLUG;
}

/**
 * Client/nav gate: beta slug + owner + not support mode.
 * Never grant access from an arbitrary authorId alone.
 */
export function canAccessAuthorPartnerYour20Ui(input: {
  authorSlug?: string | null;
  role?: string | null;
  isSupportMode?: boolean;
}): boolean {
  if (input.isSupportMode) {
    return false;
  }
  if (input.role !== "owner") {
    return false;
  }
  return isAuthorPartnerUiBetaEnabled({ authorSlug: input.authorSlug });
}

export type PartnerYour20AccessDecision =
  | "allowed"
  | "support_mode_blocked"
  | "forbidden"
  | "beta_disabled";

/**
 * Pure authorization decision after the server has resolved authors.slug
 * for the given authorId. Used by server actions and unit tests.
 * Never pass a client-supplied slug here without DB verification.
 */
export function evaluatePartnerYour20Access(input: {
  resolvedAuthorSlug: string | null | undefined;
  role: string | null | undefined;
  isSupportMode: boolean;
}): PartnerYour20AccessDecision {
  if (input.isSupportMode) {
    return "support_mode_blocked";
  }
  if (input.role !== "owner") {
    return "forbidden";
  }
  if (!isAuthorPartnerUiBetaEnabled({ authorSlug: input.resolvedAuthorSlug })) {
    return "beta_disabled";
  }
  return "allowed";
}
