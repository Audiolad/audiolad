import { getAppOrigin } from "@/lib/seo/app-origin";

import { resolveValidatedNextPath } from "./routes";

const RESET_PASSWORD_PATH = "/auth/reset-password";
const SIGN_IN_PATH = "/auth/sign-in";

/** Reset-password route preserving the user's post-login destination. */
export function buildResetPasswordRouteWithNext(
  ultimateNext: string | null | undefined,
): string {
  const safeUltimate = resolveValidatedNextPath(ultimateNext);

  if (!safeUltimate) {
    return RESET_PASSWORD_PATH;
  }

  const params = new URLSearchParams({ next: safeUltimate });
  return `${RESET_PASSWORD_PATH}?${params.toString()}`;
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

/** GoTrue redirectTo: callback exchanges code, then opens reset-password with next. */
export function buildPasswordRecoveryRedirectUrl(
  ultimateNext: string | null | undefined,
): string {
  const callbackNext = buildResetPasswordRouteWithNext(ultimateNext);
  const origin = getAppOrigin();
  const params = new URLSearchParams({ next: callbackNext });

  return `${origin}/auth/callback?${params.toString()}`;
}
