import {
  isMaxCatalogPath,
  isMaxCatalogTopicsPath,
  isMaxPlaybackAudioPath,
  isMaxPlaybackPreviewPath,
  isMaxPlaybackSessionPath,
  isMaxProductPath,
  isMaxHostname,
  isMaxSessionLinkPath,
  isMaxSessionVerifyPath,
  isMaxSitePath,
  MAX_SITE_PATH,
} from "./host";

/**
 * Public files the MAX host must still serve. The proxy matcher also skips
 * these; keep the allowlist so a matcher change cannot 404 them again.
 * Empty 404s on `/sw.js` poison Safari/PWA caches.
 */
export const MAX_PUBLIC_ASSET_PATHS = [
  "/sw.js",
  "/manifest.webmanifest",
] as const;

/**
 * MAX host routing policy (pure, unit-tested).
 *
 * - Any non-MAX host `/max-site` → 404 (no indexable duplicate homepage).
 * - MAX host `/` → internal rewrite to `/max-site` (public URL stays `/`).
 * - MAX host `/max-site` must NOT 308→`/`: Next re-enters proxy after rewrite
 *   and that redirect creates an infinite loop.
 * - MAX host exposes no catalog, studio, listen, or author-cabinet routes.
 * - `/sitemap.xml` is 404 on MAX (do not leak the apex catalog sitemap).
 * - `/robots.txt` still passes through so the host can emit a disallow-all file.
 * - Stages 3A–4D open only the exact MAX session, catalog, product, and
 *   playback endpoints on the MAX host. Not `/api/*`, not `/api/max/*`,
 *   not `/api/max/playback/*` as a wildcard, and not `/auth/*`.
 */
export type MaxProxyAction =
  | { action: "not_found" }
  | { action: "rewrite_max_landing" }
  | { action: "pass_through" };

export function resolveMaxProxyAction(
  hostname: string,
  pathname: string,
): MaxProxyAction {
  if (!isMaxHostname(hostname) && isMaxSitePath(pathname)) {
    return { action: "not_found" };
  }

  if (isMaxHostname(hostname) && pathname === "/") {
    return { action: "rewrite_max_landing" };
  }

  if (
    isMaxHostname(hostname) &&
    (MAX_PUBLIC_ASSET_PATHS as readonly string[]).includes(pathname)
  ) {
    return { action: "pass_through" };
  }

  if (
    isMaxHostname(hostname) &&
    (isMaxSessionVerifyPath(pathname) ||
      isMaxSessionLinkPath(pathname) ||
      isMaxCatalogPath(pathname) ||
      isMaxCatalogTopicsPath(pathname) ||
      isMaxProductPath(pathname) ||
      isMaxPlaybackSessionPath(pathname) ||
      isMaxPlaybackAudioPath(pathname) ||
      isMaxPlaybackPreviewPath(pathname))
  ) {
    return { action: "pass_through" };
  }

  if (
    isMaxHostname(hostname) &&
    ![MAX_SITE_PATH, "/robots.txt"].includes(pathname)
  ) {
    return { action: "not_found" };
  }

  return { action: "pass_through" };
}
