import {
  formatTimerMmSs,
  resolveOfferDisplayPricing,
  type OfferDisplayPricing,
} from "@/lib/quick-offers/pricing";
import { rublesToMinor } from "@/lib/pricing/money";

import {
  MEDITATION_SOLUTIONS_BASE_PRICE_RUB,
  MEDITATION_SOLUTIONS_SALE_PRICE_RUB,
  MEDITATION_SOLUTIONS_TIMER_SECONDS,
} from "./content";

export type MeditationSolutionsOfferDisplay = OfferDisplayPricing & {
  remainingSeconds: number;
  remainingLabel: string;
  chargePriceMinor: number;
};

export function resolveMeditationSolutionsOfferDisplay(input: {
  nowMs: number;
  expiresAt: string | null | undefined;
  basePrice?: number;
  salePrice?: number;
}): MeditationSolutionsOfferDisplay {
  const basePrice =
    typeof input.basePrice === "number" && Number.isInteger(input.basePrice)
      ? input.basePrice
      : MEDITATION_SOLUTIONS_BASE_PRICE_RUB;
  const salePrice =
    typeof input.salePrice === "number" && Number.isInteger(input.salePrice)
      ? input.salePrice
      : MEDITATION_SOLUTIONS_SALE_PRICE_RUB;

  const pricing = resolveOfferDisplayPricing({
    regularPrice: basePrice,
    promoPrice: salePrice,
    nowMs: input.nowMs,
    durationSeconds: MEDITATION_SOLUTIONS_TIMER_SECONDS,
    expiresAt: input.expiresAt,
  });

  const remainingSeconds = pricing.showPromo
    ? Math.max(
        0,
        Math.ceil((Date.parse(input.expiresAt ?? "") - input.nowMs) / 1000),
      )
    : 0;

  return {
    ...pricing,
    remainingSeconds,
    remainingLabel: formatTimerMmSs(remainingSeconds),
    chargePriceMinor: rublesToMinor(pricing.chargePrice),
  };
}
