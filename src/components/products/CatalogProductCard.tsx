import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { CatalogProduct } from "@/lib/products/catalog";

type CatalogProductCardProps = {
  product: CatalogProduct;
};

export default function CatalogProductCard({ product }: CatalogProductCardProps) {
  const summary = product.subtitle?.trim() || product.description?.trim() || null;

  return (
    <Link
      href={product.href}
      className="block rounded-[24px] border border-[#e8def5] bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] active:shadow-sm"
    >
      <article className="flex min-w-0 items-stretch gap-4 max-[360px]:gap-3.5 sm:gap-5">
        <div className="w-[36%] min-w-[108px] max-w-[132px] shrink-0 sm:max-w-[140px]">
          <ProductCoverThumbnail
            slug={product.slug}
            title={product.title}
            coverUrl={product.coverUrl}
            authorName={product.authorName}
            format={product.format}
            className="aspect-square w-full rounded-[20px]"
          />

          <div className="mt-2.5 space-y-1.5">
            {product.statsLabel ? (
              <p className="text-xs leading-4 text-[#7d70a2] sm:text-[13px] sm:leading-5">
                {product.statsLabel}
              </p>
            ) : null}
            <p className="text-[15px] font-semibold leading-5 text-[#7042c5] sm:text-base">
              {product.priceLabel}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4] sm:text-xs">
            {product.productTypeLabel}
          </p>

          <h3 className="mt-1 line-clamp-3 text-[17px] font-semibold leading-[1.3] text-[#25135c] sm:text-[18px]">
            {product.title}
          </h3>

          {summary ? (
            <p className="catalog-product-card__description mt-2 min-h-0 flex-1 text-sm leading-5 text-[#7d70a2] sm:text-[15px] sm:leading-6">
              {summary}
            </p>
          ) : (
            <div className="min-h-0 flex-1" aria-hidden="true" />
          )}

          {product.authorName ? (
            <p className="mt-2.5 shrink-0 text-sm font-medium text-[#7042c5]">
              {product.authorName}
            </p>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
