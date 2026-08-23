/**
 * In-tile catalog carousel helpers.
 * Slide 1 is the system 9:16 slide; slide 2+ are author slides.
 * No max slide count — 0, 1, 3, 8, 15 must all work.
 */

/**
 * Finger-down jitter on a ~134–200px tile. 7×4 (hypot≈8) is a tap,
 * not a swipe — do not use a single large hypot wall.
 */
export const CATALOG_SLIDE_TAP_JITTER_PX = 12;

/** Clear horizontal attempt: |dx| dominates and reaches this, even if snap-back reset scrollLeft. */
export const CATALOG_SLIDE_HORIZONTAL_INTENT_PX = 12;

/** Vertical-dominant page scroll: not a carousel swipe and not a PDP tap. */
export const CATALOG_SLIDE_VERTICAL_DOMINANCE_PX = 12;

export const CATALOG_SLIDE_SCROLL_TAP_PX = 2;

/** @deprecated Use CATALOG_SLIDE_TAP_JITTER_PX — kept for existing call sites. */
export const CATALOG_SLIDE_TAP_MAX_MOVE_PX = CATALOG_SLIDE_TAP_JITTER_PX;

export type CatalogAuthorSlide = {
  id: string;
  label: string;
  backgroundClassName: string;
  /** Reserved for later real author images; demo slides omit this. */
  imageSrc?: string | null;
};

export type CatalogSlidePointerIntent = "tap" | "swipe" | "vertical";

export type CatalogSlidePointerIntentInput = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startScrollLeft?: number;
  currentScrollLeft?: number;
  scrolled?: boolean;
  /** Browser started a horizontal pan (pointermove) even if snap-back reset scrollLeft. */
  horizontalIntent?: boolean;
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

export function didCatalogTileScrollerMove(
  startScrollLeft: number,
  currentScrollLeft: number,
): boolean {
  return Math.abs(currentScrollLeft - startScrollLeft) > CATALOG_SLIDE_SCROLL_TAP_PX;
}

export function hasCatalogSlideHorizontalIntent(dx: number, dy: number): boolean {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  return absX >= CATALOG_SLIDE_HORIZONTAL_INTENT_PX && absX > absY;
}

/**
 * Tap: truly small movement, carousel did not start horizontal scroll,
 * and there is no clear horizontal intent.
 * Swipe: |dx| dominates |dy|, or scrollLeft changed, or a horizontal pan started.
 * Vertical: |dy| dominates — catalog page scroll, not a swipe and not a PDP tap.
 */
export function resolveCatalogSlidePointerIntent(
  input: CatalogSlidePointerIntentInput,
): CatalogSlidePointerIntent {
  const dx = input.endX - input.startX;
  const dy = input.endY - input.startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const scrolled =
    input.scrolled === true ||
    (typeof input.startScrollLeft === "number" &&
      typeof input.currentScrollLeft === "number" &&
      didCatalogTileScrollerMove(input.startScrollLeft, input.currentScrollLeft));

  if (scrolled || input.horizontalIntent) {
    return "swipe";
  }

  if (
    absY >= CATALOG_SLIDE_VERTICAL_DOMINANCE_PX &&
    absY >= absX
  ) {
    return "vertical";
  }

  if (hasCatalogSlideHorizontalIntent(dx, dy)) {
    return "swipe";
  }

  return "tap";
}

export function shouldTreatCatalogSlidePointerAsTap(
  input: CatalogSlidePointerIntentInput,
): boolean {
  return resolveCatalogSlidePointerIntent(input) === "tap";
}

export function shouldAllowCatalogSlidePdpNavigation(
  intent: CatalogSlidePointerIntent,
): boolean {
  return intent === "tap";
}
