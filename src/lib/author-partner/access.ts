/**
 * Owner-only access to «Ваши 20%».
 *
 * A user may open the section only for an author workspace they already
 * belong to as owner. Support mode and editor membership stay closed.
 * Query parameters never grant a workspace that is not in that membership list.
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
  const slug =
    typeof input.authorSlug === "string" ? input.authorSlug.trim() : "";
  return slug.length > 0;
}

export type PartnerYour20AccessDecision =
  | "allowed"
  | "support_mode_blocked"
  | "forbidden";

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
  const slug =
    typeof input.resolvedAuthorSlug === "string"
      ? input.resolvedAuthorSlug.trim()
      : "";
  if (!slug) {
    return "forbidden";
  }
  return "allowed";
}

/**
 * Pick an owner workspace from the current user's memberships.
 * Editor rows are ignored. A foreign or editor `?author=` slug falls back
 * to the first owner workspace and never authorizes a non-owner role.
 */
export function selectOwnedAuthorWorkspace<
  T extends { slug: string; role?: string | null },
>(authors: readonly T[], slugParam: string | null | undefined): T | null {
  const owners = authors.filter((author) => author.role === "owner");
  if (owners.length === 0) {
    return null;
  }
  const requested = typeof slugParam === "string" ? slugParam.trim() : "";
  const matched = requested
    ? owners.find((author) => author.slug === requested)
    : undefined;
  return matched ?? owners[0] ?? null;
}
