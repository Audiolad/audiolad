import type { CatalogSlide } from "@/lib/catalog/dto";

export const CATALOG_GALLERY_MAX_SLIDES = 30;

function asFinitePosition(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * Showcase slides only. Empty gallery is valid.
 * Does not change class, access, offer, or summary.
 */
export function normalizeCatalogGallery(
  slides: ReadonlyArray<Partial<CatalogSlide> | null | undefined> | null | undefined,
): CatalogSlide[] {
  if (!Array.isArray(slides) || slides.length === 0) {
    return [];
  }

  return slides
    .flatMap((slide, index) => {
      const imageUrl = slide?.image_url?.trim();

      if (!imageUrl) {
        return [];
      }

      const id = slide.id?.trim() || `slide-${index}`;

      return [
        {
          id,
          image_url: imageUrl,
          position: asFinitePosition(slide.position),
          alt: slide.alt?.trim() || "",
        } satisfies CatalogSlide,
      ];
    })
    .sort((left, right) => {
      if (left.position !== right.position) {
        return left.position - right.position;
      }

      return left.id.localeCompare(right.id);
    })
    .slice(0, CATALOG_GALLERY_MAX_SLIDES);
}
