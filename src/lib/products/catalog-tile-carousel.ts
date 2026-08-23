/**
 * In-tile catalog carousel helpers.
 * Slide 1 is the system 9:16 slide; slide 2+ are author slides.
 * No max slide count — 0, 1, 3, 8, 15 must all work.
 */

export const CATALOG_SLIDE_TAP_MAX_MOVE_PX = 10;
export const CATALOG_SLIDE_SCROLL_TAP_PX = 2;

export type CatalogAuthorSlide = {
  id: string;
  label: string;
  backgroundClassName: string;
  /** Reserved for later real author images; demo slides omit this. */
  imageSrc?: string | null;
};

export function shouldShowCatalogTilePager(totalSlides: number): boolean {
  return totalSlides > 1;
}

export function formatCatalogTilePagerLabel(
  current: number,
  total: number,
): string {
  return `${current}/${total}`;
}

export function formatCatalogTilePagerAriaLabel(
  current: number,
  total: number,
): string {
  return `Слайд ${current} из ${total}`;
}

export function resolveCatalogTileSlideIndex(
  scrollLeft: number,
  viewportWidth: number,
  totalSlides: number,
): number {
  if (viewportWidth <= 0 || totalSlides <= 1) {
    return 1;
  }

  const raw = Math.round(scrollLeft / viewportWidth) + 1;
  return Math.min(totalSlides, Math.max(1, raw));
}

/**
 * Tap = little/no pointer movement and the scroller did not move.
 * Horizontal swipe and vertical-dominant page scroll are not taps
 * and must not navigate to the PDP.
 */
export function shouldTreatCatalogSlidePointerAsTap(input: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  scrolled?: boolean;
}): boolean {
  if (input.scrolled) {
    return false;
  }

  const dx = input.endX - input.startX;
  const dy = input.endY - input.startY;
  return Math.hypot(dx, dy) < CATALOG_SLIDE_TAP_MAX_MOVE_PX;
}

export function didCatalogTileScrollerMove(
  startScrollLeft: number,
  currentScrollLeft: number,
): boolean {
  return Math.abs(currentScrollLeft - startScrollLeft) > CATALOG_SLIDE_SCROLL_TAP_PX;
}
