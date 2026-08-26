import Image from "next/image";

import {
  MEDITATION_SOLUTIONS_H1,
  MEDITATION_SOLUTIONS_HERO_IMAGE,
  MEDITATION_SOLUTIONS_OFFER_LINE,
  MEDITATION_SOLUTIONS_SUBTITLE,
  type MeditationSolutionsOfferState,
} from "@/lib/landings/25-meditation-solutions";

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
        className="mx-auto w-full max-w-[560px] px-6 pt-8 pb-16"
      >
        <div
          data-meditation-solutions-hero-card
          className="mx-auto w-full max-w-[300px] rounded-[28px] border border-[#e8def5] bg-white p-3.5 shadow-[0_12px_32px_rgba(37,19,92,0.07)] sm:max-w-[340px] sm:p-4"
        >
          <div
            data-meditation-solutions-hero-cover
            className="relative mx-auto aspect-square w-full overflow-hidden rounded-[22px] bg-[#efe6fb]"
          >
            <Image
              src={MEDITATION_SOLUTIONS_HERO_IMAGE}
              alt={MEDITATION_SOLUTIONS_H1}
              fill
              priority
              sizes="(max-width: 430px) 280px, 320px"
              className="object-contain"
            />
          </div>

          <div
            data-meditation-solutions-hero-title
            className="px-1 pb-1 pt-10"
          >
            <h1 className="text-center text-[22px] font-semibold leading-[1.25] text-[#25135c] sm:text-[24px] lg:text-[26px] lg:leading-[1.2]">
              {MEDITATION_SOLUTIONS_H1}
            </h1>
          </div>
        </div>

        <p className="mt-8 text-[15px] leading-6 text-[#5f5484] lg:text-[16px] lg:leading-7">
          {MEDITATION_SOLUTIONS_SUBTITLE}
        </p>
        <p className="mt-4 text-[15px] leading-6 text-[#5f5484] lg:text-[16px] lg:leading-7">
          {MEDITATION_SOLUTIONS_OFFER_LINE}
        </p>

        <div className="mt-8">
          <MeditationSolutionsOfferCta placement="top" />
        </div>

        <div className="mt-12">
          <MeditationSolutionsCards />
        </div>

        <div className="mt-12">
          <MeditationSolutionsOfferCta placement="bottom" />
        </div>
      </article>
    </MeditationSolutionsOfferProvider>
  );
}
