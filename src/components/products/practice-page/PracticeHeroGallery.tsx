"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { ResponsiveCoverImage } from "@/components/images/ResponsiveImage";
import CatalogProductHeartButton from "@/components/products/CatalogProductHeartButton";
import type { CatalogListingItem } from "@/lib/catalog/listing-contract";
import {
  buildCoverFirstHeroSlides,
  shouldRenderProductHeroSlider,
} from "@/lib/catalog/product-hero-gallery";
import type { CatalogSlide } from "@/lib/catalog/dto";

import type { PracticePageCoverData } from "./types";

type PracticeHeroGalleryProps = {
  cover: PracticePageCoverData;
  slides: readonly CatalogSlide[];
  priority?: boolean;
  heartProduct?: CatalogListingItem | null;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
};

export default function PracticeHeroGallery({
  cover,
  slides,
  priority = false,
  heartProduct = null,
  isAuthenticated = false,
  signInReturnPath = "/catalog",
}: PracticeHeroGalleryProps) {
  const pages = buildCoverFirstHeroSlides(
    { displayUrl: cover.displayUrl, alt: cover.alt },
    slides,
  );
  const showSlider = shouldRenderProductHeroSlider(pages);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const syncIndex = useCallback(() => {
    const node = scrollerRef.current;

    if (!node || node.clientWidth <= 0) {
      return;
    }

    const nextIndex = Math.round(node.scrollLeft / node.clientWidth);
    setActiveIndex(Math.min(pages.length - 1, Math.max(0, nextIndex)));
  }, [pages.length]);

  const scrollToIndex = useCallback((index: number) => {
    const node = scrollerRef.current;
    const next = Math.min(pages.length - 1, Math.max(0, index));

    if (!node) {
      return;
    }

    node.scrollTo({
      left: next * node.clientWidth,
      behavior: "smooth",
    });
  }, [pages.length]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }

    const node = scrollerRef.current;

    if (!node) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: node.scrollLeft,
    };
    node.setPointerCapture(event.pointerId);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const node = scrollerRef.current;

    if (!drag || !node || event.pointerId !== drag.pointerId) {
      return;
    }

    node.scrollLeft = drag.startScroll - (event.clientX - drag.startX);
  }, []);

  const stopDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const node = scrollerRef.current;

    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    dragRef.current = null;

    if (node?.hasPointerCapture(event.pointerId)) {
      node.releasePointerCapture(event.pointerId);
    }

    syncIndex();
  }, [syncIndex]);

  const heart = heartProduct ? (
    <CatalogProductHeartButton
      product={heartProduct}
      isAuthenticated={isAuthenticated}
      signInReturnPath={signInReturnPath}
    />
  ) : null;

  if (!showSlider) {
    return (
      <div className="featured-card__cover relative">
        {cover.displayUrl ? (
          <ResponsiveCoverImage
            src={cover.responsive.src ?? cover.displayUrl}
            alt={cover.alt}
            manifest={cover.responsive.manifest}
            srcSet={cover.responsive.srcSet}
            sizes={cover.responsive.srcSet ? cover.responsive.sizes : undefined}
            displayWidth={cover.displayWidth}
            priority={priority}
            className="h-full w-full rounded-none"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${cover.gradient}`}
          >
            <span className="text-[90px] text-white">{cover.symbol}</span>
          </div>
        )}
        {heart}
      </div>
    );
  }

  return (
    <div
      data-practice-hero-gallery
      data-practice-hero-gallery-count={slides.length}
      className="featured-card__cover relative"
    >
      <div
        ref={scrollerRef}
        data-practice-hero-slider
        className="practice-hero-gallery"
        onScroll={syncIndex}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        {pages.map((page, index) => (
          <div
            key={page.id}
            data-practice-hero-slide={page.type}
            className="practice-hero-gallery-slide"
          >
            {page.type === "cover" && page.src ? (
              <ResponsiveCoverImage
                src={cover.responsive.src ?? page.src}
                alt={page.alt}
                manifest={cover.responsive.manifest}
                srcSet={cover.responsive.srcSet}
                sizes={cover.responsive.srcSet ? cover.responsive.sizes : undefined}
                displayWidth={cover.displayWidth}
                priority={priority && index === 0}
                draggable={false}
                className="h-full w-full rounded-none"
              />
            ) : page.type === "cover" ? (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-[90px] text-white">{cover.symbol}</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.src}
                alt={page.alt}
                className="h-full w-full rounded-none"
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label="Предыдущий слайд"
        data-practice-hero-gallery-prev
        className="absolute top-1/2 left-1.5 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg leading-none text-[#7042c5] shadow-[0_4px_10px_rgba(91,62,145,0.12)] sm:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-40"
        onClick={() => scrollToIndex(activeIndex - 1)}
        disabled={activeIndex === 0}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Следующий слайд"
        data-practice-hero-gallery-next
        className="absolute top-1/2 right-1.5 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-lg leading-none text-[#7042c5] shadow-[0_4px_10px_rgba(91,62,145,0.12)] sm:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:opacity-40"
        onClick={() => scrollToIndex(activeIndex + 1)}
        disabled={activeIndex >= pages.length - 1}
      >
        ›
      </button>

      <p
        data-practice-hero-gallery-counter
        className="pointer-events-none absolute right-2 bottom-2 z-10 text-[11px] tabular-nums text-[#25135c]/70"
      >
        {activeIndex + 1} / {pages.length}
      </p>

      {heart}
    </div>
  );
}
