import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { CatalogProduct } from "@/lib/products/catalog";
import { buildAuthorPublicPath } from "@/lib/products/paths";

type CatalogProductCardProps = {
  product: CatalogProduct;
};

export default function CatalogProductCard({ product }: CatalogProductCardProps) {
  const summary = product.subtitle?.trim() || product.description?.trim() || null;
  const authorHref = product.authorSlug
    ? buildAuthorPublicPath(product.authorSlug)
    : null;
  const titleId = `catalog-product-${product.id}-title`;

  return (
    <article className="relative rounded-[24px] border border-[#e8def5] bg-white p-4 shadow-sm">
      <Link
        href={product.href}
        aria-labelledby={titleId}
        className="absolute inset-0 z-0 rounded-[24px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      />

      <div className="relative z-[1] flex min-w-0 gap-3 max-[320px]:flex-col">
        <div className="w-[35%] min-w-[112px] max-w-[140px] shrink-0 max-[320px]:w-full max-[320px]:max-w-[168px]">
          <ProductCoverThumbnail
            slug={product.slug}
            title={product.title}
            coverUrl={product.coverUrl}
            className="aspect-square w-full rounded-[20px]"
          />

          <div className="mt-2.5 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
              {product.productTypeLabel}
            </p>
            {product.statsLabel ? (
              <p className="text-xs leading-4 text-[#7d70a2]">
                {product.statsLabel}
              </p>
            ) : null}
            <p className="pt-0.5 text-[15px] font-semibold leading-5 text-[#7042c5]">
              {product.priceLabel}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 pb-0.5">
          <h3
            id={titleId}
            className="line-clamp-3 text-[17px] font-semibold leading-[1.3] text-[#25135c]"
          >
            {product.title}
          </h3>

          {summary ? (
            <p className="mt-2 line-clamp-3 text-sm leading-5 text-[#7d70a2]">
              {summary}
            </p>
          ) : null}

          {product.authorName && authorHref ? (
            <Link
              href={authorHref}
              className="relative z-10 mt-3 inline-flex min-h-11 max-w-full items-center text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <span className="line-clamp-2">{product.authorName}</span>
            </Link>
          ) : product.authorName ? (
            <p className="mt-3 text-sm font-medium text-[#7042c5]">
              {product.authorName}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
