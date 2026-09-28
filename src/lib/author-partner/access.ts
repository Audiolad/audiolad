/**
 * Owner access to «Ваши 20%», plus platform-owner support mode.
 *
 * Normal users must own the workspace. In support mode the platform owner may
 * inspect and operate the selected author workspace even though the real admin
 * account is not an author_members row. The support session itself is already
 * scoped to one acting author and validated server-side.
 */

export function canAccessAuthorPartnerYour20Ui(input: {
  authorSlug?: string | null;
  role?: string | null;
  isSupportMode?: boolean;
}): boolean {
  const slug =
    typeof input.authorSlug === "string" ? input.authorSlug.trim() : "";
  if (!slug) {
    return false;
  }
  if (input.isSupportMode) {
    return true;
  }
  return input.role === "owner";
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
  const slug =
    typeof input.resolvedAuthorSlug === "string"
      ? input.resolvedAuthorSlug.trim()
      : "";
  if (!slug) {
    return "forbidden";
  }
  if (input.isSupportMode) {
    return "allowed";
  }
  if (input.role !== "owner") {
    return "forbidden";
  }
  return "allowed";
}

/**
 * Pick the partner-program workspace.
 * Normal mode is owner-only. Support mode may use the single scoped workspace
 * even when the acting membership is editor: platform-owner support authority
 * is constrained by the active support session, not by admin author_members.
 */
export function selectOwnedAuthorWorkspace<
  T extends { slug: string; role?: string | null },
>(
  authors: readonly T[],
  slugParam: string | null | undefined,
  isSupportMode = false,
): T | null {
  const candidates = isSupportMode
    ? [...authors]
    : authors.filter((author) => author.role === "owner");
  if (candidates.length === 0) {
    return null;
  }
  const requested = typeof slugParam === "string" ? slugParam.trim() : "";
  const matched = requested
    ? candidates.find((author) => author.slug === requested)
    : undefined;
  return matched ?? candidates[0] ?? null;
}
