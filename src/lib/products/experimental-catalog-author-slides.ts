import type { CatalogProduct } from "@/lib/products/catalog";
import type { CatalogAuthorSlide } from "@/lib/products/catalog-tile-carousel";

/**
 * Temporary demo author slides for /experimental/catalog-tiles only.
 * Not stored in the database. Not used by production /catalog.
 */
export const EXPERIMENTAL_AUTHOR_SLIDE_COUNTS = [
  0, 1, 3, 4, 8, 15, 0, 3,
] as const;

const AUTHOR_SLIDE_BACKGROUNDS = [
  "bg-gradient-to-br from-[#4b2d8a] to-[#1f1238]",
  "bg-gradient-to-br from-[#2d6a8a] to-[#123038]",
  "bg-gradient-to-br from-[#8a4b2d] to-[#381f12]",
  "bg-gradient-to-br from-[#2d8a5a] to-[#12381f]",
  "bg-gradient-to-br from-[#8a2d5a] to-[#38121f]",
  "bg-gradient-to-br from-[#2d4b8a] via-[#5a2d8a] to-[#1f1238]",
] as const;

function hashProductId(productId: string): number {
  let hash = 0;

  for (const character of productId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function resolveExperimentalAuthorSlideCount(productId: string): number {
  return EXPERIMENTAL_AUTHOR_SLIDE_COUNTS[
    hashProductId(productId) % EXPERIMENTAL_AUTHOR_SLIDE_COUNTS.length
  ];
}

export function buildExperimentalAuthorSlides(
  product: Pick<CatalogProduct, "id" | "title">,
  count: number,
): CatalogAuthorSlide[] {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => ({
    id: `${product.id}-author-slide-${index + 2}`,
    label: `Слайд ${index + 2}`,
    backgroundClassName:
      AUTHOR_SLIDE_BACKGROUNDS[index % AUTHOR_SLIDE_BACKGROUNDS.length],
  }));
}

export function getExperimentalCatalogAuthorSlides(
  product: CatalogProduct,
): CatalogAuthorSlide[] {
  return buildExperimentalAuthorSlides(
    product,
    resolveExperimentalAuthorSlideCount(product.id),
  );
}
