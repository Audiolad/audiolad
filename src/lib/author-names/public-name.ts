import type { AuthorApplicationStatus } from "@/lib/author-applications/types";

/**
 * Exact duplicate check for a public author or project name.
 * Normalization is deliberate and narrow: trim, collapse inner whitespace,
 * case-fold, map ё/е, and drop quotes only at the edges.
 * Similar names stay different.
 */

export const AUTHOR_PUBLIC_NAME_TAKEN_MESSAGE =
  "Такое название уже занято, придумайте другое";

export const AUTHOR_PUBLIC_NAME_CHECK_FAILED_MESSAGE =
  "Не удалось проверить название. Попробуйте ещё раз.";

export const AUTHOR_PUBLIC_NAME_TAKEN_CODE = "author_name_taken";

export const AUTHOR_PUBLIC_NAME_CHECK_DEBOUNCE_MS = 400;

/** Live checks per signed-in user. Matches other authenticated lookup limits. */
export const AUTHOR_PUBLIC_NAME_RATE_LIMIT = 60;

export const AUTHOR_PUBLIC_NAME_RATE_WINDOW_MS = 60_000;

/** Shared-IP ceiling so one address cannot enumerate names for many accounts. */
export const AUTHOR_PUBLIC_NAME_IP_RATE_LIMIT = 120;

const EDGE_QUOTES = /["'«»„“”‘’‹›]/u;

/**
 * Statuses that reserve a name. Rejected, withdrawn and draft do not.
 * «Новая» is submitted. «Одобрена» is approved.
 */
export const AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES = [
  "submitted",
  "in_review",
  "needs_changes",
  "approved",
] as const satisfies readonly AuthorApplicationStatus[];

export type AuthorPublicNameReservedStatus =
  (typeof AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES)[number];

export type AuthorPublicNameClaim = {
  normalizedName: string;
  kind: "author" | "application";
  id: string;
};

export type AuthorPublicNameExclusion = {
  authorIds?: readonly string[];
  applicationIds?: readonly string[];
};

export function isReservedAuthorApplicationStatus(
  status: string,
): status is AuthorPublicNameReservedStatus {
  return (
    AUTHOR_PUBLIC_NAME_RESERVED_APPLICATION_STATUSES as readonly string[]
  ).includes(status);
}

export function normalizeAuthorPublicName(name: string): string {
  let value = name.trim().replace(/\s+/g, " ");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const stripped = value
      .replace(new RegExp(`^${EDGE_QUOTES.source}+`, "u"), "")
      .replace(new RegExp(`${EDGE_QUOTES.source}+$`, "u"), "")
      .trim()
      .replace(/\s+/g, " ");

    if (stripped === value) {
      break;
    }

    value = stripped;
  }

  return value.toLowerCase().replace(/ё/g, "е");
}

export function authorPublicNamesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeAuthorPublicName(left);
  const normalizedRight = normalizeAuthorPublicName(right);
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

/**
 * True only when another claim has the same normalized name.
 * Excluded ids are the caller's own application or workspace.
 */
export function isAuthorPublicNameTakenInClaims(
  name: string,
  claims: readonly AuthorPublicNameClaim[],
  exclusion?: AuthorPublicNameExclusion,
): boolean {
  const normalized = normalizeAuthorPublicName(name);
  if (!normalized) {
    return false;
  }

  const authorIds = new Set(exclusion?.authorIds ?? []);
  const applicationIds = new Set(exclusion?.applicationIds ?? []);

  return claims.some((claim) => {
    if (claim.normalizedName !== normalized) {
      return false;
    }

    if (claim.kind === "author" && authorIds.has(claim.id)) {
      return false;
    }

    if (claim.kind === "application" && applicationIds.has(claim.id)) {
      return false;
    }

    return true;
  });
}

/** Success body of the availability endpoint. Nothing except the boolean. */
export function authorNameAvailabilityBody(available: boolean): {
  available: boolean;
} {
  return { available: available === true };
}
