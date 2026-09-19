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
        width={benefit.width}
        height={benefit.height}
        className="h-auto w-full object-cover"
        sizes="(max-width: 768px) 86vw, 28rem"
        loading="lazy"
        draggable={false}
      />
    );
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#f7f2ff] via-[#faf7ff] to-[#efe6f8] px-5 text-center text-sm leading-6 text-[#7d70a2]"
      role="img"
      aria-label={benefit.visualLabel}
    >
      {benefit.visualLabel}
    </div>
  );
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
      <ul
        ref={trackRef}
        className="mal-benefits-slider__track"
        aria-label="Преимущества для авторов медитаций"
        tabIndex={0}
        onKeyDown={onTrackKeyDown}
      >
        {MEDITATION_AUTHORS_LANDING_BENEFITS.map((benefit) => (
          <li
            key={benefit.id}
            className="mal-benefits-slider__item"
            data-mal-benefit-slide={benefit.id}
          >
            <article className="flex h-full flex-col overflow-hidden rounded-[28px] border border-[#e8def5] bg-white shadow-[0_12px_30px_rgba(90,60,145,0.06)]">
              <div
                className="relative aspect-[4/3] w-full overflow-hidden border-b border-[#efe6f8]"
                style={{ aspectRatio: `${benefit.width} / ${benefit.height}` }}
              >
                <BenefitVisual benefit={benefit} />
              </div>
              <div className="flex flex-1 flex-col gap-3 px-5 py-5 sm:px-6 sm:py-6">
                <h3 className="text-lg font-semibold tracking-tight text-[#25135c] sm:text-xl">
                  {benefit.title}
                </h3>
                <p className="text-base leading-7 text-[#4a3d73] sm:text-[17px] sm:leading-8">
                  {benefit.text}
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>

      <div className="mal-benefits-slider__nav" aria-hidden="false">
        <button
          type="button"
          className="mal-benefits-slider__arrow"
          aria-label="Предыдущий слайд"
          disabled={activeIndex === 0}
          onClick={() => scrollToSlide(Math.max(activeIndex - 1, 0))}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 6 9 12l6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="mal-benefits-slider__arrow"
          aria-label="Следующий слайд"
          disabled={activeIndex === lastIndex}
          onClick={() => scrollToSlide(Math.min(activeIndex + 1, lastIndex))}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
