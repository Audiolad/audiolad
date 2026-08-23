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
import CatalogSystemProductSlide from "@/components/products/CatalogSystemProductSlide";
import type { CatalogProduct } from "@/lib/products/catalog";
import {
  beginCatalogTileCarouselGesture,
  CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME,
  consumeCatalogTileCarouselClickSuppress,
  createIdleCatalogTileCarouselGesture,
  endCatalogTileCarouselGesture,
  formatCatalogTilePagerAriaLabel,
  formatCatalogTilePagerLabel,
  isCatalogTileCarouselInteractiveTarget,
  resolveCatalogTileSlideIndex,
  shouldShowCatalogTilePager,
  updateCatalogTileCarouselGesture,
  type CatalogAuthorSlide as CatalogAuthorSlideModel,
} from "@/lib/products/catalog-tile-carousel";

type CatalogProductCarouselCardProps = {
  product: CatalogProduct;
  authorSlides: readonly CatalogAuthorSlideModel[];
  playControl?: ReactNode;
};

/**
 * In-tile carousel: Slide 1 = auto-height system card, Slide 2+ match that height.
 * Native overflow-x + scroll-snap. No Swiper/Embla.
 */
export default function CatalogProductCarouselCard({
  product,
  authorSlides,
  playControl,
}: CatalogProductCarouselCardProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef(createIdleCatalogTileCarouselGesture());
  const totalSlides = 1 + authorSlides.length;
  const showPager = shouldShowCatalogTilePager(totalSlides);
  const [currentIndex, setCurrentIndex] = useState(1);

  const syncIndexFromScroll = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    if (gestureRef.current.phase === "down") {
      gestureRef.current = updateCatalogTileCarouselGesture(gestureRef.current, {
        pointerId: gestureRef.current.pointerId ?? -1,
        endX: gestureRef.current.startX,
        endY: gestureRef.current.startY,
        currentScrollLeft: scroller.scrollLeft,
      });
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
    const ended = endCatalogTileCarouselGesture(gestureRef.current, {
      pointerId: event.pointerId,
      endX: event.clientX,
      endY: event.clientY,
      currentScrollLeft: scroller?.scrollLeft ?? 0,
    });
    gestureRef.current = ended.gesture;
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;

    if (gestureRef.current.phase === "down") {
      const abandoned = endCatalogTileCarouselGesture(gestureRef.current, {
        pointerId: gestureRef.current.pointerId ?? event.pointerId,
        endX: event.clientX,
        endY: event.clientY,
        currentScrollLeft: scroller?.scrollLeft ?? 0,
      });
      gestureRef.current = abandoned.gesture;
    }

    gestureRef.current = beginCatalogTileCarouselGesture({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scroller?.scrollLeft ?? 0,
      isInteractiveTarget: isCatalogTileCarouselInteractiveTarget(
        event.target as { closest?: (selector: string) => unknown } | null,
      ),
    });
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;

    gestureRef.current = updateCatalogTileCarouselGesture(gestureRef.current, {
      pointerId: event.pointerId,
      endX: event.clientX,
      endY: event.clientY,
      currentScrollLeft: scroller?.scrollLeft ?? 0,
    });
  }, []);

  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const consumed = consumeCatalogTileCarouselClickSuppress(gestureRef.current);
    gestureRef.current = consumed.gesture;

    if (!consumed.suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
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
      className="relative w-full overflow-hidden rounded-[18px]"
      data-catalog-tile-carousel=""
      data-catalog-tile-carousel-height="content"
    >
      <div
        ref={scrollerRef}
        role="region"
        tabIndex={0}
        aria-label={`Слайды «${product.title}»`}
        data-catalog-tile-carousel-scroller=""
        className="catalog-tile-carousel flex w-full items-stretch"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onLostPointerCapture={finishGesture}
        onClickCapture={handleClickCapture}
        onDragStartCapture={handleDragStartCapture}
        onScroll={syncIndexFromScroll}
        onKeyDown={handleKeyDown}
      >
        <div
          className={CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME}
          data-catalog-tile-slide="system"
        >
          <CatalogSystemProductSlide
            product={product}
            playControl={playControl}
            layout="fill"
          />
        </div>
        {authorSlides.map((slide) => (
          <div
            key={slide.id}
            className={CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME}
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
