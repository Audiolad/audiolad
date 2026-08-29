"use client";

import Link from "next/link";

import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";

export type RelatedProductCardModel = {
  practiceId: string;
  title: string;
  href: string;
  authorName: string | null;
  formatLabel: string | null;
  durationLabel: string | null;
  coverUrl: string | null;
  coverImage?: unknown;
  updatedAt?: string | null;
};

export default function RelatedProductLinkCard({
  product,
}: {
  product: RelatedProductCardModel;
}) {
  const details = [product.authorName, product.durationLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={product.href}
      className="flex w-full max-w-full min-w-0 items-center gap-3 rounded-[16px] border border-[#eadff8] bg-white px-3 py-2 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[12px]">
        <ProductCoverThumbnail
          slug={product.practiceId}
          title={product.title}
          coverUrl={product.coverUrl}
          coverImage={product.coverImage}
          updatedAt={product.updatedAt}
          authorName={product.authorName}
          displayWidth={56}
          className="h-full w-full rounded-[12px]"
        />
      </div>
      <div className="min-w-0 flex-1">
        {product.formatLabel ? (
          <p className={PRODUCT_FORMAT_LINE_CLASS}>{product.formatLabel}</p>
        ) : null}
        <p
          className={`line-clamp-2 text-[14px] font-semibold leading-[1.25] text-[#25135c] ${product.formatLabel ? "mt-0.5" : ""}`}
        >
          {product.title}
        </p>
        {details ? (
          <p className="mt-0.5 truncate text-[12px] leading-4 text-[#5c4f82]">
            {details}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
