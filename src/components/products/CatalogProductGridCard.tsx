import Link from "next/link";

import CatalogProductPlayButton from "@/components/products/CatalogProductPlayButton";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { CatalogListingItem } from "@/lib/catalog/listing-contract";

type CatalogProductGridCardProps = {
  product: CatalogListingItem;
};

/**
 * Approved catalog card:
 * media zone = 1:1; info block = static; whole product card = rectangular.
 */

export default function CatalogProductGridCard({
  product,
}: CatalogProductGridCardProps) {
  const isGift = product.accessState === "free";

  return (
    <article data-catalog-grid-card>
      <div
        data-catalog-media-zone
        className="relative overflow-hidden rounded-[18px] bg-[#f4ecfb]"
      >
        <Link
          href={product.href}
          className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <ProductCoverThumbnail
            slug={product.slug}
            title={product.title}
            coverUrl={product.coverUrl}
            coverImage={product.coverImage}
            updatedAt={product.updatedAt}
            authorName={product.author}
            format={product.kindLabel}
            displayWidth={360}
            className="aspect-square w-full rounded-[18px]"
          />
        </Link>

        {isGift ? (
          <span className="absolute left-2 top-2 rounded-full bg-white/92 px-2 py-0.5 text-[11px] font-semibold text-[#7042c5] shadow-sm">
            Подарок
          </span>
        ) : null}

        <CatalogProductPlayButton product={product} />
      </div>

      <Link
        href={product.href}
        data-catalog-info-block
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <p className={`mt-2 ${PRODUCT_FORMAT_LINE_CLASS}`}>{product.kindLabel}</p>

        <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-[22px]">
          {product.title}
        </h3>

        {product.author ? (
          <p className="mt-1 line-clamp-1 text-sm text-[#7d70a2]">{product.author}</p>
        ) : null}

        {product.durationLabel ? (
          <p className="mt-1 text-xs text-[#7d70a2]">{product.durationLabel}</p>
        ) : null}

        <p
          className={`mt-1.5 text-sm font-semibold ${
            isGift ? "text-[#5f3f9d]" : "text-[#7042c5]"
          }`}
        >
          {product.priceLabel}
        </p>
      </Link>
    </article>
  );
}
