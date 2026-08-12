import {
  isMainSiteHostname,
  isSchoolHostname,
  isSchoolSitePath,
  SCHOOL_SITE_PATH,
} from "./host";

/**
 * Public files the school host must still serve. The proxy matcher also skips
 * these; keep the allowlist so a matcher change cannot 404 them again.
 * Empty 404s on `/sw.js` poison Safari/PWA caches.
 */
export const SCHOOL_PUBLIC_ASSET_PATHS = [
  "/sw.js",
  "/manifest.webmanifest",
] as const;

/**
 * School host routing policy (pure, unit-tested).
 *
 * - Main site `/school-site` → 404 (no indexable duplicate).
 * - School host `/` → internal rewrite to `/school-site` (public URL stays `/`).
 * - School host `/school-site` must NOT 308→`/`: Next re-enters proxy after rewrite
 *   and that redirect creates an infinite loop.
 * - School host exposes no platform application routes.
 * - School host still serves PWA public files (sw/manifest) so Safari never
 *   caches an empty 404 for those URLs.
 */
export type SchoolProxyAction =
  | { action: "not_found" }
  | { action: "rewrite_school_landing" }
  | { action: "pass_through" };

export function resolveSchoolProxyAction(
  hostname: string,
  pathname: string,
): SchoolProxyAction {
  if (isMainSiteHostname(hostname) && isSchoolSitePath(pathname)) {
    return { action: "not_found" };
  }

  if (isSchoolHostname(hostname) && pathname === "/") {
    return { action: "rewrite_school_landing" };
  }

  if (
    isSchoolHostname(hostname) &&
    (SCHOOL_PUBLIC_ASSET_PATHS as readonly string[]).includes(pathname)
  ) {
    return { action: "pass_through" };
  }

  if (
    isSchoolHostname(hostname) &&
    ![
      SCHOOL_SITE_PATH,
      "/robots.txt",
      "/sitemap.xml",
    ].includes(pathname)
  ) {
    return { action: "not_found" };
  }

  return { action: "pass_through" };
}
