import Link from "next/link";

import CatalogProductHeartButton from "@/components/products/CatalogProductHeartButton";
import CatalogProductPlayButton from "@/components/products/CatalogProductPlayButton";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { CatalogListingItem } from "@/lib/catalog/listing-contract";

type CatalogProductGridCardProps = {
  product: CatalogListingItem;
  isAuthenticated?: boolean;
  signInReturnPath?: string;
};

/**
 * Approved catalog card:
 * media zone = 1:1; info block = static; whole product card = rectangular.
 */

export default function CatalogProductGridCard({
  product,
  isAuthenticated = false,
  signInReturnPath = "/catalog",
}: CatalogProductGridCardProps) {
  const isGift = product.accessState === "free";
  const durationLabel = product.durationLabel?.trim() || null;
  const priceLabel = product.priceLabel?.trim() || null;

  return (
    <article
      data-catalog-grid-card
      className="overflow-hidden rounded-[20px] border border-[#eadff8] bg-white shadow-[0_6px_16px_rgba(91,62,145,0.06)]"
    >
      <div data-catalog-media-zone className="relative overflow-hidden bg-[#f4ecfb]">
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
            className="aspect-square w-full rounded-none"
          />
        </Link>

        <CatalogProductHeartButton
          product={product}
          isAuthenticated={isAuthenticated}
          signInReturnPath={signInReturnPath}
        />

        <CatalogProductPlayButton product={product} />
      </div>

      <Link
        href={product.href}
        data-catalog-info-block
        className="block px-2.5 pb-2.5 pt-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <p className={`hidden xl:block ${PRODUCT_FORMAT_LINE_CLASS}`}>
          {product.kindLabel}
        </p>

        <h3 className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c] sm:text-[15px] sm:leading-5">
          {product.title}
        </h3>

        <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
          {product.author || "\u00a0"}
        </p>

        {durationLabel || priceLabel ? (
          <p data-catalog-card-meta className="mt-1 text-xs leading-4 text-[#7d70a2]">
            {durationLabel ? <span>{durationLabel}</span> : null}
            {durationLabel && priceLabel ? <span aria-hidden="true"> · </span> : null}
            {priceLabel ? (
              <span
                className={
                  isGift
                    ? "font-semibold text-[#5f3f9d]"
                    : "font-semibold text-[#7042c5]"
                }
              >
                {priceLabel}
              </span>
            ) : null}
          </p>
        ) : null}
      </Link>
    </article>
  );
}
