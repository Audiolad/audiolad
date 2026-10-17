/**
 * Support mode must never produce a legal acceptance or consent.
 *
 * A platform-owner support session lets staff operate an author's cabinet,
 * but accepting the author agreement (author_terms_acceptances) or any
 * AudioLad Business consent is a personal legal act of the rightsholder.
 * Before 8dcba9d1 PR 1 the accept route recorded such a click under the
 * author's user id (actingUserId), i.e. as if the author had clicked.
 *
 * Pure module: used by the API route (server), the proxy (edge) and UI.
 */

export const SUPPORT_MODE_ACCEPTANCE_FORBIDDEN =
  "support_mode_acceptance_forbidden" as const;

/** API paths that record a legal acceptance/consent. Blocked in support mode. */
export const AUTHOR_SUPPORT_CONSENT_PATH_PREFIXES = [
  "/api/author/terms/accept",
] as const;

export const SUPPORT_MODE_CONSENT_NOTICE =
  "Вы работаете в режиме сопровождения. Принять соглашение или дать согласие может только сам автор из своего аккаунта: сотрудник АудиоЛада не может сделать это за него. Выйдите из режима сопровождения или попросите автора.";

export type ConsentExecutionContext = {
  isSupportMode: boolean;
  realUserId: string;
  actingUserId: string;
} | null;

export function isAuthorSupportConsentPath(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? pathname).replace(/\/+$/, "");
  return AUTHOR_SUPPORT_CONSENT_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Fail-closed: an unknown context, an active support session, or any
 * mismatch between the real and the acting user blocks the acceptance.
 */
export function isConsentBlockedForExecution(
  context: ConsentExecutionContext,
): boolean {
  if (!context) {
    return true;
  }
  if (context.isSupportMode) {
    return true;
  }
  return context.realUserId !== context.actingUserId;
}

/**
 * Decision used by every server path that records an acceptance/consent.
 *
 * Support mode exists only through the support cookie (see
 * getAuthorExecutionContext), so:
 *   - no support cookie → not support mode (works for cookie AND Bearer auth);
 *   - support cookie present → the cookie-authenticated execution context must
 *     resolve, must not be support mode and must be the same real user as the
 *     caller authenticated by the route; anything else blocks (fail-closed).
 */
export function evaluateConsentBlock(input: {
  hasSupportCookie: boolean;
  context: ConsentExecutionContext;
  authenticatedUserId: string | null;
}): boolean {
  if (!input.authenticatedUserId) {
    return true;
  }
  if (!input.hasSupportCookie) {
    return false;
  }
  if (isConsentBlockedForExecution(input.context)) {
    return true;
  }
  return input.context?.realUserId !== input.authenticatedUserId;
}
