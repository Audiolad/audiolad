"use client";

import type { MaxCatalogProduct } from "@/lib/max/catalog-product";

type MaxCatalogProductCardProps = {
  product: MaxCatalogProduct;
  onSelectProduct: (product: MaxCatalogProduct) => void;
};

export default function MaxCatalogProductCard({
  product,
  onSelectProduct,
}: MaxCatalogProductCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelectProduct(product)}
      className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#eadff8] bg-white text-left shadow-[0_6px_16px_rgba(91,62,145,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
    >
      <div className="aspect-square w-full bg-[#ede6f8]">
        {product.coverUrl ? (
          <img src={product.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
          {product.formatLabel}
        </p>
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
    </button>
  );
}
