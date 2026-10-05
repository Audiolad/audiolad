"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { GUEST_HOME_SLIDES } from "@/lib/home/guest-slider";
import {
  beginMaxGuestSlideGesture,
  endMaxGuestSlidePointer,
  handleMaxGuestSlideAnchorClick,
  maxGuestSlideAnchorHref,
  maxGuestSlideClickActivates,
  moveMaxGuestSlideGesture,
  nearestMaxGuestSlideIndex,
  type MaxGuestSlideGesture,
} from "@/lib/max/guest-home-slider";

const IDLE_GESTURE: MaxGuestSlideGesture = { origin: null, moved: false };

type MaxGuestHomeSliderProps = {
  onSlideAction: (slideId: string) => void;
  /** When this returns an https URL, that slide is a real anchor. Other slides stay buttons. */
  getSlideHref?: (slideId: string) => string | null;
  onAnchorClick?: (
    event: MouseEvent<HTMLAnchorElement>,
    slideId: string,
    url: string,
  ) => void;
};

/**
 * Guest banner presentation shared by MAX and VK.
 * Images and labels come from GUEST_HOME_SLIDES. Slides are buttons that call
 * onSlideAction, unless getSlideHref returns an https URL. That slide is a
 * real anchor: a swipe cancels the click, and a tap leaves the native link
 * intact unless onAnchorClick accepts a bridge navigation. MAX does not pass
 * getSlideHref.
 */
export default function MaxGuestHomeSlider({
  onSlideAction,
  getSlideHref,
  onAnchorClick,
}: MaxGuestHomeSliderProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const gestureRef = useRef<MaxGuestSlideGesture>(IDLE_GESTURE);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const updateActive = () => {
      const slides = [
        ...track.querySelectorAll<HTMLElement>("[data-max-guest-home-slide]"),
      ];
      setActiveIndex(
        nearestMaxGuestSlideIndex(
          slides.map((slide) => slide.offsetLeft),
          track.scrollLeft,
        ),
      );
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
      "[data-max-guest-home-slide]",
    )[index];

    if (!track || !slide) {
      return;
    }

    track.scrollTo({
      left: slide.offsetLeft,
      behavior: "smooth",
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    gestureRef.current = beginMaxGuestSlideGesture({
      x: event.clientX,
      y: event.clientY,
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    gestureRef.current = moveMaxGuestSlideGesture(gestureRef.current, {
      x: event.clientX,
      y: event.clientY,
    });
  };

  const onPointerEnd = () => {
    gestureRef.current = endMaxGuestSlidePointer(gestureRef.current);
  };

  const onSlideClick = (slideId: string) => {
    if (!maxGuestSlideClickActivates(gestureRef.current)) {
      return;
    }

    onSlideAction(slideId);
  };

  const onAnchorSlideClick = (
    event: MouseEvent<HTMLAnchorElement>,
    slideId: string,
    url: string,
  ) => {
    handleMaxGuestSlideAnchorClick(gestureRef.current, event, () => {
      onAnchorClick?.(event, slideId, url);
    });
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
      className="guest-home-slider guest-home-slider--max"
      aria-label="Возможности АудиоЛада"
      data-max-guest-home-slider
    >
      <ul
        ref={trackRef}
        className="guest-home-slider__track"
        aria-label="Слайды для гостей"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onTrackKeyDown}
      >
        {GUEST_HOME_SLIDES.map((slide, index) => {
          const href = maxGuestSlideAnchorHref(getSlideHref?.(slide.id));
          const media = (
            <span className="guest-home-slider__media">
              <img
                src={slide.src}
                alt=""
                draggable={false}
                fetchPriority={index === 0 ? "high" : "auto"}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </span>
          );

          return (
            <li key={slide.id} className="guest-home-slider__item">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={slide.ariaLabel}
                  data-max-guest-home-slide={slide.id}
                  data-guest-slide-anchor=""
                  style={{ touchAction: "manipulation" }}
                  className="guest-home-slider__link"
                  onClick={(event) => onAnchorSlideClick(event, slide.id, href)}
                >
                  {media}
                </a>
              ) : (
                <button
                  type="button"
                  aria-label={slide.ariaLabel}
                  data-max-guest-home-slide={slide.id}
                  className="guest-home-slider__link"
                  onClick={() => onSlideClick(slide.id)}
                >
                  {media}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <nav
        className="guest-home-slider__dots"
        aria-label="Слайды гостевой главной"
      >
        {GUEST_HOME_SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            data-max-guest-home-dot={slide.id}
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
