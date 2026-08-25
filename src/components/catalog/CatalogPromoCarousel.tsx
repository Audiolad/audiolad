"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { CatalogPromo } from "@/lib/catalog/catalog-promo";

type CatalogPromoCarouselProps = {
  promos: CatalogPromo[];
};

export default function CatalogPromoCarousel({
  promos,
}: CatalogPromoCarouselProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const updateActive = () => {
      const slides = [
        ...track.querySelectorAll<HTMLElement>(".catalog-promo-carousel__item"),
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
  }, [promos]);

  if (promos.length === 0) {
    return null;
  }

  const scrollToPromo = (index: number) => {
    const track = trackRef.current;
    const slide = track?.querySelectorAll<HTMLElement>(
      ".catalog-promo-carousel__item",
    )[index];

    if (!track || !slide) {
      return;
    }

    track.scrollTo({
      left: slide.offsetLeft,
      behavior: "smooth",
    });
  };

  return (
    <section
      className="catalog-promo mt-0 xl:mt-1.5"
      aria-label="Промо каталога"
      data-catalog-promo
    >
      <ul
        ref={trackRef}
        className="catalog-promo-carousel"
        aria-label="Промо-баннеры"
      >
        {promos.map((promo) => (
          <li key={promo.id} className="catalog-promo-carousel__item">
            <Link
              href={promo.href}
              aria-label={promo.title}
              data-catalog-promo-id={promo.id}
              data-catalog-promo-position={promo.position}
              className="block overflow-hidden rounded-[24px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <span className="relative block aspect-[4.8/1] w-full overflow-hidden bg-[#efe6f8]">
                {promo.image.endsWith(".svg") ? (
                  // Local SVG slides stay image-only; next/image needs extra config for SVG.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={promo.image}
                    alt={promo.alt}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Image
                    src={promo.image}
                    alt={promo.alt}
                    fill
                    sizes="(max-width: 1279px) calc(100vw - 2.5rem), 960px"
                    className="object-contain"
                  />
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {promos.length > 1 ? (
        <div
          className="catalog-promo-carousel__dots"
          role="tablist"
          aria-label="Слайды промо"
        >
          {promos.map((promo, index) => (
            <button
              key={promo.id}
              type="button"
              role="tab"
              aria-label={`Слайд ${index + 1}: ${promo.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              className={
                index === activeIndex
                  ? "catalog-promo-carousel__dot catalog-promo-carousel__dot--active"
                  : "catalog-promo-carousel__dot"
              }
              onClick={() => scrollToPromo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
