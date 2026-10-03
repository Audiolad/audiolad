"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { buildWindowedHeroDots } from "@/lib/catalog/product-hero-gallery";
import {
  CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX,
  galleryPointerOpensProduct,
  type CatalogCardGalleryPage,
} from "@/lib/gallery/catalog-card-gallery";

type HorizontalSnapGalleryProps = {
  pages: readonly CatalogCardGalleryPage[];
  onActivate?: () => void;
};

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startScroll: number;
  pointerType: string;
};

export default function HorizontalSnapGallery({
  pages,
  onActivate,
}: HorizontalSnapGalleryProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const dragRef = useRef<Gesture | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const syncIndex = useCallback(() => {
    const node = scrollerRef.current;
    if (!node || node.clientWidth <= 0) return;
    const nextIndex = Math.round(node.scrollLeft / node.clientWidth);
    setActiveIndex(Math.min(pages.length - 1, Math.max(0, nextIndex)));
  }, [pages.length]);

  const scrollToIndex = useCallback((index: number) => {
    const node = scrollerRef.current;
    const next = Math.min(pages.length - 1, Math.max(0, index));
    if (!node) return;
    node.scrollTo({ left: next * node.clientWidth, behavior: "smooth" });
  }, [pages.length]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const node = scrollerRef.current;
    if (!node) return;
    const gesture: Gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: node.scrollLeft,
      pointerType: event.pointerType,
    };
    gestureRef.current = gesture;
    if (event.pointerType === "touch") return;
    dragRef.current = gesture;
    node.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const node = scrollerRef.current;
    if (!drag || !node || event.pointerId !== drag.pointerId) return;
    node.scrollLeft = drag.startScroll - (event.clientX - drag.startX);
  }, []);

  const stopDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const node = scrollerRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (node?.hasPointerCapture(event.pointerId)) {
      node.releasePointerCapture(event.pointerId);
    }
    if (node && node.clientWidth > 0) {
      const next = Math.round(node.scrollLeft / node.clientWidth);
      node.scrollTo({ left: next * node.clientWidth, behavior: "smooth" });
    }
    syncIndex();
  }, [syncIndex]);

  const handleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const node = scrollerRef.current;
    const deltaX = gesture ? event.clientX - gesture.startX : 0;
    const deltaY = gesture ? event.clientY - gesture.startY : 0;
    const scrolled = gesture && node
      ? Math.abs(node.scrollLeft - gesture.startScroll) >= CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX
      : false;
    if (scrolled || !galleryPointerOpensProduct(deltaX, deltaY)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onActivate?.();
  }, [onActivate]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToIndex(activeIndex + 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToIndex(activeIndex - 1);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate?.();
    }
  }, [activeIndex, onActivate, scrollToIndex]);

  const dots = buildWindowedHeroDots(activeIndex, pages.length);

  return (
    <div className="relative aspect-square w-full" data-mini-app-snap-gallery="">
      <div
        ref={scrollerRef}
        data-mini-app-snap-gallery-count={pages.length}
        className="mini-app-snap-gallery"
        onScroll={syncIndex}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="group"
        aria-label="Галерея изображений"
      >
        {pages.map((page) => (
          <div
            key={page.id}
            data-mini-app-snap-gallery-slide={page.id === "cover" ? "cover" : "slide"}
            className="mini-app-snap-gallery-slide"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.src}
              alt={page.alt}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Предыдущий слайд"
        data-mini-app-snap-gallery-prev=""
        className="absolute top-1/2 left-1 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg leading-none text-[#7042c5] shadow-[0_4px_10px_rgba(91,62,145,0.12)] sm:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-40"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          scrollToIndex(activeIndex - 1);
        }}
        disabled={activeIndex === 0}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Следующий слайд"
        data-mini-app-snap-gallery-next=""
        className="absolute top-1/2 right-1 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg leading-none text-[#7042c5] shadow-[0_4px_10px_rgba(91,62,145,0.12)] sm:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-40"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          scrollToIndex(activeIndex + 1);
        }}
        disabled={activeIndex >= pages.length - 1}
      >
        ›
      </button>

      <div
        data-mini-app-snap-gallery-dots=""
        className="pointer-events-none absolute bottom-1.5 left-0 right-0 z-10 flex justify-center gap-1"
        aria-hidden="true"
      >
        {dots.map((dot) => (
          <span
            key={dot.index}
            className={
              dot.active
                ? "h-1.5 w-2.5 rounded-full bg-white"
                : dot.edge
                  ? "h-1 w-1 self-center rounded-full bg-white/40"
                  : "h-1.5 w-1.5 rounded-full bg-white/55"
            }
          />
        ))}
      </div>
      <p
        data-mini-app-snap-gallery-counter=""
        className="pointer-events-none absolute top-1.5 right-1.5 z-10 rounded-full bg-black/35 px-1.5 py-0.5 text-[10px] tabular-nums text-white"
      >
        {activeIndex + 1} / {pages.length}
      </p>
    </div>
  );
}
