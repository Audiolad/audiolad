import { BUSINESS_ORIGIN } from "@/lib/business-app/host";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

/**
 * Return path on audiolad.ru after the existing email registration / confirmation.
 * Shared by the guest CTA, sign-up metadata and the auth callback (tasks ba344b7f, 1e008ee8).
 * Relative on purpose: getSafeNextPath rejects other hosts.
 */
export const BUSINESS_TRIAL_RETURN_PATH = "/auth/business-return";

export const BUSINESS_WORKSPACE_PUBLIC_PATH = "/workspace";

export function isBusinessTrialNext(next: string | null | undefined): boolean {
  const path = (next ?? "").trim().split(/[?#]/)[0];
  return path === BUSINESS_TRIAL_RETURN_PATH;
}

export const BUSINESS_TRIAL_SIGN_UP_HREF = `${PRODUCTION_APP_ORIGIN}/auth/sign-up?next=${encodeURIComponent(BUSINESS_TRIAL_RETURN_PATH)}`;

export const BUSINESS_TRIAL_SIGN_IN_HREF = `${PRODUCTION_APP_ORIGIN}/auth/sign-in?next=${encodeURIComponent(BUSINESS_TRIAL_RETURN_PATH)}`;

export function businessWorkspaceHref(spaceId: string): string {
  const params = new URLSearchParams({ space: spaceId });
  return `${BUSINESS_ORIGIN}${BUSINESS_WORKSPACE_PUBLIC_PATH}?${params.toString()}`;
}

export function businessWorkspacePublicPath(spaceId: string): string {
  const params = new URLSearchParams({ space: spaceId });
  return `${BUSINESS_WORKSPACE_PUBLIC_PATH}?${params.toString()}`;
}
