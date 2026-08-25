"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { CatalogCard, CatalogSlide } from "@/lib/catalog/dto";

type CatalogCardGalleryProps = {
  card: CatalogCard;
};

type GalleryPage =
  | { type: "cover" }
  | { type: "slide"; slide: CatalogSlide };

function buildGalleryPages(card: CatalogCard): GalleryPage[] {
  return [
    { type: "cover" },
    ...card.gallery.map((slide) => ({ type: "slide" as const, slide })),
  ];
}

export default function CatalogCardGallery({ card }: CatalogCardGalleryProps) {
  const pages = buildGalleryPages(card);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const pdpHref = card.paths.pdp;

  const handleScroll = useCallback(() => {
    const node = scrollerRef.current;

    if (!node || node.clientWidth <= 0) {
      return;
    }

    const nextIndex = Math.round(node.scrollLeft / node.clientWidth);
    setActiveIndex(Math.min(pages.length - 1, Math.max(0, nextIndex)));
  }, [pages.length]);

  if (pages.length === 1) {
    return (
      <Link
        href={pdpHref}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <ProductCoverThumbnail
          slug={card.slug}
          title={card.title}
          coverUrl={card.cover.url}
          coverImage={card.cover.image}
          updatedAt={card.cover.updated_at}
          authorName={card.author.name}
          format={card.display_label}
          coverAlt={card.cover.alt}
          displayWidth={360}
          className="aspect-square w-full rounded-none"
        />
      </Link>
    );
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        data-catalog-gallery
        data-catalog-gallery-count={card.gallery.length}
        className="catalog-card-gallery"
        onScroll={handleScroll}
      >
        {pages.map((page, index) => (
          <Link
            key={page.type === "cover" ? "cover" : page.slide.id}
            href={pdpHref}
            data-catalog-gallery-slide={page.type}
            className="catalog-card-gallery-slide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {page.type === "cover" ? (
              <ProductCoverThumbnail
                slug={card.slug}
                title={card.title}
                coverUrl={card.cover.url}
                coverImage={card.cover.image}
                updatedAt={card.cover.updated_at}
                authorName={card.author.name}
                format={card.display_label}
                coverAlt={card.cover.alt}
                displayWidth={360}
                className="aspect-square w-full rounded-none"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.slide.image_url}
                alt={page.slide.alt || card.title}
                className="aspect-square h-full w-full object-cover"
                draggable={false}
              />
            )}
            <span className="sr-only">
              {index === 0 ? card.title : page.type === "slide" ? page.slide.alt || card.title : card.title}
            </span>
          </Link>
        ))}
      </div>

      <div
        data-catalog-gallery-dots
        className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1"
        aria-hidden="true"
      >
        {pages.map((page, index) => (
          <span
            key={page.type === "cover" ? "cover-dot" : page.slide.id}
            className={`h-1.5 w-1.5 rounded-full ${
              index === activeIndex ? "bg-white" : "bg-white/45"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
