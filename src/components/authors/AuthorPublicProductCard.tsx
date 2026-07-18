import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import type { AuthorPublicProduct } from "@/lib/authors/public-page";
import { getAuthorProductTypeLabel } from "@/lib/authors/public-page";
import { isProductFree } from "@/lib/products/price-format";

type AuthorPublicProductCardProps = {
  product: AuthorPublicProduct;
  variant?: "default" | "featured";
};

export default function AuthorPublicProductCard({
  product,
  variant = "default",
}: AuthorPublicProductCardProps) {
  const summary = product.subtitle?.trim() || product.description?.trim() || null;
  const showPrice = !isProductFree(product.is_free, product.price);
  const productTypeLabel = getAuthorProductTypeLabel(product.format);

  return (
    <article className="flex h-full flex-col rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-sm">
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
          format={product.format}
          displayWidth={160}
          className={`aspect-square w-full rounded-[20px] ${variant === "featured" ? "max-w-[160px]" : ""}`}
        />
      </Link>

      <p className={`mt-3 ${PRODUCT_FORMAT_LINE_CLASS}`}>{productTypeLabel}</p>

      <h3 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-5 text-[#25135c]">
        <Link
          href={product.href}
          className="hover:text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {product.title}
        </Link>
      </h3>

      {summary ? (
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-5 text-[#7d70a2]">
          {summary}
        </p>
      ) : (
        <div className="flex-1" />
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        {showPrice ? (
          <span className="text-sm font-semibold text-[#7042c5]">
            {product.priceLabel}
          </span>
        ) : (
          <span className="text-sm font-medium text-[#3d8d65]">Бесплатно</span>
        )}

        <Link
          href={product.href}
          className="inline-flex min-h-10 items-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {variant === "featured" ? "Начать" : "Подробнее"}
        </Link>
      </div>
    </article>
  );
}
