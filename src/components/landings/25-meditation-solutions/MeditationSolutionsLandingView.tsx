import Image from "next/image";

import {
  MEDITATION_SOLUTIONS_H1,
  MEDITATION_SOLUTIONS_HERO_IMAGE,
  MEDITATION_SOLUTIONS_OFFER_LINE,
  MEDITATION_SOLUTIONS_SUBTITLE,
  type MeditationSolutionsOfferState,
} from "@/lib/landings/25-meditation-solutions";
import { platformBottomContentPaddingClass } from "@/lib/navigation/bottom-nav";

import MeditationSolutionsCards from "./MeditationSolutionsCards";
import MeditationSolutionsOfferCta from "./MeditationSolutionsOfferCta";
import MeditationSolutionsOfferProvider from "./MeditationSolutionsOfferProvider";

type MeditationSolutionsLandingViewProps = {
  offer: MeditationSolutionsOfferState;
};

export default function MeditationSolutionsLandingView({
  offer,
}: MeditationSolutionsLandingViewProps) {
  return (
    <MeditationSolutionsOfferProvider
      practice={offer.practice}
      initialExpiresAt={offer.initialExpiresAt}
      initialSalePrice={offer.salePrice}
      initialBasePrice={offer.basePrice}
    >
      <article
        data-meditation-solutions-landing
        className={`mx-auto w-full max-w-[720px] ${platformBottomContentPaddingClass}`}
      >
        <div
          data-meditation-solutions-hero-card
          className="rounded-[28px] border border-[#e8def5] bg-white p-3.5 shadow-[0_12px_32px_rgba(37,19,92,0.07)] sm:p-4"
        >
          <div
            data-meditation-solutions-hero-cover
            className="relative aspect-square w-full overflow-hidden rounded-[22px] bg-[#efe6fb]"
          >
            <Image
              src={MEDITATION_SOLUTIONS_HERO_IMAGE}
              alt={MEDITATION_SOLUTIONS_H1}
              fill
              priority
              sizes="(max-width: 430px) 100vw, (max-width: 720px) 90vw, 720px"
              className="object-contain"
            />
          </div>

          <div
            data-meditation-solutions-hero-title
            className="px-0.5 pb-1 pt-4"
          >
            <h1 className="text-[26px] font-semibold leading-[1.2] text-[#25135c] lg:text-[32px] lg:leading-[1.15]">
              {MEDITATION_SOLUTIONS_H1}
            </h1>
          </div>
        </div>

        <p className="mt-5 text-[15px] leading-6 text-[#5f5484] lg:text-[16px] lg:leading-7">
          {MEDITATION_SOLUTIONS_SUBTITLE}
        </p>
        <p className="mt-3 text-[15px] leading-6 text-[#5f5484] lg:text-[16px] lg:leading-7">
          {MEDITATION_SOLUTIONS_OFFER_LINE}
        </p>

        <div className="mt-6">
          <MeditationSolutionsOfferCta placement="top" />
        </div>

        <div className="mt-8">
          <MeditationSolutionsCards />
        </div>

        <div className="mt-8">
          <MeditationSolutionsOfferCta placement="bottom" />
        </div>
      </article>
    </MeditationSolutionsOfferProvider>
  );
}
