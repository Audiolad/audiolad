"use client";

import {
  useCallback,
  useRef,
  useState,
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
  resolveCatalogTileSlideIndex,
  shouldShowCatalogTilePager,
  shouldTreatCatalogSlidePointerAsTap,
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
  suppressClick: boolean;
};

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
  const gestureRef = useRef<GestureState>({
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    suppressClick: false,
  });
  const totalSlides = 1 + authorSlides.length;
  const showPager = shouldShowCatalogTilePager(totalSlides);
  const [currentIndex, setCurrentIndex] = useState(1);

  const syncIndexFromScroll = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    setCurrentIndex(
      resolveCatalogTileSlideIndex(
        scroller.scrollLeft,
        scroller.clientWidth,
        totalSlides,
      ),
    );
  }, [totalSlides]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;

    gestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scroller?.scrollLeft ?? 0,
      suppressClick: false,
    };
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const gesture = gestureRef.current;
    const scrolled = didCatalogTileScrollerMove(
      gesture.startScrollLeft,
      scroller?.scrollLeft ?? gesture.startScrollLeft,
    );

    gestureRef.current.suppressClick = !shouldTreatCatalogSlidePointerAsTap({
      startX: gesture.startX,
      startY: gesture.startY,
      endX: event.clientX,
      endY: event.clientY,
      scrolled,
    });
  }, []);

  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!gestureRef.current.suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    gestureRef.current.suppressClick = false;
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
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClickCapture={handleClickCapture}
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
        {authorSlides.map((slide, index) => (
          <div
            key={slide.id}
            className="h-full min-w-full shrink-0 snap-start"
            data-catalog-tile-slide="author"
          >
            <CatalogAuthorSlide
              slide={slide}
              productHref={product.href}
              productTitle={product.title}
              tabIndex={currentIndex === index + 2 ? 0 : -1}
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
