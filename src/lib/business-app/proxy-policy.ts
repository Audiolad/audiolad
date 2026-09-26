import {
  BUSINESS_PUBLIC_PATH_REWRITES,
  BUSINESS_SITE_PATH,
  isBusinessHostname,
  isBusinessSitePath,
  resolveBusinessInternalPath,
} from "./host";

/**
 * Public files the business host must still serve.
 */
export const BUSINESS_PUBLIC_ASSET_PATHS = [
  "/sw.js",
  "/manifest.webmanifest",
] as const;

/** Minimal platform telemetry endpoints still hit by root BaseProviders. */
export const BUSINESS_ALLOWED_API_PATHS = [
  "/api/client-errors",
  "/api/health/build",
] as const;

/**
 * Business host routing policy (pure, unit-tested).
 *
 * - Any non-business host `/business-app` → 404 (no indexable duplicate).
 * - Business host public paths → internal rewrite under `/business-app`.
 * - Business host `/business-app` must NOT redirect to `/` (rewrite loop risk).
 * - Business host exposes no listener/author/admin/catalog routes (fail closed).
 * - `/sitemap.xml` is 404 on business (do not leak the apex catalog sitemap).
 * - `/robots.txt` passes through for disallow-all.
 * - Public marketing `/b` is unrelated and never rewritten here.
 */
export type BusinessProxyAction =
  | { action: "not_found" }
  | { action: "rewrite_business_app"; pathname: string }
  | { action: "pass_through" };

export function resolveBusinessProxyAction(
  hostname: string,
  pathname: string,
): BusinessProxyAction {
  if (!isBusinessHostname(hostname) && isBusinessSitePath(pathname)) {
    return { action: "not_found" };
  }

  if (!isBusinessHostname(hostname)) {
    return { action: "pass_through" };
  }

  if (
    (BUSINESS_PUBLIC_ASSET_PATHS as readonly string[]).includes(pathname)
  ) {
    return { action: "pass_through" };
  }

  if (pathname === "/robots.txt") {
    return { action: "pass_through" };
  }

  if ((BUSINESS_ALLOWED_API_PATHS as readonly string[]).includes(pathname)) {
    return { action: "pass_through" };
  }

  // After rewrite Next re-enters proxy with the internal path — pass through.
  if (isBusinessSitePath(pathname)) {
    return { action: "pass_through" };
  }

  const internal = resolveBusinessInternalPath(pathname);
  if (internal) {
    return { action: "rewrite_business_app", pathname: internal };
  }

  return { action: "not_found" };
}

/** Exported for tests — public paths the business host rewrites. */
export function listBusinessPublicRewritePaths(): string[] {
  return Object.keys(BUSINESS_PUBLIC_PATH_REWRITES);
}

export { BUSINESS_SITE_PATH };
