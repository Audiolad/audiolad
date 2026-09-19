"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  MEDITATION_AUTHORS_LANDING_BENEFITS,
  type MeditationAuthorsBenefit,
} from "@/lib/seo/meditation-authors-landing";

function BenefitVisual({ benefit }: { benefit: MeditationAuthorsBenefit }) {
  if (benefit.src) {
    return (
      <Image
        src={benefit.src}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 85vw, 28rem"
        loading="lazy"
        draggable={false}
      />
    );
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#f7f2ff] via-[#faf7ff] to-[#efe6f8] px-5 text-center text-sm leading-6 text-[#7d70a2]"
      role="img"
      aria-label={benefit.visualLabel}
    >
      {benefit.visualLabel}
    </div>
  );
}

function formatSlideIndex(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export default function MeditationAuthorsBenefitsSlider() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastIndex = MEDITATION_AUTHORS_LANDING_BENEFITS.length - 1;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const updateActive = () => {
      const slides = [
        ...track.querySelectorAll<HTMLElement>("[data-mal-benefit-slide]"),
      ];
      if (slides.length === 0) {
        return;
      }

      const trackLeft = track.scrollLeft;
      let nearest = 0;
      let nearestDist = Number.POSITIVE_INFINITY;

      for (let index = 0; index < slides.length; index += 1) {
        const dist = Math.abs(slides[index].offsetLeft - trackLeft);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = index;
        }
      }

      setActiveIndex(nearest);
    };

    updateActive();
    track.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);

    return () => {
      track.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  const scrollToSlide = (index: number) => {
    const track = trackRef.current;
    const slide = track?.querySelectorAll<HTMLElement>(
      "[data-mal-benefit-slide]",
    )[index];

    if (!track || !slide) {
      return;
    }

    track.scrollTo({
      left: slide.offsetLeft,
      behavior: "smooth",
    });
  };

  const onTrackKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToSlide(Math.min(activeIndex + 1, lastIndex));
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToSlide(Math.max(activeIndex - 1, 0));
    }
  };

  return (
    <div className="mal-benefits-slider" data-mal-benefits-slider>
      <div className="mal-benefits-slider__viewport">
        <button
          type="button"
          className="mal-benefits-slider__arrow mal-benefits-slider__arrow--prev"
          aria-label="Предыдущий слайд"
          disabled={activeIndex === 0}
          onClick={() => scrollToSlide(Math.max(activeIndex - 1, 0))}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 6 9 12l6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <ul
          ref={trackRef}
          className="mal-benefits-slider__track"
          aria-label="Преимущества для авторов медитаций"
          tabIndex={0}
          onKeyDown={onTrackKeyDown}
        >
          {MEDITATION_AUTHORS_LANDING_BENEFITS.map((benefit, index) => (
            <li
              key={benefit.id}
              className="mal-benefits-slider__item"
              data-mal-benefit-slide={benefit.id}
            >
              <article className="flex h-full flex-col overflow-hidden rounded-[24px] border border-[#e8def5] bg-white shadow-[0_10px_24px_rgba(90,60,145,0.06)]">
                <div className="mal-benefits-slider__media">
                  <BenefitVisual benefit={benefit} />
                </div>
                <div className="flex flex-1 flex-col gap-2 px-4 py-4 sm:gap-2.5 sm:px-5 sm:py-5">
                  <p className="mal-benefits-slider__index" aria-hidden="true">
                    {formatSlideIndex(index)}
                  </p>
                  <h3 className="text-base font-semibold tracking-tight text-[#25135c] sm:text-lg">
                    <span className="sr-only">{formatSlideIndex(index)}. </span>
                    {benefit.title}
                  </h3>
                  <p className="text-[15px] leading-6 text-[#4a3d73] sm:text-base sm:leading-7">
                    {benefit.text}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="mal-benefits-slider__arrow mal-benefits-slider__arrow--next"
          aria-label="Следующий слайд"
          disabled={activeIndex === lastIndex}
          onClick={() => scrollToSlide(Math.min(activeIndex + 1, lastIndex))}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m9 6 6 6-6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <nav className="mal-benefits-slider__dots" aria-label="Слайды преимуществ">
        {MEDITATION_AUTHORS_LANDING_BENEFITS.map((benefit, index) => (
          <button
            key={benefit.id}
            type="button"
            aria-label={`Перейти к слайду ${index + 1}: ${benefit.title}`}
            aria-current={index === activeIndex ? "true" : undefined}
            className={
              index === activeIndex
                ? "mal-benefits-slider__dot mal-benefits-slider__dot--active"
                : "mal-benefits-slider__dot"
            }
            onClick={() => scrollToSlide(index)}
          />
        ))}
      </nav>
    </div>
  );
}
