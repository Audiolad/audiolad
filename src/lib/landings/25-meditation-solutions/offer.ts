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
  windowSynced: boolean;
  canPurchase: boolean;
};

export function resolveMeditationSolutionsOfferDisplay(input: {
  nowMs: number;
  expiresAt: string | null | undefined;
  basePrice?: number;
  salePrice?: number;
  windowSynced?: boolean;
}): MeditationSolutionsOfferDisplay {
  const basePrice =
    typeof input.basePrice === "number" && Number.isInteger(input.basePrice)
      ? input.basePrice
      : MEDITATION_SOLUTIONS_BASE_PRICE_RUB;
  const salePrice =
    typeof input.salePrice === "number" && Number.isInteger(input.salePrice)
      ? input.salePrice
      : MEDITATION_SOLUTIONS_SALE_PRICE_RUB;
  const windowSynced = input.windowSynced === true;

  const pricing = resolveOfferDisplayPricing({
    regularPrice: basePrice,
    promoPrice: salePrice,
    nowMs: input.nowMs,
    durationSeconds: MEDITATION_SOLUTIONS_TIMER_SECONDS,
    expiresAt: input.expiresAt,
  });

  const awaitingFirstWindow = !windowSynced && !input.expiresAt;
  const showPromo = awaitingFirstWindow ? true : pricing.showPromo;
  const chargePrice = showPromo ? salePrice : pricing.chargePrice;
  const remainingSeconds = awaitingFirstWindow
    ? MEDITATION_SOLUTIONS_TIMER_SECONDS
    : pricing.showPromo
      ? Math.max(
          0,
          Math.ceil((Date.parse(input.expiresAt ?? "") - input.nowMs) / 1000),
        )
      : 0;

  return {
    ...pricing,
    showPromo,
    chargePrice,
    remainingSeconds,
    remainingLabel: formatTimerMmSs(remainingSeconds),
    chargePriceMinor: rublesToMinor(chargePrice),
    windowSynced,
    canPurchase: windowSynced,
  };
}
