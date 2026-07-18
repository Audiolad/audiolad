import { getCoverPublicUrl } from "@/lib/author-products/utils";
import { getAuthorAssetPublicUrl } from "@/lib/authors/assets";
import {
  getManifestVariantPath,
  isOriginalStoragePath,
  parseImageManifest,
} from "@/lib/images/image-manifest";
import type { ImageManifest, ImageVariantKey } from "@/lib/images/image-types";

export type ImageDisplaySource = {
  manifest?: ImageManifest | null;
  legacyUrl?: string | null;
  legacyPath?: string | null;
  resolveSignedUrl?: (path: string) => Promise<string | null>;
  resolvePublicUrl?: (path: string) => string | null;
};

export function pickResponsiveVariantKey(
  renderedWidth: number,
): ImageVariantKey {
  if (renderedWidth <= 72) {
    return "xs";
  }

  if (renderedWidth <= 160) {
    return "sm";
  }

  if (renderedWidth <= 360) {
    return "md";
  }

  if (renderedWidth <= 720) {
    return "lg";
  }

  return "xl";
}

function pickFallbackVariantKeys(preferred: ImageVariantKey): ImageVariantKey[] {
  const order: ImageVariantKey[] = ["xs", "sm", "md", "lg", "xl"];
  const start = order.indexOf(preferred);

  if (start === -1) {
    return ["md", "lg", "sm", "xl", "xs"];
  }

  const larger = order.slice(start);
  const smaller = order.slice(0, start).reverse();

  return [...larger, ...smaller];
}

export function resolveVariantPathFromManifest(
  manifest: ImageManifest | null | undefined,
  preferredKey: ImageVariantKey,
): string | null {
  const parsed = manifest ? parseImageManifest(manifest) ?? manifest : null;

  if (!parsed) {
    return null;
  }

  for (const key of pickFallbackVariantKeys(preferredKey)) {
    const path = getManifestVariantPath(parsed, key);

    if (path && !isOriginalStoragePath(path)) {
      return path;
    }
  }

  const placeholderPath = getManifestVariantPath(parsed, "placeholder");

  if (placeholderPath && !isOriginalStoragePath(placeholderPath)) {
    return placeholderPath;
  }

  return null;
}

export async function resolveImageDisplayUrl(
  source: ImageDisplaySource,
  preferredKey: ImageVariantKey,
): Promise<string | null> {
  const manifestPath = resolveVariantPathFromManifest(source.manifest, preferredKey);

  if (manifestPath) {
    if (source.resolveSignedUrl) {
      const signed = await source.resolveSignedUrl(manifestPath);

      if (signed) {
        return signed;
      }
    }

    if (source.resolvePublicUrl) {
      return source.resolvePublicUrl(manifestPath);
    }
  }

  if (source.legacyUrl?.trim()) {
    return source.legacyUrl.trim();
  }

  if (source.legacyPath?.trim()) {
    if (source.resolveSignedUrl) {
      return source.resolveSignedUrl(source.legacyPath.trim());
    }

    if (source.resolvePublicUrl) {
      return source.resolvePublicUrl(source.legacyPath.trim());
    }
  }

  return null;
}

export function resolvePracticeCoverPublicUrl(storagePath: string): string {
  return getCoverPublicUrl(storagePath);
}

export function resolveAuthorAssetPublicUrl(storagePath: string): string {
  return getAuthorAssetPublicUrl(storagePath);
}

export function buildCoverDisplayUrlFromManifest(
  manifest: ImageManifest | null | undefined,
  legacyUrl: string | null | undefined,
  preferredKey: ImageVariantKey = "md",
): string | null {
  const path = resolveVariantPathFromManifest(manifest, preferredKey);

  if (path) {
    return resolvePracticeCoverPublicUrl(path);
  }

  return legacyUrl?.trim() || null;
}

export function getPlaceholderBlurFromManifest(
  manifest: ImageManifest | null | undefined,
): string | null {
  const parsed = parseImageManifest(manifest);

  if (!parsed?.placeholderBlurDataUrl?.trim()) {
    return null;
  }

  return parsed.placeholderBlurDataUrl.trim();
}

export function buildImageSrcSetFromManifest(
  manifest: ImageManifest | null | undefined,
  resolveUrl: (path: string) => string,
): string | null {
  const parsed = parseImageManifest(manifest);

  if (!parsed?.variants) {
    return null;
  }

  const entries: string[] = [];

  for (const [key, variant] of Object.entries(parsed.variants)) {
    if (key === "placeholder" || !variant?.path || !variant.width) {
      continue;
    }

    entries.push(`${resolveUrl(variant.path)} ${variant.width}w`);
  }

  if (entries.length === 0) {
    return null;
  }

  return entries.join(", ");
}

export type ImageFieldRecord = {
  cover_url?: string | null;
  cover_image?: unknown;
  cover_path?: string | null;
  avatar_url?: string | null;
  avatar_image?: unknown;
  avatar_path?: string | null;
  banner_url?: string | null;
  banner_image?: unknown;
  banner_path?: string | null;
  updated_at?: string | null;
};

export function getProductCoverImageSource(row: ImageFieldRecord): ImageDisplaySource {
  return {
    manifest: parseImageManifest(row.cover_image),
    legacyUrl: row.cover_url,
  };
}

export function getAuthorAvatarImageSource(row: ImageFieldRecord): ImageDisplaySource {
  return {
    manifest: parseImageManifest(row.avatar_image),
    legacyUrl: row.avatar_url,
    legacyPath: row.avatar_path,
    resolvePublicUrl: resolveAuthorAssetPublicUrl,
  };
}

export function getAuthorBannerImageSource(row: ImageFieldRecord): ImageDisplaySource {
  return {
    manifest: parseImageManifest(row.banner_image),
    legacyUrl: row.banner_url,
    legacyPath: row.banner_path,
    resolvePublicUrl: resolveAuthorAssetPublicUrl,
  };
}

export function getUserAvatarImageSource(row: ImageFieldRecord): ImageDisplaySource {
  return {
    manifest: parseImageManifest(row.avatar_image),
    legacyUrl: row.avatar_url,
    legacyPath: row.avatar_path,
  };
}

export function getPlaylistCoverImageSource(row: ImageFieldRecord): ImageDisplaySource {
  return {
    manifest: parseImageManifest(row.cover_image),
    legacyPath: row.cover_path,
  };
}
