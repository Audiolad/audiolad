import Link from "next/link";

import FeaturedProductCard, {
  FEATURED_CARD_CHIP_CLASS,
  FEATURED_CARD_META_CLASS,
  FEATURED_CARD_SUBTITLE_CLASS,
  FEATURED_CARD_TITLE_CLASS,
} from "@/components/home/FeaturedProductCard";
import {
  isHeroPromoOfferActive,
  resolvePracticeHeroLightMetaRest,
} from "@/lib/catalog/product-hero-gallery";
import { buildAuthorPublicPath } from "@/lib/products/paths";

import PracticeHeroGallery from "./PracticeHeroGallery";
import {
  PracticePrimaryActionSection,
  toPracticeHeartProduct,
} from "./PracticePageParts";
import type { PracticePageViewModel } from "./types";

const HERO_AUTHOR_LINK_CLASS =
  "text-inherit no-underline xl:hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

function PracticeHeroMetaLine({
  viewModel,
}: {
  viewModel: PracticePageViewModel;
}) {
  const authorName = viewModel.authorName?.trim() || null;
  const rest = resolvePracticeHeroLightMetaRest(viewModel.meta, authorName);

  if (!authorName || !viewModel.resolvedAuthorSlug.trim()) {
    return viewModel.meta ? (
      <p className={FEATURED_CARD_META_CLASS}>{viewModel.meta}</p>
    ) : null;
  }

  return (
    <p className={FEATURED_CARD_META_CLASS}>
      <Link
        href={buildAuthorPublicPath(viewModel.resolvedAuthorSlug)}
        className={HERO_AUTHOR_LINK_CLASS}
      >
        {authorName}
      </Link>
      {rest ? ` · ${rest}` : null}
    </p>
  );
}

type PracticeProductHeroProps = {
  viewModel: PracticePageViewModel;
};

export default function PracticeProductHero({
  viewModel,
}: PracticeProductHeroProps) {
  const typeChip = viewModel.productTypeLabel;
  const promoActive = isHeroPromoOfferActive(viewModel.priceOffer);

  return (
    <FeaturedProductCard
      className="practice-product-hero"
      data-practice-product-hero=""
      data-practice-hero-has-gallery={
        viewModel.gallerySlides.length > 0 ? "true" : "false"
      }
      data-practice-hero-has-promo={promoActive ? "true" : "false"}
      cover={
        <PracticeHeroGallery
          cover={viewModel.mobileCover}
          desktopCover={viewModel.desktopCover}
          slides={viewModel.gallerySlides}
          priority
          showMobileDots
          heartProduct={toPracticeHeartProduct(viewModel)}
          isAuthenticated={viewModel.isAuthenticated}
          signInReturnPath={viewModel.practicePagePath}
          shareTitle={viewModel.practice.title}
          sharePath={viewModel.practicePagePath}
          shareSubtitle={viewModel.subtitle}
        />
      }
    >
      {typeChip ? (
        <span data-practice-hero-type-chip className={FEATURED_CARD_CHIP_CLASS}>
          {typeChip}
        </span>
      ) : null}

      <h1 className={FEATURED_CARD_TITLE_CLASS}>{viewModel.practice.title}</h1>

      {viewModel.subtitle ? (
        <p className={FEATURED_CARD_SUBTITLE_CLASS}>{viewModel.subtitle}</p>
      ) : null}

      <PracticeHeroMetaLine viewModel={viewModel} />

      <PracticePrimaryActionSection
        viewModel={viewModel}
        className="practice-product-hero__cta shrink-0"
      />
    </FeaturedProductCard>
  );
}
