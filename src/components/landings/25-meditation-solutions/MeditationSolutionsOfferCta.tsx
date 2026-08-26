"use client";

import BuyPracticeButton from "@/components/BuyPracticeButton";
import PurchaseConsent from "@/components/PurchaseConsent";
import {
  MEDITATION_SOLUTIONS_BUY_LABEL,
  MEDITATION_SOLUTIONS_ONCE_NOTE,
  MEDITATION_SOLUTIONS_PRACTICE_SLUG,
  MEDITATION_SOLUTIONS_PUBLIC_PATH,
  MEDITATION_SOLUTIONS_TIMER_CAPTION,
} from "@/lib/landings/25-meditation-solutions/content";
import { formatRubles } from "@/lib/products/price-format";

import { useMeditationSolutionsOffer } from "./MeditationSolutionsOfferProvider";

type MeditationSolutionsOfferCtaProps = {
  placement: "top" | "bottom";
};

const buyButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-5 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)] transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-wait disabled:opacity-70";

export default function MeditationSolutionsOfferCta({
  placement,
}: MeditationSolutionsOfferCtaProps) {
  const offer = useMeditationSolutionsOffer();
  const display = offer.display;

  return (
    <section
      data-meditation-solutions-cta={placement}
      aria-label={
        placement === "top" ? "Купить предложение" : "Купить предложение ещё раз"
      }
      className="space-y-3"
    >
      {display.showPromo ? (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-[16px] font-medium text-[#9a8bb8] line-through">
            <span className="sr-only">Обычная цена </span>
            {formatRubles(display.regularPrice)}
          </p>
          <p className="text-[36px] font-semibold leading-none text-[#25135c]">
            <span className="sr-only">Специальная цена </span>
            {formatRubles(display.promoPrice)}
          </p>
        </div>
      ) : (
        <p className="text-[32px] font-semibold leading-none text-[#25135c]">
          {formatRubles(display.regularPrice)}
        </p>
      )}

      {display.showPromo ? (
        <div className="text-center">
          <p className="text-sm font-medium text-[#5f4a8f]">
            {MEDITATION_SOLUTIONS_TIMER_CAPTION}
          </p>
          <p
            data-meditation-solutions-countdown
            aria-hidden="true"
            className="mt-1 text-[28px] font-semibold tabular-nums leading-none tracking-wide text-[#25135c]"
          >
            {display.remainingLabel}
          </p>
        </div>
      ) : null}

      {display.canPurchase ? (
        <BuyPracticeButton
          practiceSlug={
            offer.practice?.slug ?? MEDITATION_SOLUTIONS_PRACTICE_SLUG
          }
          practiceId={offer.practice?.id ?? null}
          authorId={offer.practice?.authorId ?? null}
          productPriceMinorSnapshot={display.chargePriceMinor}
          currency="RUB"
          purchaseSurface="sales_landing"
          ctaPlacement={placement}
          label={MEDITATION_SOLUTIONS_BUY_LABEL}
          signInReturnPath={MEDITATION_SOLUTIONS_PUBLIC_PATH}
          className={buyButtonClass}
        />
      ) : (
        <button
          type="button"
          disabled
          aria-busy="true"
          className={buyButtonClass}
        >
          {MEDITATION_SOLUTIONS_BUY_LABEL}
        </button>
      )}

      {display.showPromo ? (
        <p className="text-center text-[13px] leading-5 text-[#7d70a2]">
          {MEDITATION_SOLUTIONS_ONCE_NOTE}
        </p>
      ) : null}

      {placement === "bottom" ? <PurchaseConsent /> : null}
    </section>
  );
}
