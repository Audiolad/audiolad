import { getAuthorAssetPublicUrl } from "@/lib/authors/assets";
import { getCoverPublicUrl } from "@/lib/author-products/utils";
import { buildCoverDisplayUrl } from "@/lib/author-products/utils";
import {
  buildCoverDisplayUrlFromManifest,
  pickResponsiveVariantKey,
} from "@/lib/images/image-url";
import { parseImageManifest } from "@/lib/images/image-manifest";
import type { ImageVariantKey } from "@/lib/images/image-types";

function resolveAssetDisplayUrl(
  row: {
    legacyUrl?: string | null;
    manifest?: unknown;
    updatedAt?: string | null;
  },
  displayWidth: number,
  variant?: ImageVariantKey,
): string | null {
  const preferred = variant ?? pickResponsiveVariantKey(displayWidth);
  const manifest = parseImageManifest(row.manifest);
  const path = manifest?.variants?.[preferred]?.path ?? manifest?.variants?.md?.path;

  if (path) {
    return getAuthorAssetPublicUrl(path);
  }

  if (row.legacyUrl?.trim()) {
    return row.legacyUrl.trim();
  }

  if (row.updatedAt?.trim() && row.legacyUrl?.trim()) {
    return buildCoverDisplayUrl(row.legacyUrl, row.updatedAt);
  }

  return row.legacyUrl?.trim() || null;
}

export function resolveAuthorAvatarUrl(
  row: {
    avatar_url?: string | null;
    avatar_image?: unknown;
    updated_at?: string | null;
  },
  displayWidth = 104,
  variant?: ImageVariantKey,
): string | null {
  return resolveAssetDisplayUrl(
    {
      legacyUrl: row.avatar_url,
      manifest: row.avatar_image,
      updatedAt: row.updated_at,
    },
    displayWidth,
    variant,
  );
}

export function resolveAuthorBannerUrl(
  row: {
    banner_url?: string | null;
    banner_image?: unknown;
    updated_at?: string | null;
  },
  displayWidth = 1280,
  variant?: ImageVariantKey,
): string | null {
  const preferred =
    variant ??
    (displayWidth <= 640 ? "sm" : displayWidth <= 1280 ? "md" : "lg");
  const manifest = parseImageManifest(row.banner_image);
  const path =
    manifest?.variants?.[preferred]?.path ?? manifest?.variants?.md?.path;

  if (path) {
    return getAuthorAssetPublicUrl(path);
  }

  return row.banner_url?.trim() || null;
}

export function resolveProductCoverUrl(
  row: {
    cover_url?: string | null;
    cover_image?: unknown;
    updated_at?: string | null;
  },
  displayWidth = 168,
  variant?: ImageVariantKey,
): string | null {
  const preferred = variant ?? pickResponsiveVariantKey(displayWidth);
  const manifest = parseImageManifest(row.cover_image);
  const fromManifest = buildCoverDisplayUrlFromManifest(
    manifest,
    row.cover_url,
    preferred,
  );

  if (fromManifest) {
    return fromManifest;
  }

  return buildCoverDisplayUrl(row.cover_url, row.updated_at);
}

export function resolveProductCoverPublicPath(
  manifest: unknown,
  fallbackPath: string | null,
  preferredKey: ImageVariantKey = "lg",
): string | null {
  const parsed = parseImageManifest(manifest);
  const variantPath = parsed?.variants?.[preferredKey]?.path ?? parsed?.variants?.lg?.path;

  if (variantPath) {
    return variantPath;
  }

  return fallbackPath;
}

export function resolvePublicStorageUrl(
  bucket: "practice-covers",
  path: string,
): string {
  if (bucket === "practice-covers") {
    return getCoverPublicUrl(path);
  }

  return path;
}

export { buildCoverDisplayUrl, getCoverPublicUrl };
