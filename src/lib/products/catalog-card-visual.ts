import type { CatalogProduct } from "@/lib/products/catalog";
import {
  getProductCoverDisplayUrl,
  getProductCoverGradient,
  getProductCoverPlaceholder,
  getProductCoverSymbol,
} from "@/lib/products/cover-display";
import type { ImageManifest, ImageVariantKey } from "@/lib/images/image-types";
import { sanitizePublicImageManifest } from "@/lib/images/image-manifest";
import { resolvePracticeCoverPublicUrl } from "@/lib/images/image-url";

/**
 * Approximate CSS pixel width of a catalog tile cover in the 2/3/4-col grid.
 * `pickResponsiveVariantKey(200)` resolves to `md` (sm is only used ≤160px).
 */
export const CATALOG_TILE_DISPLAY_WIDTH = 200;

/** Small-tile variants only — never request lg/xl for this preview surface. */
export const CATALOG_TILE_VARIANT_KEYS = ["sm", "md"] as const satisfies readonly ImageVariantKey[];

export const CATALOG_TILE_IMAGE_SIZES = `${CATALOG_TILE_DISPLAY_WIDTH}px`;

export type CatalogCardFallbackMode = "square_blur" | "system";

/**
 * Reserved slot for a later CardVisuals gallery.
 * Phase 1 has no `visuals[]` / media gallery — always empty.
 */
export type CatalogCardAdditionalVisual = {
  src: string;
  kind: string;
};

export type CatalogCardVisualImage = {
  src: string;
  srcSet: string | null;
  sizes: string;
  placeholderBlurDataUrl: string | null;
};

export type CatalogCardSystemFallback = {
  gradientClassName: string;
  symbol: string;
};

export type CatalogCardVisual = {
  hasSquareCover: boolean;
  fallbackMode: CatalogCardFallbackMode;
  additionalVisuals: CatalogCardAdditionalVisual[];
  image: CatalogCardVisualImage | null;
  systemFallback: CatalogCardSystemFallback;
};

function buildTileSrcSet(manifest: ImageManifest | null): string | null {
  if (!manifest?.variants) {
    return null;
  }

  const entries: string[] = [];

  for (const key of CATALOG_TILE_VARIANT_KEYS) {
    const variant = manifest.variants[key];

    if (!variant?.path?.trim() || !variant.width) {
      continue;
    }

    entries.push(
      `${resolvePracticeCoverPublicUrl(variant.path.trim())} ${variant.width}w`,
    );
  }

  return entries.length > 0 ? entries.join(", ") : null;
}

/**
 * Presentation model for catalog tiles.
 *
 * Phase 1: square cover from existing CatalogProduct fields only.
 * `additionalVisuals` stays empty so a later CardVisuals path can replace
 * the square-blur FallbackVisual without rewriting the tile or listing.
 */
export function resolveCatalogCardVisual(
  product: CatalogProduct,
): CatalogCardVisual {
  const systemFallback: CatalogCardSystemFallback = {
    gradientClassName: getProductCoverGradient(product.slug),
    symbol: getProductCoverSymbol(product.slug),
  };

  const src = getProductCoverDisplayUrl(
    product.coverUrl,
    product.updatedAt,
    product.coverImage,
    CATALOG_TILE_DISPLAY_WIDTH,
  );
  const manifest = sanitizePublicImageManifest(product.coverImage);
  const placeholderBlurDataUrl = getProductCoverPlaceholder(product.coverImage);
  const hasSquareCover = Boolean(src);

  if (!src) {
    return {
      hasSquareCover: false,
      fallbackMode: "system",
      additionalVisuals: [],
      image: null,
      systemFallback,
    };
  }

  return {
    hasSquareCover,
    fallbackMode: "square_blur",
    additionalVisuals: [],
    image: {
      src,
      srcSet: buildTileSrcSet(manifest),
      sizes: CATALOG_TILE_IMAGE_SIZES,
      placeholderBlurDataUrl,
    },
    systemFallback,
  };
}
