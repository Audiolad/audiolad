import { getAppOrigin } from "@/lib/seo/app-origin";

import { resolveValidatedNextPath } from "./routes";

const RECOVERY_PATH = "/auth/recovery";
const RESET_PASSWORD_PATH = "/auth/reset-password";
const SIGN_IN_PATH = "/auth/sign-in";

/** Recovery landing route preserving the user's post-login destination. */
export function buildRecoveryRouteWithNext(
  ultimateNext: string | null | undefined,
): string {
  const safeUltimate = resolveValidatedNextPath(ultimateNext);

  if (!safeUltimate) {
    return RECOVERY_PATH;
  }

  const params = new URLSearchParams({ next: safeUltimate });
  return `${RECOVERY_PATH}?${params.toString()}`;
}

/** Reset-password route preserving the user's post-login destination. */
export function buildResetPasswordRouteWithNext(
  ultimateNext: string | null | undefined,
): string {
  const safeUltimate = resolveValidatedNextPath(ultimateNext);
  if (!safeUltimate) return RESET_PASSWORD_PATH;

  return `${RESET_PASSWORD_PATH}?${new URLSearchParams({ next: safeUltimate }).toString()}`;
}

/** Sign-in route shown after a successful password reset. */
export function buildPostPasswordResetSignInHref(
  ultimateNext: string | null | undefined,
): string {
  const params = new URLSearchParams({ reset: "1" });
  const safeUltimate = resolveValidatedNextPath(ultimateNext);

  if (safeUltimate) {
    params.set("next", safeUltimate);
  }

  return `${SIGN_IN_PATH}?${params.toString()}`;
}

/**
 * GoTrue redirectTo for the recovery template.
 *
 * The template appends TokenHash in the URL fragment. Fragments never reach
 * the server, proxy, access logs, or Referer headers.
 */
export function buildPasswordRecoveryRedirectUrl(
  ultimateNext: string | null | undefined,
): string {
  const recoveryRoute = buildRecoveryRouteWithNext(ultimateNext);
  const origin = getAppOrigin();

  return `${origin}${recoveryRoute}`;
}
