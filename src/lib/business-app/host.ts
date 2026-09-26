import {
  getHostnameFromHeaders,
  normalizeHostname,
} from "@/lib/school/host";

/** Business B2B subdomain (no www). Code-only host isolation; Nginx/DNS wiring is a later infra step. */
export const BUSINESS_HOSTNAME = "business.audiolad.ru";

export const BUSINESS_ORIGIN = `https://${BUSINESS_HOSTNAME}`;

/** Internal App Router path served for the Business App root. Must not collide with public `/b`. */
export const BUSINESS_SITE_PATH = "/business-app";

export { normalizeHostname, getHostnameFromHeaders };

export function isBusinessHostname(hostname: string): boolean {
  return hostname === BUSINESS_HOSTNAME;
}

export function isBusinessSitePath(pathname: string): boolean {
  return (
    pathname === BUSINESS_SITE_PATH ||
    pathname.startsWith(`${BUSINESS_SITE_PATH}/`)
  );
}

/**
 * Browser-visible paths on the business host → internal App Router paths.
 * Avoid `/settings` (platform private prefix) — use `/preferences` instead.
 */
export const BUSINESS_PUBLIC_PATH_REWRITES: Readonly<Record<string, string>> = {
  "/": BUSINESS_SITE_PATH,
  "/locations": `${BUSINESS_SITE_PATH}/locations`,
  "/music": `${BUSINESS_SITE_PATH}/music`,
  "/stats": `${BUSINESS_SITE_PATH}/stats`,
  "/more": `${BUSINESS_SITE_PATH}/more`,
  "/announcements": `${BUSINESS_SITE_PATH}/announcements`,
  "/documents": `${BUSINESS_SITE_PATH}/documents`,
  "/team": `${BUSINESS_SITE_PATH}/team`,
  "/preferences": `${BUSINESS_SITE_PATH}/settings`,
  "/help": `${BUSINESS_SITE_PATH}/help`,
};

export function resolveBusinessInternalPath(
  publicPathname: string,
): string | null {
  return BUSINESS_PUBLIC_PATH_REWRITES[publicPathname] ?? null;
}

/** Normalize usePathname() whether it returns public or internal path. */
export function normalizeBusinessAppPathname(pathname: string): string {
  if (pathname === BUSINESS_SITE_PATH || pathname === "/") {
    return "/";
  }
  if (pathname.startsWith(`${BUSINESS_SITE_PATH}/`)) {
    const rest = pathname.slice(BUSINESS_SITE_PATH.length);
    if (rest === "/settings" || rest.startsWith("/settings/")) {
      return `/preferences${rest.slice("/settings".length)}`;
    }
    return rest || "/";
  }
  return pathname;
}
