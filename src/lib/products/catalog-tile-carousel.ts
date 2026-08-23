/**
 * In-tile catalog carousel helpers.
 * Slide 1 is the system 3:4 slide; slide 2+ are author slides.
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

/**
 * One slide = one scroller viewport. Do not use min-width:100% as the
 * width lock — that is a floor, so an intrinsically taller child
 * (Slide 1 cover+info+Play) can grow past clientWidth (219px at 390).
 */
export const CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME =
  "h-full w-full min-w-0 shrink-0 grow-0 basis-full snap-start";

/** Width = scroller.clientWidth; height follows the carousel 3:4 frame. */
export function resolveCatalogTileSlideViewport(scrollerClientWidth: number): {
  width: number;
  height: number;
} {
  if (scrollerClientWidth <= 0) {
    return { width: 0, height: 0 };
  }

  return {
    width: scrollerClientWidth,
    height: (scrollerClientWidth * 4) / 3,
  };
}

/** Snap offsets must be 0, clientWidth, 2×clientWidth, … — never a 219-then-169 step. */
export function resolveCatalogTileSnapPositions(
  scrollerClientWidth: number,
  totalSlides: number,
): number[] {
  if (scrollerClientWidth <= 0 || totalSlides < 1) {
    return [];
  }

  return Array.from(
    { length: totalSlides },
    (_, index) => index * scrollerClientWidth,
  );
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

/**
 * Play sits inside the overflow-x scroller (`tabIndex={0}`).
 * A pointer click that leaves focus on Play — or disables Play so the
 * browser moves focus to that scroller — makes the next touch-drag a
 * no-op: scrollLeft never starts. The second gesture then works.
 * Pointer activations must blur to body; keyboard (detail=0) keeps focus.
 */
export function shouldBlurCatalogTilePlayAfterPointerClick(
  clickDetail: number,
): boolean {
  return clickDetail !== 0;
}

export function releaseCatalogTilePlayPointerFocus(
  target: { blur: () => void } | null | undefined,
): void {
  target?.blur();
}

export type CatalogTileCarouselGesturePhase = "idle" | "down";

/**
 * Pointer session for the in-tile scroller.
 * Play lives inside the overflow node, so its pointerdown/up bubble here.
 * A Play tap must not leave startX/pointerId/horizontalIntent mid-gesture.
 */
export type CatalogTileCarouselGesture = {
  phase: CatalogTileCarouselGesturePhase;
  pointerId: number | null;
  startX: number;
  startY: number;
  startScrollLeft: number;
  horizontalIntent: boolean;
  scrolled: boolean;
  suppressClick: boolean;
  startedOnControl: boolean;
};

const INTERACTIVE_GESTURE_TARGET_SELECTOR = "button, [data-catalog-tile-play]";

export function createIdleCatalogTileCarouselGesture(): CatalogTileCarouselGesture {
  return {
    phase: "idle",
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    horizontalIntent: false,
    scrolled: false,
    suppressClick: false,
    startedOnControl: false,
  };
}

export function isCatalogTileCarouselGestureIdle(
  gesture: CatalogTileCarouselGesture,
): boolean {
  return (
    gesture.phase === "idle" &&
    gesture.pointerId === null &&
    gesture.horizontalIntent === false &&
    gesture.scrolled === false &&
    gesture.startedOnControl === false &&
    gesture.startX === 0 &&
    gesture.startY === 0
  );
}

export function isCatalogTileCarouselInteractiveTarget(
  target: { closest?: (selector: string) => unknown } | null | undefined,
): boolean {
  return Boolean(
    target &&
      typeof target.closest === "function" &&
      target.closest(INTERACTIVE_GESTURE_TARGET_SELECTOR),
  );
}

export function beginCatalogTileCarouselGesture(
  input: {
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    isInteractiveTarget?: boolean;
  },
): CatalogTileCarouselGesture {
  return {
    phase: "down",
    pointerId: input.pointerId,
    startX: input.startX,
    startY: input.startY,
    startScrollLeft: input.startScrollLeft,
    horizontalIntent: false,
    scrolled: false,
    suppressClick: false,
    startedOnControl: Boolean(input.isInteractiveTarget),
  };
}

export function updateCatalogTileCarouselGesture(
  gesture: CatalogTileCarouselGesture,
  input: {
    pointerId: number;
    endX: number;
    endY: number;
    currentScrollLeft: number;
  },
): CatalogTileCarouselGesture {
  if (gesture.phase !== "down" || gesture.pointerId !== input.pointerId) {
    return gesture;
  }

  const dx = input.endX - gesture.startX;
  const dy = input.endY - gesture.startY;

  return {
    ...gesture,
    horizontalIntent:
      gesture.horizontalIntent || hasCatalogSlideHorizontalIntent(dx, dy),
    scrolled:
      gesture.scrolled ||
      didCatalogTileScrollerMove(gesture.startScrollLeft, input.currentScrollLeft),
  };
}

export function endCatalogTileCarouselGesture(
  gesture: CatalogTileCarouselGesture,
  input: {
    pointerId: number;
    endX: number;
    endY: number;
    currentScrollLeft: number;
  },
): {
  gesture: CatalogTileCarouselGesture;
  intent: CatalogSlidePointerIntent;
} {
  if (gesture.phase !== "down" || gesture.pointerId !== input.pointerId) {
    return {
      gesture: {
        ...createIdleCatalogTileCarouselGesture(),
        suppressClick: gesture.suppressClick,
      },
      intent: "tap",
    };
  }

  const scrolled =
    gesture.scrolled ||
    didCatalogTileScrollerMove(gesture.startScrollLeft, input.currentScrollLeft);
  const intent = resolveCatalogSlidePointerIntent({
    startX: gesture.startX,
    startY: gesture.startY,
    endX: input.endX,
    endY: input.endY,
    startScrollLeft: gesture.startScrollLeft,
    currentScrollLeft: input.currentScrollLeft,
    scrolled,
    horizontalIntent: gesture.horizontalIntent,
  });

  // A completed tap on Play must not suppress the button click.
  const suppressClick =
    !gesture.startedOnControl && !shouldAllowCatalogSlidePdpNavigation(intent);

  return {
    gesture: {
      ...createIdleCatalogTileCarouselGesture(),
      suppressClick,
    },
    intent,
  };
}

export function consumeCatalogTileCarouselClickSuppress(
  gesture: CatalogTileCarouselGesture,
): {
  gesture: CatalogTileCarouselGesture;
  suppressClick: boolean;
} {
  return {
    gesture: { ...gesture, suppressClick: false },
    suppressClick: gesture.suppressClick,
  };
}
