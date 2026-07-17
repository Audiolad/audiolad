import { getAppOrigin } from "@/lib/seo/app-origin";

import { getSafeNextPath } from "./routes";

export function buildPasswordRecoveryRedirectUrl(
  next: string | null | undefined,
): string {
  const safeNext = getSafeNextPath(next, "/auth/reset-password");
  const origin = getAppOrigin();
  const params = new URLSearchParams({ next: safeNext });

  return `${origin}/auth/callback?${params.toString()}`;
}
