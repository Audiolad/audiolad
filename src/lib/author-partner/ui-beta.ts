/**
 * Temporary partner UI beta allowlist.
 *
 * Gates the «Ваши 20%» author-cabinet tab/page to Sergey Petrov's workspace
 * only. Prefer the stable author UUID; slug is documentation / secondary match.
 * Do not scatter `slug === "sergey-petrov"` across components — import here.
 *
 * Not finance PR4: this gate covers invite-link UI only.
 */

/** Stable production author workspace UUID for Сергей Петров. */
export const PARTNER_UI_BETA_AUTHOR_ID =
  "7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c";

/** Documentation slug — gate decisions prefer UUID. */
export const PARTNER_UI_BETA_AUTHOR_SLUG = "sergey-petrov";

export type PartnerUiBetaInput = {
  authorId?: string | null | undefined;
  authorSlug?: string | null | undefined;
};

/**
 * True only for Sergey Petrov's author workspace during partner UI beta.
 * Rejects empty / whitespace values. UUID match wins; slug is fallback when
 * id is unavailable (nav edge cases) and must be exact.
 */
export function isAuthorPartnerUiBetaEnabled(
  input: PartnerUiBetaInput | string | null | undefined,
): boolean {
  if (input == null) {
    return false;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return false;
    return (
      trimmed === PARTNER_UI_BETA_AUTHOR_ID ||
      trimmed === PARTNER_UI_BETA_AUTHOR_SLUG
    );
  }

  const id =
    typeof input.authorId === "string" ? input.authorId.trim() : "";
  if (id && id === PARTNER_UI_BETA_AUTHOR_ID) {
    return true;
  }

  const slug =
    typeof input.authorSlug === "string" ? input.authorSlug.trim() : "";
  if (slug && slug === PARTNER_UI_BETA_AUTHOR_SLUG) {
    return true;
  }

  return false;
}

export function canAccessAuthorPartnerYour20Ui(input: {
  authorId?: string | null;
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
  return isAuthorPartnerUiBetaEnabled({
    authorId: input.authorId,
    authorSlug: input.authorSlug,
  });
}
