"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { graduateCarouselEdges, graduateCarouselStep, type GraduateCarouselEdges } from "./carousel";

const idle: GraduateCarouselEdges = { overflow: false, canPrev: false, canNext: false };

function Chevron({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        d={direction === "prev" ? "M11.2 3.8 L6.2 9 L11.2 14.2" : "M6.8 3.8 L11.8 9 L6.8 14.2"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SchoolGraduateScroller({ children }: { children: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState(idle);

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    setEdges(graduateCarouselEdges(row.scrollLeft, row.scrollWidth, row.clientWidth));
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    for (const card of row.querySelectorAll(".school-graduates__card")) observer.observe(card);
    return () => {
      row.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  const scrollByCard = (direction: -1 | 1) => {
    const row = rowRef.current;
    const card = row?.querySelector<HTMLElement>(".school-graduates__card");
    if (!row || !card) return;
    const styles = getComputedStyle(row);
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollBy({
      left: graduateCarouselStep(card.getBoundingClientRect().width, gap, direction),
      behavior: reduce ? "auto" : "smooth",
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    scrollByCard(event.key === "ArrowRight" ? 1 : -1);
  };

  const scrollerClass = [
    "school-graduates__scroller",
    edges.overflow ? "is-overflow" : "",
    edges.canPrev ? "can-prev" : "",
    edges.canNext ? "can-next" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={scrollerClass} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="school-graduates__arrow school-graduates__arrow--prev"
        aria-label="Назад"
        aria-controls="graduate-products-row"
        hidden={!edges.canPrev}
        onClick={() => scrollByCard(-1)}
      >
        <Chevron direction="prev" />
      </button>
      <div className="school-graduates__viewport">
        <span className="school-graduates__fade school-graduates__fade--start" aria-hidden="true" />
        <span className="school-graduates__fade school-graduates__fade--end" aria-hidden="true" />
        <div
          id="graduate-products-row"
          ref={rowRef}
          role="region"
          aria-label="Продукты выпускников – прокрутите, чтобы увидеть все"
          tabIndex={0}
          className="school-graduates__row"
        >
          {children}
        </div>
      </div>
      <button
        type="button"
        className="school-graduates__arrow school-graduates__arrow--next"
        aria-label="Вперёд"
        aria-controls="graduate-products-row"
        hidden={!edges.canNext}
        onClick={() => scrollByCard(1)}
      >
        <Chevron direction="next" />
      </button>
    </div>
  );
}
