/**
 * Access to «Ваши 20%».
 *
 * Normal author sessions remain owner-only. Platform-owner support mode is a
 * full override for the single acting workspace bound to the support session.
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
  | "forbidden";

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
  return input.role === "owner" ? "allowed" : "forbidden";
}

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
