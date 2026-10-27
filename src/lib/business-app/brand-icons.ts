import type { Metadata } from "next";

import { isBusinessHostname } from "./host";

/** Public prefix for business.audiolad.ru brand assets (leather lotus mark; see docs/business/brand-icons). */
export const BUSINESS_BRAND_ASSET_PREFIX = "/business/brand/";

/**
 * Bump when the leather files change. Appended to every business icon URL so
 * browsers do not keep the previous cream mark.
 */
export const BUSINESS_BRAND_ICON_VERSION = "leather1";

export const BUSINESS_BRAND_NAME = "АудиоЛад Бизнес";

/** In-app circle. New file name (not the old cream mark). */
export const BUSINESS_BRAND_MARK_FILE = "mark-leather.webp";

export function businessBrandAssetUrl(file: string): string {
  return `${BUSINESS_BRAND_ASSET_PREFIX}${file}?v=${BUSINESS_BRAND_ICON_VERSION}`;
}

export const BUSINESS_BRAND_MARK_SRC = businessBrandAssetUrl(BUSINESS_BRAND_MARK_FILE);

type HostBrandMetadata = Pick<Metadata, "manifest" | "icons">;

/**
 * audiolad.ru (and every non-business host) — unchanged classic icons.
 * The first entry reproduces byte-for-byte the link Next used to inject from the
 * former file-convention `src/app/favicon.ico` (removed so it no longer leaks
 * onto business.audiolad.ru); `/favicon.ico` itself is served from `public/`.
 */
export const CLASSIC_FILE_FAVICON_HREF = "/favicon.ico?favicon.2vob68tjqpejf.ico";

export const CLASSIC_BRAND_METADATA: HostBrandMetadata = {
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: CLASSIC_FILE_FAVICON_HREF, sizes: "256x256", type: "image/x-icon" },
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

/** business.audiolad.ru — own manifest («АудиоЛад Бизнес») and the leather lotus mark. */
export const BUSINESS_BRAND_METADATA: HostBrandMetadata = {
  manifest: businessBrandAssetUrl("manifest.webmanifest"),
  icons: {
    icon: [
      { url: businessBrandAssetUrl("favicon.ico") },
      { url: businessBrandAssetUrl("favicon-48x48.png"), sizes: "48x48", type: "image/png" },
      { url: businessBrandAssetUrl("favicon-32x32.png"), sizes: "32x32", type: "image/png" },
      { url: businessBrandAssetUrl("favicon-16x16.png"), sizes: "16x16", type: "image/png" },
    ],
    shortcut: [{ url: businessBrandAssetUrl("favicon.ico") }],
    apple: [
      { url: businessBrandAssetUrl("apple-touch-icon.png"), sizes: "180x180", type: "image/png" },
    ],
  },
};

export function getHostBrandMetadata(hostname: string): HostBrandMetadata {
  return isBusinessHostname(hostname)
    ? BUSINESS_BRAND_METADATA
    : CLASSIC_BRAND_METADATA;
}

export function isBusinessBrandAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith(BUSINESS_BRAND_ASSET_PREFIX) &&
    !pathname.includes("..") &&
    pathname.length > BUSINESS_BRAND_ASSET_PREFIX.length
  );
}
