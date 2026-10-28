export const MOBILE_TOP_CHROME_VARIANTS = [
  "catalog",
  "playlists",
  "library",
] as const;

export type MobileTopChromeVariant = (typeof MOBILE_TOP_CHROME_VARIANTS)[number];

/**
 * First-paint fallbacks only. Live spacer height is the measured chrome
 * height — these tokens must never become a shared min-height on the
 * measured layer (that feedback loop is the geometry-drift bug).
 */
export const MOBILE_TOP_CHROME_FALLBACK_VARS = {
  catalog: "--mobile-top-chrome-fallback-catalog",
  playlists: "--mobile-top-chrome-fallback-playlists",
  library: "--mobile-top-chrome-fallback-library",
} as const;

export function spacerStyleFromChromeHeight(
  heightPx: number | null | undefined,
): { height: string; minHeight: string } | undefined {
  if (heightPx == null || !Number.isFinite(heightPx) || heightPx < 0) {
    return undefined;
  }

  const px = `${heightPx}px`;
  return { height: px, minHeight: px };
}

export function joinMobileTopChromeClassNames(
  ...parts: Array<string | undefined | false | null>
): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Listener routes whose layout mounts the fixed MobileTopChrome layer
 * (catalog search, playlists catalog search, audiotheque chrome).
 * Anything rendered in the shell above `children` on these routes ends up
 * underneath the fixed layer: invisible, but still pushing the spacer and
 * content down (an empty gap with a peeking rounded edge on mobile).
 */
export const MOBILE_TOP_CHROME_ROUTE_PREFIXES = [
  "/catalog",
  "/playlists/catalog",
  "/my-practices",
] as const;

export function isMobileTopChromeRoute(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) {
    return false;
  }

  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return MOBILE_TOP_CHROME_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
