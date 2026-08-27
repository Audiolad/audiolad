import FeaturedProductCard, {
  FEATURED_CARD_CHIP_CLASS,
  FEATURED_CARD_META_CLASS,
  FEATURED_CARD_SUBTITLE_CLASS,
  FEATURED_CARD_TITLE_CLASS,
} from "@/components/home/FeaturedProductCard";
import { isHeroPromoOfferActive } from "@/lib/catalog/product-hero-gallery";

import PracticeHeroGallery from "./PracticeHeroGallery";
import {
  PracticePrimaryActionSection,
  toPracticeHeartProduct,
} from "./PracticePageParts";
import type { PracticePageViewModel } from "./types";

type PracticeProductHeroProps = {
  viewModel: PracticePageViewModel;
  layout: "mobile" | "desktop";
};

export default function PracticeProductHero({
  viewModel,
  layout,
}: PracticeProductHeroProps) {
  const typeChip = viewModel.productTypeLabel;
  const promoActive = isHeroPromoOfferActive(viewModel.priceOffer);
  const cover = layout === "desktop" ? viewModel.desktopCover : viewModel.mobileCover;

  return (
    <FeaturedProductCard
      data-practice-product-hero={layout}
      data-practice-hero-has-gallery={
        viewModel.gallerySlides.length > 0 ? "true" : "false"
      }
      data-practice-hero-has-promo={promoActive ? "true" : "false"}
      cover={
        <PracticeHeroGallery
          cover={cover}
          slides={viewModel.gallerySlides}
          priority
          heartProduct={toPracticeHeartProduct(viewModel)}
          isAuthenticated={viewModel.isAuthenticated}
          signInReturnPath={viewModel.practicePagePath}
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

      {viewModel.meta ? (
        <p className={FEATURED_CARD_META_CLASS}>{viewModel.meta}</p>
      ) : null}

      <PracticePrimaryActionSection viewModel={viewModel} className="mt-4 shrink-0" />
    </FeaturedProductCard>
  );
}
