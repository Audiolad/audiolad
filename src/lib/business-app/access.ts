/**
 * a8240527 – one AudioLad Business cabinet for a guest and for a venue owner.
 * Pure / browser-safe. The SAME shell, navigation and sections render for everyone; only
 * the access level changes what is unlocked. This is UI state only: every protected read
 * or write is still enforced on the server (RLS on business_* tables, membership checks
 * in route handlers / server actions, pilot allowlist, guest listening limit).
 */
import type { BusinessOwnerHomeContext } from "./domain";
import type { BusinessNavItem } from "./nav";

export type BusinessAccessLevel = "guest" | "member";

export type BusinessAccess = {
  /** member = belongs to a Business organization (owner / manager). */
  level: BusinessAccessLevel;
  signedIn: boolean;
  hasPoint: boolean;
};

export function resolveBusinessAccess(domain: BusinessOwnerHomeContext): BusinessAccess {
  if (domain.status !== "authenticated") return { level: "guest", signedIn: false, hasPoint: false };
  const member = Boolean(domain.organizationId);
  return { level: member ? "member" : "guest", signedIn: true, hasPoint: Boolean(domain.location) };
}

export function isBusinessNavItemLocked(item: Pick<BusinessNavItem, "requires">, access: BusinessAccess): boolean {
  return item.requires === "member" && access.level !== "member";
}

/** Where a nav item leads for this visitor (guests enter Music through the permanent atlas URL). */
export function businessNavHref(item: Pick<BusinessNavItem, "href" | "guestHref">, access: BusinessAccess): string {
  return access.level === "guest" && item.guestHref ? item.guestHref : item.href;
}

export const BUSINESS_LOCKED_LABEL = "доступно после подключения";

/**
 * «Подключить»: the real path inside this same cabinet – sign-in (shared .audiolad.ru
 * session) and point creation (/onboarding → create_business_organization_with_location).
 * The coffee-shop type is preselected. Online trial activation and payment do not exist yet.
 */
export const BUSINESS_CONNECT_HREF = "/onboarding?type=cafe";

export function businessLockedNotice(title: string): string {
  return `«${title}» – ${BUSINESS_LOCKED_LABEL}.`;
}
