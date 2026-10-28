import { isPrivateRoute } from "@/lib/auth/routes";

import {
  BUSINESS_GUEST_COFFEE_PUBLIC_PATH,
  BUSINESS_PUBLIC_PATH_REWRITES,
  BUSINESS_SITE_PATH,
  isBusinessHostname,
  isBusinessSitePath,
  resolveBusinessInternalPath,
} from "./host";
import { isBusinessBrandAssetPath } from "./brand-icons";

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
  // c02fe282: stable (build-independent) /spa player endpoints.
  "/api/business/player/report",
  "/api/business/player/track-url",
  "/api/business/player/manifest",
  // a8240527: guest coffee cabinet (no account; server-side 30-minute listening limit).
  "/api/business/guest/coffee/track-url",
  "/api/business/guest/coffee/usage",
  // ba344b7f: workspace player. The gift gate and the rights filter run inside the handlers.
  "/api/business/workspace/track-url",
  "/api/business/workspace/state",
  "/api/business/workspace/queue",
  // ba344b7f: one signed preview track on the wizard atmosphere step.
  "/api/business/onboarding/preview",
  "/api/business/onboarding/preview/audio",
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

  // Business brand assets (manifest/.ico are not excluded by the proxy matcher).
  if (isBusinessBrandAssetPath(pathname)) {
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

/**
 * Guest on the business host who hit a listener-private URL (Профиль is /profile).
 * /auth/sign-in does not exist on business.audiolad.ru. Send them to the same
 * guest entry as /music, /workspace and /player. Null keeps the apex sign-in.
 */
export function businessPrivateGuestRedirect(
  rewritePathname: string | undefined,
  pathname: string,
): string | null {
  if (!rewritePathname || !isBusinessSitePath(rewritePathname)) return null;
  if (!isPrivateRoute(pathname)) return null;
  return BUSINESS_GUEST_COFFEE_PUBLIC_PATH;
}

/** Exported for tests — public paths the business host rewrites. */
export function listBusinessPublicRewritePaths(): string[] {
  return Object.keys(BUSINESS_PUBLIC_PATH_REWRITES);
}

export { BUSINESS_SITE_PATH };
