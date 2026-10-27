import { BUSINESS_ORIGIN } from "@/lib/business-app/host";
import { isBusinessSpaceId, type BusinessSpaceId } from "@/lib/business-workspace/spaces";
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

/** Same-host onboarding link that returns to this cabinet after the point exists. */
export function businessCabinetOnboardingPath(spaceId: BusinessSpaceId): string {
  const params = new URLSearchParams({
    type: "cafe",
    next: businessWorkspacePublicPath(spaceId),
  });
  return `/onboarding?${params.toString()}`;
}

/** Cross-host entry from audiolad.ru after email confirmation. */
export function businessOnboardingEntryHref(spaceId: BusinessSpaceId): string {
  return `${BUSINESS_ORIGIN}${businessCabinetOnboardingPath(spaceId)}`;
}

/**
 * Only a workspace path on this host. Drops every query key except `space`.
 * Rejects other hosts, schemes and unrelated paths.
 */
export function safeBusinessWorkspaceReturn(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return null;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) return null;
  const hashless = decoded.split("#")[0] ?? decoded;
  const pathname = hashless.split("?")[0] ?? hashless;
  if (pathname !== BUSINESS_WORKSPACE_PUBLIC_PATH || pathname.includes(":")) return null;
  const query = hashless.includes("?") ? hashless.slice(hashless.indexOf("?") + 1) : "";
  const space = new URLSearchParams(query).get("space");
  if (!space) return BUSINESS_WORKSPACE_PUBLIC_PATH;
  if (!isBusinessSpaceId(space)) return null;
  return businessWorkspacePublicPath(space);
}
