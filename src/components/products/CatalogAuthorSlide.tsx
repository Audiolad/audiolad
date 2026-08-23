import Link from "next/link";

import type { CatalogAuthorSlide as CatalogAuthorSlideModel } from "@/lib/products/catalog-tile-carousel";

type CatalogAuthorSlideProps = {
  slide: CatalogAuthorSlideModel;
  productHref: string;
  productTitle: string;
  tabIndex?: number;
};

/**
 * Author 3:4 slide (carousel slide 2+).
 * Whole slide is one PDP Link. No Play. Images stay lazy-loadable later.
 */
export default function CatalogAuthorSlide({
  slide,
  productHref,
  productTitle,
  tabIndex,
}: CatalogAuthorSlideProps) {
  return (
    <div
      className="h-full w-full min-h-0 min-w-0 overflow-hidden"
      data-catalog-author-slide=""
      data-catalog-author-slide-aspect="3/4"
    >
      <Link
        href={productHref}
        tabIndex={tabIndex}
        draggable={false}
        aria-label={`Открыть «${productTitle}»`}
        className="relative flex h-full w-full flex-col justify-end overflow-hidden rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#7042c5]"
        data-catalog-author-slide-link=""
      >
        {slide.imageSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={slide.imageSrc}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            data-catalog-author-slide-image=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className={`absolute inset-0 ${slide.backgroundClassName}`}
            data-catalog-author-slide-placeholder=""
            aria-hidden="true"
          />
        )}
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col justify-between px-3 py-3 text-white">
          <p className="text-[28px] font-semibold leading-none tracking-tight">
            {slide.label}
          </p>
          <p className="line-clamp-2 text-[13px] font-medium leading-4">
            {productTitle}
          </p>
        </div>
      </Link>
    </div>
  );
}
