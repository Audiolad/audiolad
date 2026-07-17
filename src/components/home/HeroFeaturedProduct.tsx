import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { HomeProduct } from "@/lib/home/types";
import { getProductServiceLineLabel } from "@/lib/products/product-service-label";

import { PlayIcon } from "./HomeIcons";

type HeroFeaturedProductProps = {
  product: HomeProduct;
};

export default function HeroFeaturedProduct({ product }: HeroFeaturedProductProps) {
  const listenHref = product.listenHref;
  const serviceLineLabel = getProductServiceLineLabel(
    product.productTypeLabel,
    product.isFree,
    product.price,
  );

  return (
    <article className="featured-card mt-8 overflow-hidden rounded-[28px]">
      <Link
        href={product.href}
        className="featured-card__cover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <ProductCoverThumbnail
          slug={product.slug}
          title={product.title}
          coverUrl={product.coverUrl}
          authorName={product.authorName}
          format={product.format}
          className="h-full w-full rounded-none"
        />
      </Link>

      <div className="featured-card__content">
        <span className="inline-flex rounded-full bg-[#f4ecfb] px-3 py-1 text-xs font-medium text-[#7042c5]">
          {serviceLineLabel}
        </span>

        <h2 className="mt-3 text-[22px] font-semibold leading-tight text-[#25135c]">
          <Link
            href={product.href}
            className="hover:text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {product.title}
          </Link>
        </h2>

        {product.authorName ? (
          <p className="mt-2 text-sm font-medium text-[#7042c5]">
            {product.authorName}
          </p>
        ) : null}

        {product.statsLabel ? (
          <p className="mt-2 text-sm text-[#7d70a2]">{product.statsLabel}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          {listenHref ? (
            <Link
              href={listenHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <PlayIcon />
              Слушать
            </Link>
          ) : null}

          <Link
            href={product.href}
            className="inline-flex min-h-11 items-center rounded-2xl border border-[#7042c5] bg-white px-5 py-3 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  );
}
