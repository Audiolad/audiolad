"use client";

import Image from "next/image";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

import { FOUR_CUPS_SLIDES } from "@/lib/business/vertical-guides/four-cups";

import GuideMaxButton from "./GuideMaxButton";

type GuideFourCupsProps = {
  question: string;
};

function nearestIndex(scroller: HTMLDivElement): number {
  const slides = [...scroller.querySelectorAll<HTMLElement>("[data-cup-slide]")];
  const left = scroller.scrollLeft;
  let closest = 0;
  let best = Number.POSITIVE_INFINITY;
  slides.forEach((slide, index) => {
    const delta = Math.abs(slide.offsetLeft - left);
    if (delta < best) {
      best = delta;
      closest = index;
    }
  });
  return closest;
}

export default function GuideFourCups({ question }: GuideFourCupsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = FOUR_CUPS_SLIDES.length;

  const syncIndex = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const next = nearestIndex(scroller);
    setIndex((current) => (current === next ? current : next));
  }, []);

  const go = useCallback((delta: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const slides = [...scroller.querySelectorAll<HTMLElement>("[data-cup-slide]")];
    if (slides.length === 0) {
      return;
    }
    const next = (nearestIndex(scroller) + delta + slides.length) % slides.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({
      left: slides[next]?.offsetLeft ?? 0,
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  const onArrowKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    go(event.key === "ArrowRight" ? 1 : -1);
  };

  return (
    <div className="guide-cups" data-coffee-cups="slider">
      <h2 id="guide-cups-title" className="guide-question">
        {question}
      </h2>
      <div
        className="guide-cups__frame"
        role="region"
        aria-roledescription="carousel"
        aria-label="Четыре чашки"
        onKeyDown={onArrowKey}
      >
        <button
          type="button"
          className="guide-cups__arrow guide-cups__arrow--prev"
          aria-label="Предыдущий слайд"
          onClick={() => go(-1)}
          onKeyDown={onArrowKey}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path
              d="M13.5 5.5 8 11l5.5 5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div
          className="guide-cups__scroller"
          ref={scrollerRef}
          onScroll={syncIndex}
        >
          {FOUR_CUPS_SLIDES.map((slide, slideIndex) => {
            const current = slideIndex === index;
            return (
              <div
                key={slide.src}
                className="guide-cups__slide"
                data-cup-slide
                role="group"
                aria-roledescription="slide"
                aria-label={`Слайд ${slideIndex + 1} из ${count}`}
                aria-hidden={current ? undefined : true}
              >
                <Image
                  src={slide.src}
                  alt={current ? slide.alt : ""}
                  fill
                  sizes="(min-width: 800px) 540px, 82vw"
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="guide-cups__arrow guide-cups__arrow--next"
          aria-label="Следующий слайд"
          onClick={() => go(1)}
          onKeyDown={onArrowKey}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path
              d="M8.5 5.5 14 11l-5.5 5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <p className="guide-cups__count" aria-live="polite">
        <span aria-hidden="true">
          {index + 1} / {count}
        </span>
        <span className="guide-sr">
          Слайд {index + 1} из {count}
        </span>
      </p>
      <GuideMaxButton placement="slider" />
    </div>
  );
}
