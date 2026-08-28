import { rublesToMinor } from "@/lib/pricing/money";
import {
  chooseCanonicalPersonalStart,
  classifyPersonalCountdownViewerState,
  isPersonalCountdownDefinitionActive,
  isPersonalStartActive,
  PERSONAL_COUNTDOWN_VIEWER_STATES,
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
  /**
   * Catalog listing only. Teases never-started / in-window personal
   * countdown without starting a row. Product/checkout ignore this flag.
   */
  catalogPersonalTeaser?: boolean;
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
  return isPersonalCountdownDefinitionActive(promotion);
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

function isValidSaleAgainstBase(salePrice: number, basePrice: number): boolean {
  return (
    Number.isInteger(salePrice) && salePrice > 0 && salePrice < basePrice
  );
}

function personalStartSalePrice(
  start: PersonalPromotionStart,
  basePrice: number,
): number | null {
  // Apply the frozen snapshot only while it is still below the current base.
  // Do not mutate the start row when the snapshot is no longer valid.
  if (!isValidSaleAgainstBase(start.salePriceSnapshot, basePrice)) {
    return null;
  }

  return start.salePriceSnapshot;
}

function toResolvedPromotion(
  promotion: PricePromotionRecord,
  expiresAt: string | null,
  salePrice: number,
): ResolvedPromotion {
  return {
    id: promotion.id,
    name: promotion.name,
    promotionType: promotion.promotionType,
    salePrice,
    endsAt: promotion.endsAt,
    expiresAt,
    aboveTimerText: promotion.aboveTimerText ?? null,
    belowButtonText: promotion.belowButtonText ?? null,
  };
}

function personalCatalogTeaserOffer(
  promotion: PricePromotionRecord,
  starts: PersonalPromotionStart[],
  nowMs: number,
  basePrice: number,
): { salePrice: number; expiresAt: string | null } | null {
  const viewerState = classifyPersonalCountdownViewerState(
    promotion,
    starts,
    nowMs,
  );

  if (viewerState === PERSONAL_COUNTDOWN_VIEWER_STATES.NEVER_STARTED) {
    if (!isValidSaleAgainstBase(promotion.salePrice, basePrice)) {
      return null;
    }

    return { salePrice: promotion.salePrice, expiresAt: null };
  }

  if (viewerState !== PERSONAL_COUNTDOWN_VIEWER_STATES.ACTIVE) {
    return null;
  }

  const start = findActivePersonalStart(promotion, starts, nowMs);

  if (!start) {
    return null;
  }

  const salePrice = personalStartSalePrice(start, basePrice);

  if (salePrice === null) {
    return null;
  }

  return { salePrice, expiresAt: start.expiresAt };
}

/**
 * Picks at most one applicable promotion.
 * Calendar promotions apply on every surface using live sale_price.
 * Personal countdown applies on product/checkout only after a start, unless
 * `catalogPersonalTeaser` is set: then catalog may tease NEVER_STARTED or
 * ACTIVE personal (not EXPIRED).
 * NEVER_STARTED catalog teaser uses live promotion.sale_price.
 * An active personal start uses start.salePriceSnapshot, not live sale_price,
 * and only when snapshot > 0 AND snapshot < the current practice base price.
 * Otherwise the effective price is the current base. The start row is not rewritten.
 * Name / above_timer_text / below_button_text stay on the live promotion row.
 * Disable (is_active=false) still stops the offer.
 * If several apply, the lowest valid effective sale price wins (no stacking).
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
  const allowPersonalCatalogTeaser =
    input.surface === PRICE_SURFACES.CATALOG &&
    input.catalogPersonalTeaser === true;

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
    salePrice: number;
  } | null = null;

  for (const promotion of input.promotions) {
    if (isCalendarActive(promotion, nowMs)) {
      if (!isValidSaleAgainstBase(promotion.salePrice, basePrice)) {
        continue;
      }

      if (!winner || promotion.salePrice < winner.salePrice) {
        winner = {
          promotion,
          expiresAt: promotion.endsAt,
          salePrice: promotion.salePrice,
        };
      }
      continue;
    }

    if (allowPersonalCatalogTeaser && isPersonalDefinitionActive(promotion)) {
      const teaser = personalCatalogTeaserOffer(
        promotion,
        input.starts,
        nowMs,
        basePrice,
      );

      if (teaser && (!winner || teaser.salePrice < winner.salePrice)) {
        winner = {
          promotion,
          expiresAt: teaser.expiresAt,
          salePrice: teaser.salePrice,
        };
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

    const salePrice = personalStartSalePrice(start, basePrice);

    if (salePrice === null) {
      continue;
    }

    if (!winner || salePrice < winner.salePrice) {
      winner = { promotion, expiresAt: start.expiresAt, salePrice };
    }
  }

  const salePrice = winner?.salePrice ?? null;
  const finalPrice = salePrice ?? basePrice;

  return {
    isFree: false,
    basePrice,
    salePrice,
    finalPrice,
    promotion: winner
      ? toResolvedPromotion(winner.promotion, winner.expiresAt, winner.salePrice)
      : null,
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
