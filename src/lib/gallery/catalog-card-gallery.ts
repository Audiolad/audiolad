import type { MaxCatalogGallerySlide, MaxCatalogProduct } from "@/lib/max/catalog-product";

/** Movement at or above this is a swipe or scroll, not a product open. */
export const CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX = 8;

export type CatalogCardGalleryPage = {
  id: string;
  src: string;
  alt: string;
};

/**
 * Cover is the first frame. Publication slides follow in position order.
 * A product with no extra slides is a single cover page.
 */
export function buildCatalogCardGalleryPages(
  product: Pick<MaxCatalogProduct, "coverUrl" | "gallery">,
): CatalogCardGalleryPage[] {
  const slides = [...product.gallery]
    .filter((slide) => slide.image_url.trim().length > 0)
    .sort((left, right) => compareSlides(left, right));
  const pages: CatalogCardGalleryPage[] = [];

  if (product.coverUrl) {
    pages.push({ id: "cover", src: product.coverUrl, alt: "" });
  }

  for (const slide of slides) {
    pages.push({
      id: slide.id,
      src: slide.image_url,
      alt: slide.alt,
    });
  }

  return pages;
}

export function shouldRenderCatalogCardGallery(pageCount: number): boolean {
  return pageCount > 1;
}

/**
 * A tap opens the product. Horizontal swipe and vertical page-scroll
 * movement do not.
 */
export function galleryPointerOpensProduct(deltaX: number, deltaY: number): boolean {
  return (
    Math.abs(deltaX) < CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX &&
    Math.abs(deltaY) < CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX
  );
}

function compareSlides(left: MaxCatalogGallerySlide, right: MaxCatalogGallerySlide): number {
  if (left.position !== right.position) {
    return left.position - right.position;
  }

  return left.id.localeCompare(right.id);
}
