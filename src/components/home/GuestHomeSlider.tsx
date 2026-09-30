"use client";

import Image, { getImageProps } from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import {
  GUEST_HOME_SLIDES,
  type GuestHomeSlide,
} from "@/lib/home/guest-slider";

const TAP_MOVE_THRESHOLD_PX = 8;
const MOBILE_SLIDE_SIZES = "(max-width: 430px) calc(100vw - 2.5rem), 520px";
const DESKTOP_SLIDE_SIZES = "(min-width: 1024px) 42rem, 520px";
const DESKTOP_SLIDE_MEDIA = "(min-width: 1024px)";

function GuestHomeSlideImage({
  slide,
  priority,
}: {
  slide: GuestHomeSlide;
  priority: boolean;
}) {
  if (!slide.desktopSrc) {
    return (
      <Image
        src={slide.src}
        alt=""
        fill
        priority={priority}
        sizes={MOBILE_SLIDE_SIZES}
        className="object-contain"
        draggable={false}
      />
    );
  }

  const mobile = getImageProps({
    src: slide.src,
    alt: "",
    fill: true,
    sizes: MOBILE_SLIDE_SIZES,
    className: "object-contain",
  }).props;
  const desktop = getImageProps({
    src: slide.desktopSrc,
    alt: "",
    fill: true,
    sizes: DESKTOP_SLIDE_SIZES,
  }).props;

  return (
    <picture>
      <source
        media={DESKTOP_SLIDE_MEDIA}
        srcSet={desktop.srcSet}
        sizes={desktop.sizes}
      />
      <img
        {...mobile}
        alt=""
        draggable={false}
        fetchPriority={priority ? "high" : "auto"}
        loading={priority ? "eager" : "lazy"}
      />
    </picture>
  );
}

export default function GuestHomeSlider() {
  const trackRef = useRef<HTMLUListElement>(null);
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const updateActive = () => {
      const slides = [
        ...track.querySelectorAll<HTMLElement>("[data-guest-home-slide]"),
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
      "[data-guest-home-slide]",
    )[index];

    if (!track || !slide) {
      return;
    }

    track.scrollTo({
      left: slide.offsetLeft,
      behavior: "smooth",
    });
  };

  const scrollToPreviousSlide = () => {
    const previousIndex =
      (activeIndex - 1 + GUEST_HOME_SLIDES.length) % GUEST_HOME_SLIDES.length;
    scrollToSlide(previousIndex);
  };

  const scrollToNextSlide = () => {
    const nextIndex = (activeIndex + 1) % GUEST_HOME_SLIDES.length;
    scrollToSlide(nextIndex);
  };

  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    pointerOriginRef.current = { x: event.clientX, y: event.clientY };
    suppressClickRef.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    const origin = pointerOriginRef.current;
    if (!origin) {
      return;
    }

    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;

    if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD_PX * TAP_MOVE_THRESHOLD_PX) {
      suppressClickRef.current = true;
    }
  };

  const onPointerCancel = () => {
    pointerOriginRef.current = null;
  };

  const onSlideClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onTrackKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToSlide(Math.min(activeIndex + 1, GUEST_HOME_SLIDES.length - 1));
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToSlide(Math.max(activeIndex - 1, 0));
    }
  };

  return (
    <section
      className="guest-home-slider"
      aria-label="Возможности АудиоЛада"
      data-guest-home-slider
    >
      <div className="guest-home-slider__viewport">
        <ul
          ref={trackRef}
          className="guest-home-slider__track"
          aria-label="Слайды для гостей"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerCancel}
          onPointerCancel={onPointerCancel}
          onKeyDown={onTrackKeyDown}
        >
          {GUEST_HOME_SLIDES.map((slide, index) => (
            <li key={slide.id} className="guest-home-slider__item">
              <Link
                href={slide.href}
                target={slide.target}
                rel={slide.rel}
                aria-label={slide.ariaLabel}
                data-guest-home-slide={slide.id}
                className="guest-home-slider__link"
                onClick={onSlideClick}
              >
                <span className="guest-home-slider__media">
                  <GuestHomeSlideImage
                    slide={slide}
                    priority={index === 0}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="guest-home-slider__arrow guest-home-slider__arrow--previous"
          aria-label="Предыдущий слайд"
          onClick={scrollToPreviousSlide}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="m15 18-6-6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className="guest-home-slider__arrow guest-home-slider__arrow--next"
          aria-label="Следующий слайд"
          onClick={scrollToNextSlide}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="m9 18 6-6-6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <nav
        className="guest-home-slider__dots"
        aria-label="Слайды гостевой главной"
      >
        {GUEST_HOME_SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            data-guest-home-dot={slide.id}
            aria-label={`Перейти к слайду ${index + 1}`}
            aria-current={index === activeIndex ? "true" : undefined}
            className={
              index === activeIndex
                ? "guest-home-slider__dot guest-home-slider__dot--active"
                : "guest-home-slider__dot"
            }
            onClick={() => scrollToSlide(index)}
          />
        ))}
      </nav>
    </section>
  );
}
