"use client";

import HorizontalSnapGallery from "@/components/gallery/HorizontalSnapGallery";
import {
  buildCatalogCardGalleryPages,
  shouldRenderCatalogCardGallery,
} from "@/lib/gallery/catalog-card-gallery";
import CatalogCardPublicMetrics from "@/components/catalog/CatalogCardPublicMetrics";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import {
  buildCatalogPublicMetrics,
  type CatalogPublicMetrics,
} from "@/lib/catalog/public-metrics";
import type { MaxCatalogProduct } from "@/lib/max/catalog-product";

type MaxCatalogProductCardProps = {
  product: MaxCatalogProduct;
  onSelectProduct: (product: MaxCatalogProduct) => void;
};

const CARD_CLASS =
  "flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white text-left shadow-[0_6px_16px_rgba(91,62,145,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function maxProductPublicMetrics(product: MaxCatalogProduct): CatalogPublicMetrics {
  return buildCatalogPublicMetrics(
    product.publicMetrics.qualifiedListenCount,
    product.publicMetrics.totalStars,
  );
}

function CatalogCardCopy({ product }: { product: MaxCatalogProduct }) {
  return (
    <div className="px-2.5 pb-2.5 pt-2">
      <div className="flex items-center gap-2">
        <p className={`${PRODUCT_FORMAT_LINE_CLASS} min-w-0 flex-1 truncate`}>
          {product.formatLabel}
        </p>
        <CatalogCardPublicMetrics metrics={maxProductPublicMetrics(product)} />
      </div>
      <p className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-[#25135c]">
        {product.title}
      </p>
      <p className="mt-1 line-clamp-1 min-h-5 text-sm text-[#7d70a2]">
        {product.authorName || "\u00a0"}
      </p>
      {!product.isFree ? (
        <p className="mt-1 whitespace-nowrap text-xs font-semibold leading-4 text-[#7042c5]">
          {product.priceLabel}
        </p>
      ) : null}
    </div>
  );
}

export default function MaxCatalogProductCard({
  product,
  onSelectProduct,
}: MaxCatalogProductCardProps) {
  const pages = buildCatalogCardGalleryPages(product);
  const showGallery = shouldRenderCatalogCardGallery(pages.length);

  if (!showGallery) {
    const cover = pages[0] ?? null;
    return (
      <button
        type="button"
        onClick={() => onSelectProduct(product)}
        className={CARD_CLASS}
      >
        <div className="aspect-square w-full bg-[#ede6f8]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.src}
              alt={cover.id === "cover" ? "" : cover.alt}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <CatalogCardCopy product={product} />
      </button>
    );
  }

  return (
    <div className={CARD_CLASS}>
      <HorizontalSnapGallery
        pages={pages}
        onActivate={() => onSelectProduct(product)}
      />
      <button
        type="button"
        onClick={() => onSelectProduct(product)}
        className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <CatalogCardCopy product={product} />
      </button>
    </div>
  );
}
