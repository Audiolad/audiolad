import Link from "next/link";

import AuthorLink from "@/components/authors/AuthorLink";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import type { HomeProduct } from "@/lib/home/types";
import { PLAY_ACTION_LABEL } from "@/lib/ui/action-labels";

import FeaturedProductCard, {
  FEATURED_CARD_ACTIONS_CLASS,
  FEATURED_CARD_CHIP_CLASS,
  FEATURED_CARD_META_CLASS,
  FEATURED_CARD_PRIMARY_CTA_CLASS,
  FEATURED_CARD_SECONDARY_CTA_CLASS,
  FEATURED_CARD_TITLE_CLASS,
} from "./FeaturedProductCard";
import HomeProductPlayButton from "./HomeProductPlayButton";
import { PlayIcon } from "./HomeIcons";

type HeroFeaturedProductProps = {
  product: HomeProduct;
};

export default function HeroFeaturedProduct({ product }: HeroFeaturedProductProps) {
  const canPlay = Boolean(product.authorSlug && product.slug);

  return (
    <FeaturedProductCard
      className="mt-8"
      cover={
        <Link
          href={product.href}
          className="featured-card__cover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <ProductCoverThumbnail
            slug={product.slug}
            title={product.title}
            coverUrl={product.coverUrl}
            coverImage={product.coverImage}
            updatedAt={product.updatedAt}
            authorName={product.authorName}
            format={product.format}
            displayWidth={640}
            priority
            className="h-full w-full rounded-none"
          />
        </Link>
      }
    >
      <span className={FEATURED_CARD_CHIP_CLASS}>{product.productTypeLabel}</span>

      <h2 className={FEATURED_CARD_TITLE_CLASS}>
        <Link
          href={product.href}
          className="hover:text-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          {product.title}
        </Link>
      </h2>

      {product.authorName ? (
        <AuthorLink
          authorSlug={product.authorSlug}
          authorName={product.authorName}
          className="mt-2 text-sm font-medium text-[#7042c5]"
        />
      ) : null}

      {product.statsLabel ? (
        <p className={FEATURED_CARD_META_CLASS}>{product.statsLabel}</p>
      ) : null}

      <div className={FEATURED_CARD_ACTIONS_CLASS}>
        {canPlay && product.authorSlug ? (
          <HomeProductPlayButton
            practiceId={product.id}
            authorSlug={product.authorSlug}
            productSlug={product.slug}
            ariaLabel={`${PLAY_ACTION_LABEL} ${product.title}`}
            className={FEATURED_CARD_PRIMARY_CTA_CLASS}
          >
            <PlayIcon />
            {PLAY_ACTION_LABEL}
          </HomeProductPlayButton>
        ) : null}

        <Link href={product.href} className={FEATURED_CARD_SECONDARY_CTA_CLASS}>
          Подробнее
        </Link>
      </div>
    </FeaturedProductCard>
  );
}
