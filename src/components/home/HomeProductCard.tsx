import Link from "next/link";

import GiftBadge from "@/components/products/GiftBadge";
import type { CoverBadgeVariant } from "@/components/products/cover-badge-types";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { HomeProduct } from "@/lib/home/types";

import { PlayIcon } from "./HomeIcons";

type HomeProductCardProps = {
  product: HomeProduct;
  showPlayButton?: boolean;
  showGiftBadge?: boolean;
  giftBadgeVariant?: CoverBadgeVariant;
};

export default function HomeProductCard({
  product,
  showPlayButton = true,
  showGiftBadge = true,
  giftBadgeVariant = "glass",
}: HomeProductCardProps) {
  const listenHref = product.listenHref;

  return (
    <article className="flex h-full w-[168px] shrink-0 snap-start flex-col sm:w-[180px]">
      <div className="relative">
        <Link
          href={product.href}
          className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <ProductCoverThumbnail
            slug={product.slug}
            title={product.title}
            coverUrl={product.coverUrl}
            authorName={product.authorName}
            format={product.format}
            className="aspect-square w-full rounded-[22px]"
          />
        </Link>

        {showGiftBadge && product.isFree ? (
          <GiftBadge size="md" variant={giftBadgeVariant} />
        ) : null}

        {showPlayButton && listenHref ? (
          <Link
            href={listenHref}
            aria-label={`Слушать ${product.title}`}
            className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[#7042c5] text-white shadow-[0_8px_20px_rgba(96,59,168,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <PlayIcon />
          </Link>
        ) : null}
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9485b4]">
        {product.productTypeLabel}
      </p>

      <h3 className="mt-1 line-clamp-2 min-h-[44px] text-[15px] font-semibold leading-[22px] text-[#25135c]">
        <Link
          href={product.href}
          className="hover:text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {product.title}
        </Link>
      </h3>

      {product.authorName ? (
        <p className="mt-1 line-clamp-1 text-sm font-medium text-[#7042c5]">
          {product.authorName}
        </p>
      ) : null}

      {product.statsLabel ? (
        <p className="mt-1 text-xs text-[#7d70a2]">{product.statsLabel}</p>
      ) : null}

      <Link
        href={product.href}
        className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Подробнее
      </Link>
    </article>
  );
}
