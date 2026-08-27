import { PRODUCT_FORMAT_LINE_CLASS } from "@/lib/author-products/format";
import { isHeroPromoOfferActive } from "@/lib/catalog/product-hero-gallery";

import PracticeHeroGallery from "./PracticeHeroGallery";
import {
  PracticeMetaSection,
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
  const isDesktop = layout === "desktop";
  const typeChip = viewModel.productTypeLabel;
  const promoActive = isHeroPromoOfferActive(viewModel.priceOffer);

  return (
    <article
      data-practice-product-hero={layout}
      data-practice-hero-has-gallery={
        viewModel.gallerySlides.length > 0 ? "true" : "false"
      }
      data-practice-hero-has-promo={promoActive ? "true" : "false"}
      className={
        isDesktop
          ? "grid min-w-0 grid-cols-[minmax(240px,340px)_minmax(0,1fr)] gap-x-6 rounded-[28px] border border-[#eadff8] bg-white p-5 shadow-[0_10px_28px_rgba(91,62,145,0.07)] xl:grid-cols-[minmax(260px,360px)_minmax(0,1fr)] xl:gap-x-8"
          : "rounded-[28px] border border-[#eadff8] bg-white p-4 shadow-[0_10px_28px_rgba(91,62,145,0.07)]"
      }
    >
      <div className={isDesktop ? "w-full max-w-[360px]" : "w-full"}>
        <PracticeHeroGallery
          cover={isDesktop ? viewModel.desktopCover : viewModel.mobileCover}
          slides={viewModel.gallerySlides}
          priority
          heartProduct={toPracticeHeartProduct(viewModel)}
          isAuthenticated={viewModel.isAuthenticated}
          signInReturnPath={viewModel.practicePagePath}
        />
      </div>

      <div className={`flex min-w-0 flex-col ${isDesktop ? "" : "mt-4"}`}>
        {typeChip ? (
          <p
            data-practice-hero-type-chip
            className={PRODUCT_FORMAT_LINE_CLASS}
          >
            {typeChip}
          </p>
        ) : null}

        <PracticeMetaSection
          viewModel={viewModel}
          subtitleClamp={isDesktop}
          showTopics={false}
          authorMetaLayout="inline"
          titleClassName={
            isDesktop
              ? "mt-2 text-[28px] font-semibold leading-[1.15] xl:text-[32px]"
              : "mt-2 text-[26px] font-semibold leading-[1.2]"
          }
        />

        <PracticePrimaryActionSection
          viewModel={viewModel}
          className="mt-4 shrink-0"
        />
      </div>
    </article>
  );
}
