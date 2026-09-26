"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type BusinessSnapCarouselProps = {
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
};

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
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

export default function BusinessSnapCarousel({
  ariaLabel,
  prevLabel,
  nextLabel,
  children,
}: BusinessSnapCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    setCanScrollPrev(scroller.scrollLeft > 4);
    setCanScrollNext(scroller.scrollLeft < maxScrollLeft - 4);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
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
  }, [updateScrollState]);

  const scrollByStep = useCallback(
    (direction: -1 | 1) => {
      const scroller = scrollerRef.current;
      const item = scroller?.querySelector<HTMLElement>("[data-business-snap-item]");

      if (!scroller || !item) {
        return;
      }

      const styles = window.getComputedStyle(scroller);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "12") || 12;

      scroller.scrollBy({
        left: direction * (item.offsetWidth + gap),
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    },
    [prefersReducedMotion],
  );

  return (
    <div className="business-snap-shell">
      <div className="business-snap-nav">
        <button
          type="button"
          aria-label={prevLabel}
          disabled={!canScrollPrev}
          onClick={() => scrollByStep(-1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          disabled={!canScrollNext}
          onClick={() => scrollByStep(1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>
      <div
        ref={scrollerRef}
        className="business-snap"
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollByStep(-1);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollByStep(1);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
