import type { Metadata } from "next";

import { isBusinessHostname } from "./host";

/** Public prefix for business.audiolad.ru brand assets (lavender icon set). */
export const BUSINESS_BRAND_ASSET_PREFIX = "/business/brand/";

type HostBrandMetadata = Pick<Metadata, "manifest" | "icons">;

/** audiolad.ru (and every non-business host) — unchanged classic icons. */
export const CLASSIC_BRAND_METADATA: HostBrandMetadata = {
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

/** business.audiolad.ru — own manifest («АудиоЛад Бизнес») and lavender icons. */
export const BUSINESS_BRAND_METADATA: HostBrandMetadata = {
  manifest: `${BUSINESS_BRAND_ASSET_PREFIX}manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BUSINESS_BRAND_ASSET_PREFIX}favicon.ico` },
      { url: `${BUSINESS_BRAND_ASSET_PREFIX}favicon-48x48.png`, sizes: "48x48", type: "image/png" },
      { url: `${BUSINESS_BRAND_ASSET_PREFIX}favicon-32x32.png`, sizes: "32x32", type: "image/png" },
      { url: `${BUSINESS_BRAND_ASSET_PREFIX}favicon-16x16.png`, sizes: "16x16", type: "image/png" },
    ],
    shortcut: [{ url: `${BUSINESS_BRAND_ASSET_PREFIX}favicon.ico` }],
    apple: [
      { url: `${BUSINESS_BRAND_ASSET_PREFIX}apple-touch-icon.png`, sizes: "180x180", type: "image/png" },
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
