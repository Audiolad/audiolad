import { rublesToMinor } from "@/lib/pricing/money";
import {
  chooseCanonicalPersonalStart,
  isPersonalStartActive,
} from "@/lib/pricing/personal-start";
import {
  PRICE_PROMOTION_TYPES,
  PRICE_SURFACES,
  type PersonalPromotionStart,
  type PricePromotionRecord,
  type PricePromotionType,
  type PriceSurface,
  type ResolvedPracticePrice,
  type ResolvedPromotion,
} from "@/lib/pricing/types";

export type ResolvePracticePriceInput = {
  isFree: boolean | null | undefined;
  basePrice: number | null | undefined;
  promotions: PricePromotionRecord[];
  starts: PersonalPromotionStart[];
  now?: Date;
  surface: PriceSurface;
};

function toTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isCalendarActive(promotion: PricePromotionRecord, nowMs: number): boolean {
  if (
    promotion.promotionType !== PRICE_PROMOTION_TYPES.CALENDAR ||
    !promotion.isActive
  ) {
    return false;
  }

  const startsAt = toTime(promotion.startsAt);
  const endsAt = toTime(promotion.endsAt);

  if (startsAt === null || endsAt === null || endsAt <= startsAt) {
    return false;
  }

  return nowMs >= startsAt && nowMs < endsAt;
}

function isPersonalDefinitionActive(promotion: PricePromotionRecord): boolean {
  return (
    promotion.promotionType === PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN &&
    promotion.isActive &&
    typeof promotion.durationSeconds === "number" &&
    Number.isInteger(promotion.durationSeconds) &&
    promotion.durationSeconds > 0
  );
}

function findActivePersonalStart(
  promotion: PricePromotionRecord,
  starts: PersonalPromotionStart[],
  nowMs: number,
): PersonalPromotionStart | null {
  const canonical = chooseCanonicalPersonalStart(starts, promotion.id);

  if (!canonical || !isPersonalStartActive(canonical, nowMs)) {
    return null;
  }

  return canonical;
}

function toResolvedPromotion(
  promotion: PricePromotionRecord,
  expiresAt: string | null,
): ResolvedPromotion {
  return {
    id: promotion.id,
    name: promotion.name,
    promotionType: promotion.promotionType,
    salePrice: promotion.salePrice,
    endsAt: promotion.endsAt,
    expiresAt,
    aboveTimerText: promotion.aboveTimerText ?? null,
    belowButtonText: promotion.belowButtonText ?? null,
  };
}

/**
 * Picks at most one applicable promotion.
 * Calendar promotions apply on every surface.
 * Personal countdown applies on product/checkout only, and only after a start.
 * If several apply, the lowest valid sale price wins (no stacking).
 */
export function resolvePracticePrice(
  input: ResolvePracticePriceInput,
): ResolvedPracticePrice {
  const isFree = input.isFree === true;
  const basePrice =
    typeof input.basePrice === "number" && Number.isInteger(input.basePrice)
      ? input.basePrice
      : 0;
  const nowMs = (input.now ?? new Date()).getTime();
  const allowPersonal = input.surface !== PRICE_SURFACES.CATALOG;

  if (isFree || basePrice <= 0) {
    return {
      isFree: true,
      basePrice: 0,
      salePrice: null,
      finalPrice: 0,
      promotion: null,
      basePriceMinor: 0,
      salePriceMinor: null,
      finalPriceMinor: 0,
    };
  }

  let winner: {
    promotion: PricePromotionRecord;
    expiresAt: string | null;
  } | null = null;

  for (const promotion of input.promotions) {
    if (
      !Number.isInteger(promotion.salePrice) ||
      promotion.salePrice <= 0 ||
      promotion.salePrice >= basePrice
    ) {
      continue;
    }

    if (isCalendarActive(promotion, nowMs)) {
      if (!winner || promotion.salePrice < winner.promotion.salePrice) {
        winner = { promotion, expiresAt: promotion.endsAt };
      }
      continue;
    }

    if (!allowPersonal || !isPersonalDefinitionActive(promotion)) {
      continue;
    }

    const start = findActivePersonalStart(promotion, input.starts, nowMs);

    if (!start) {
      continue;
    }

    if (!winner || promotion.salePrice < winner.promotion.salePrice) {
      winner = { promotion, expiresAt: start.expiresAt };
    }
  }

  const salePrice = winner?.promotion.salePrice ?? null;
  const finalPrice = salePrice ?? basePrice;

  return {
    isFree: false,
    basePrice,
    salePrice,
    finalPrice,
    promotion: winner ? toResolvedPromotion(winner.promotion, winner.expiresAt) : null,
    basePriceMinor: rublesToMinor(basePrice),
    salePriceMinor: salePrice === null ? null : rublesToMinor(salePrice),
    finalPriceMinor: rublesToMinor(finalPrice),
  };
}

export function isPricePromotionType(value: unknown): value is PricePromotionType {
  return (
    value === PRICE_PROMOTION_TYPES.CALENDAR ||
    value === PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN
  );
}

export const PRICE_CHANGED_MESSAGE =
  "Цена изменилась или акция закончилась. Актуальная стоимость: ";
