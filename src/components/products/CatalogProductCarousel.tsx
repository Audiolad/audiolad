"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CatalogProductCard from "@/components/products/CatalogProductCard";
import type { CatalogProduct } from "@/lib/products/catalog";

type CatalogProductCarouselProps = {
  title: string;
  products: CatalogProduct[];
  ariaLabel: string;
  prevAriaLabel: string;
  nextAriaLabel: string;
};

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={direction === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CatalogProductCarousel({
  title,
  products,
  ariaLabel,
  prevAriaLabel,
  nextAriaLabel,
}: CatalogProductCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      setCanScrollPrev(false);
      setCanScrollNext(false);
      return;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    setCanScrollPrev(scroller.scrollLeft > 4);
    setCanScrollNext(scroller.scrollLeft < maxScrollLeft - 4);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      setPrefersReducedMotion(media.matches);
    };

    syncMotionPreference();
    media.addEventListener("change", syncMotionPreference);

    return () => {
      media.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    updateScrollState();

    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    scroller.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      scroller.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [products, updateScrollState]);

  const scrollByOneStep = useCallback(
    (direction: -1 | 1) => {
      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      const firstItem = scroller.querySelector<HTMLElement>(
        "[data-catalog-carousel-item]",
      );

      if (!firstItem) {
        return;
      }

      const gap = 12;
      const step = firstItem.offsetWidth + gap;

      scroller.scrollBy({
        left: direction * step,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [prefersReducedMotion],
  );

  const showArrows = canScrollPrev || canScrollNext;

  return (
    <section className="mt-8" aria-label={ariaLabel}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-semibold">{title}</h2>

        {showArrows ? (
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              aria-label={prevAriaLabel}
              disabled={!canScrollPrev}
              onClick={() => scrollByOneStep(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] transition enabled:hover:border-[#c6afe6] enabled:hover:bg-[#faf6ff] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              aria-label={nextAriaLabel}
              disabled={!canScrollNext}
              onClick={() => scrollByOneStep(1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e4d7f4] text-[#7042c5] transition enabled:hover:border-[#c6afe6] enabled:hover:bg-[#faf6ff] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <ChevronIcon direction="right" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        tabIndex={0}
        className="catalog-carousel mt-4 flex gap-3 overflow-x-auto pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7042c5]"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollByOneStep(-1);
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollByOneStep(1);
          }
        }}
      >
        {products.map((product) => (
          <div
            key={product.id}
            data-catalog-carousel-item
            className="catalog-carousel__item shrink-0 snap-start"
          >
            <CatalogProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
