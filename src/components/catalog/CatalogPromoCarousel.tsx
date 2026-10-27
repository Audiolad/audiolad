"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  CATALOG_PROMO_ARTWORK_HEIGHT,
  CATALOG_PROMO_ARTWORK_WIDTH,
  isCatalogPromoArtwork,
  type CatalogPromo,
} from "@/lib/catalog/catalog-promo";

type CatalogPromoCarouselProps = {
  promos: readonly CatalogPromo[];
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
      className="catalog-promo mt-4"
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
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${promo.title} (откроется в новой вкладке)`}
              data-catalog-promo-id={promo.id}
              data-catalog-promo-position={promo.position}
              className="block overflow-hidden rounded-[24px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <span className="sr-only"> (откроется в новой вкладке)</span>
              {isCatalogPromoArtwork(promo.image) ? (
                // The photo already contains the title. No second heading or caption.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={promo.image}
                  alt={promo.title}
                  width={CATALOG_PROMO_ARTWORK_WIDTH}
                  height={CATALOG_PROMO_ARTWORK_HEIGHT}
                  data-catalog-promo-artwork
                  className="catalog-promo-artwork"
                />
              ) : promo.caption !== undefined ? (
                <span className="flex min-h-28 items-center gap-3 rounded-[24px] border border-[#e8def5] bg-[#faf6ff] p-4 sm:gap-6">
                  {/* Editable HTTPS images do not require an optimizer host allowlist. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={promo.image} alt="" width={192} height={96}
                    className="aspect-[2/1] h-auto w-24 shrink-0 rounded-xl object-contain sm:w-48" />
                  <span className="min-w-0 break-words">
                    <span className="block text-base font-semibold text-[#25135c] sm:text-xl">{promo.title}</span>
                    {promo.caption ? <span className="mt-1 block text-sm text-[#796ba0]">{promo.caption}</span> : null}
                    <span className="mt-2 block text-sm font-semibold text-[#7042c5]">Подробнее →</span>
                  </span>
                </span>
              ) : <span className="relative block aspect-[4.8/1] w-full overflow-hidden bg-[#efe6f8]">
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
              </span>}
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
