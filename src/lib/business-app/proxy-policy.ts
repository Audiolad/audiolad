import { isPrivateRoute } from "@/lib/auth/routes";

import {
  BUSINESS_GUEST_COFFEE_PUBLIC_PATH,
  BUSINESS_GUEST_COFFEE_INTERNAL_PATH,
  COFFEE_HOSTNAME,
  coffeeHostEnabled,
  BUSINESS_PUBLIC_PATH_REWRITES,
  BUSINESS_SITE_PATH,
  isBusinessHostname,
  isBusinessSitePath,
  isVenueLicenceInternalPath,
  resolveVenueLicenceInternalPath,
  resolveBusinessInternalPath,
} from "./host";
import { isBusinessBrandAssetPath } from "./brand-icons";
import { isVenueLicencePublicEnabled } from "./venue-licence/flag";

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
  "/api/business/subscription/accept",
  "/api/business/subscription/checkout",
  // ba344b7f: one signed preview track on the wizard atmosphere step.
  "/api/business/onboarding/preview",
  "/api/business/onboarding/preview/audio",
  "/api/business/point",
] as const;

/**
 * Business APIs never served on the coffee host: the /spa pilot player loads SPA programs
 * (loadSpaPilotContext). Coffee is the coffee cabinet only; business keeps them unchanged.
 * `/api/business/player/report` stays reachable for the cabinet player (`source: "cabinet"`);
 * its SPA branch refuses the coffee host inside the handler.
 */
export const COFFEE_BLOCKED_API_PATHS = [
  "/api/business/player/track-url",
  "/api/business/player/manifest",
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
  env: Record<string, string | undefined> = process.env,
): BusinessProxyAction {
  if (hostname === COFFEE_HOSTNAME && !coffeeHostEnabled()) return { action: "not_found" };
  // Gate both entry points before ANY host or internal-path pass-through.
  const venueLicence = resolveVenueLicenceInternalPath(pathname);
  const internalLicence = isVenueLicenceInternalPath(pathname);
  if ((venueLicence || internalLicence) && !isVenueLicencePublicEnabled(env)) {
    return { action: "not_found" };
  }
  // The former cabinet route must never be used again.
  if (pathname === `${BUSINESS_SITE_PATH}/v` || pathname.startsWith(`${BUSINESS_SITE_PATH}/v/`)) {
    return { action: "not_found" };
  }
  if (internalLicence) {
    return { action: isBusinessHostname(hostname) ? "pass_through" : "not_found" };
  }

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

  if (hostname === COFFEE_HOSTNAME &&
      (COFFEE_BLOCKED_API_PATHS as readonly string[]).includes(pathname)) {
    return { action: "not_found" };
  }

  if ((BUSINESS_ALLOWED_API_PATHS as readonly string[]).includes(pathname)) {
    return { action: "pass_through" };
  }

  if (coffeeHostEnabled() && pathname === "/coffee-handoff") {
    return hostname === COFFEE_HOSTNAME ? { action: "not_found" } :
      { action: "rewrite_business_app", pathname: `${BUSINESS_SITE_PATH}/coffee-handoff` };
  }
  if (hostname === COFFEE_HOSTNAME &&
      ["/spa", `${BUSINESS_SITE_PATH}/spa`, `${BUSINESS_SITE_PATH}/coffee-handoff`].some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return { action: "not_found" };
  }
  if (hostname === COFFEE_HOSTNAME && pathname === "/") {
    return { action: "rewrite_business_app", pathname: BUSINESS_GUEST_COFFEE_INTERNAL_PATH };
  }

  // After rewrite Next re-enters proxy with the internal path — pass through.
  if (isBusinessSitePath(pathname)) {
    return { action: "pass_through" };
  }

  const internal = resolveBusinessInternalPath(pathname);
  if (internal) {
    return { action: "rewrite_business_app", pathname: internal };
  }

  // /v/<public id> is the venue licence page. Off (the default) is a 404,
  // including on the business host, until the flag is approved.
  if (venueLicence) {
    return { action: "rewrite_business_app", pathname: venueLicence };
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
