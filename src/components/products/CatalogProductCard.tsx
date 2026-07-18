import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { CatalogProduct } from "@/lib/products/catalog";
import { isProductFree } from "@/lib/products/price-format";

type CatalogProductCardProps = {
  product: CatalogProduct;
};

export default function CatalogProductCard({ product }: CatalogProductCardProps) {
  const summary = product.subtitle?.trim() || product.description?.trim() || null;
  const showPrice = !isProductFree(product.isFree, product.price);

  return (
    <article className="block rounded-[24px] border border-[#e8def5] bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex min-w-0 items-stretch gap-4 max-[360px]:gap-3.5 sm:gap-5">
        <div className="w-[36%] min-w-[108px] max-w-[132px] shrink-0 sm:max-w-[140px]">
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
              authorName={product.authorName}
              format={product.format}
              className="aspect-square w-full rounded-[20px]"
            />
          </Link>

          <div className="mt-2.5 space-y-1.5">
            {product.statsLabel ? (
              <p className="text-xs leading-4 text-[#7d70a2] sm:text-[13px] sm:leading-5">
                {product.statsLabel}
              </p>
            ) : null}
            {showPrice ? (
              <p className="text-[15px] font-semibold leading-5 text-[#7042c5] sm:text-base">
                {product.priceLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className={`${PRODUCT_FORMAT_LINE_CLASS} sm:text-xs`}>
            {product.productTypeLabel}
          </p>

          <h3 className="mt-1 line-clamp-3 text-[17px] font-semibold leading-[1.3] text-[#25135c] sm:text-[18px]">
            <Link
              href={product.href}
              className="hover:text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              {product.title}
            </Link>
          </h3>

          {summary ? (
            <p className="catalog-product-card__description mt-2 min-h-0 flex-1 text-sm leading-5 text-[#7d70a2] sm:text-[15px] sm:leading-6">
              {summary}
            </p>
          ) : (
            <div className="min-h-0 flex-1" aria-hidden="true" />
          )}

          {product.authorName ? (
            <AuthorLink
              authorSlug={product.authorSlug}
              authorName={product.authorName}
              className="mt-2.5 shrink-0 text-sm font-medium text-[#7042c5]"
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
