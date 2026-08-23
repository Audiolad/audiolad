"use client";

import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import CatalogAuthorSlide from "@/components/products/CatalogAuthorSlide";
import CatalogSystemProductSlide, {
  CATALOG_SYSTEM_SLIDE_ASPECT_CLASS,
} from "@/components/products/CatalogSystemProductSlide";
import type { CatalogProduct } from "@/lib/products/catalog";
import {
  didCatalogTileScrollerMove,
  formatCatalogTilePagerAriaLabel,
  formatCatalogTilePagerLabel,
  hasCatalogSlideHorizontalIntent,
  resolveCatalogSlidePointerIntent,
  resolveCatalogTileSlideIndex,
  shouldAllowCatalogSlidePdpNavigation,
  shouldShowCatalogTilePager,
  type CatalogAuthorSlide as CatalogAuthorSlideModel,
} from "@/lib/products/catalog-tile-carousel";

type CatalogProductCarouselCardProps = {
  product: CatalogProduct;
  authorSlides: readonly CatalogAuthorSlideModel[];
  playControl?: ReactNode;
};

type GestureState = {
  startX: number;
  startY: number;
  startScrollLeft: number;
  horizontalIntent: boolean;
  scrolled: boolean;
  suppressClick: boolean;
};

function createIdleGesture(): GestureState {
  return {
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    horizontalIntent: false,
    scrolled: false,
    suppressClick: false,
  };
}

/**
 * In-tile 9:16 carousel: Slide 1 = system, Slide 2+ = author.
 * Native overflow-x + scroll-snap. No Swiper/Embla.
 */
export default function CatalogProductCarouselCard({
  product,
  authorSlides,
  playControl,
}: CatalogProductCarouselCardProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState>(createIdleGesture());
  const totalSlides = 1 + authorSlides.length;
  const showPager = shouldShowCatalogTilePager(totalSlides);
  const [currentIndex, setCurrentIndex] = useState(1);

  const syncIndexFromScroll = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    if (
      didCatalogTileScrollerMove(
        gestureRef.current.startScrollLeft,
        scroller.scrollLeft,
      )
    ) {
      gestureRef.current.scrolled = true;
    }

    const nextIndex = resolveCatalogTileSlideIndex(
      scroller.scrollLeft,
      scroller.clientWidth,
      totalSlides,
    );

    setCurrentIndex((current) => (current === nextIndex ? current : nextIndex));
  }, [totalSlides]);

  const finishGesture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const gesture = gestureRef.current;
    const currentScrollLeft = scroller?.scrollLeft ?? gesture.startScrollLeft;
    const scrolled =
      gesture.scrolled ||
      didCatalogTileScrollerMove(gesture.startScrollLeft, currentScrollLeft);
    const intent = resolveCatalogSlidePointerIntent({
      startX: gesture.startX,
      startY: gesture.startY,
      endX: event.clientX,
      endY: event.clientY,
      startScrollLeft: gesture.startScrollLeft,
      currentScrollLeft,
      scrolled,
      horizontalIntent: gesture.horizontalIntent,
    });

    gestureRef.current.suppressClick = !shouldAllowCatalogSlidePdpNavigation(intent);
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;

    gestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scroller?.scrollLeft ?? 0,
      horizontalIntent: false,
      scrolled: false,
      suppressClick: false,
    };
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const scroller = scrollerRef.current;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (hasCatalogSlideHorizontalIntent(dx, dy)) {
      gesture.horizontalIntent = true;
    }

    if (
      scroller &&
      didCatalogTileScrollerMove(gesture.startScrollLeft, scroller.scrollLeft)
    ) {
      gesture.scrolled = true;
    }
  }, []);

  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!gestureRef.current.suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    gestureRef.current.suppressClick = false;
  }, []);

  const handleDragStartCapture = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      event.preventDefault();
      const step = scroller.clientWidth;
      scroller.scrollBy({
        left: event.key === "ArrowRight" ? step : -step,
        behavior: "auto",
      });
    },
    [],
  );

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[18px] ${CATALOG_SYSTEM_SLIDE_ASPECT_CLASS}`}
      data-catalog-tile-carousel=""
      data-catalog-tile-carousel-aspect="9/16"
    >
      <div
        ref={scrollerRef}
        role="region"
        tabIndex={0}
        aria-label={`Слайды «${product.title}»`}
        data-catalog-tile-carousel-scroller=""
        className="catalog-tile-carousel flex h-full w-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onClickCapture={handleClickCapture}
        onDragStartCapture={handleDragStartCapture}
        onScroll={syncIndexFromScroll}
        onKeyDown={handleKeyDown}
      >
        <div
          className="h-full min-w-full shrink-0 snap-start"
          data-catalog-tile-slide="system"
        >
          <CatalogSystemProductSlide
            product={product}
            playControl={playControl}
          />
        </div>
        {authorSlides.map((slide) => (
          <div
            key={slide.id}
            className="h-full min-w-full shrink-0 snap-start"
            data-catalog-tile-slide="author"
          >
            <CatalogAuthorSlide
              slide={slide}
              productHref={product.href}
              productTitle={product.title}
            />
          </div>
        ))}
      </div>
      {showPager ? (
        <p
          className="pointer-events-none absolute top-1.5 right-1.5 z-10 rounded-full bg-[#25135c]/55 px-1.5 py-0.5 text-[10px] font-semibold leading-3 tracking-wide text-white"
          data-catalog-tile-pager=""
          aria-live="polite"
          aria-label={formatCatalogTilePagerAriaLabel(currentIndex, totalSlides)}
        >
          {formatCatalogTilePagerLabel(currentIndex, totalSlides)}
        </p>
      ) : null}
    </div>
  );
}
