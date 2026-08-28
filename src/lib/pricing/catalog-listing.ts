import {
  classifyPersonalCountdownViewerState,
  PERSONAL_COUNTDOWN_VIEWER_STATES,
} from "@/lib/pricing/personal-start";
import { resolvePracticePrice } from "@/lib/pricing/resolve";
import {
  PRICE_PROMOTION_TYPES,
  PRICE_SURFACES,
  type PersonalPromotionStart,
  type PricePromotionRecord,
  type ResolvedPracticePrice,
} from "@/lib/pricing/types";
import { formatRubles, getProductPriceLabel } from "@/lib/products/price-format";
import {
  buildPracticePromoStartPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";

export type CatalogListingPriceView = {
  isFree: boolean;
  price: number | null;
  compareAtPrice: number | null;
  priceLabel: string;
  compareAtPriceLabel: string | null;
  href: string;
  promotionEndsAt: string | null;
  resolved: ResolvedPracticePrice;
};

export function resolveNeverStartedPersonalStartToken(input: {
  resolved: ResolvedPracticePrice;
  promotions: PricePromotionRecord[];
  starts: PersonalPromotionStart[];
  nowMs: number;
}): string | null {
  const winner = input.resolved.promotion;

  if (
    !winner ||
    winner.promotionType !== PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN
  ) {
    return null;
  }

  const promotion = input.promotions.find((row) => row.id === winner.id);

  if (!promotion) {
    return null;
  }

  const viewerState = classifyPersonalCountdownViewerState(
    promotion,
    input.starts,
    input.nowMs,
  );

  if (viewerState !== PERSONAL_COUNTDOWN_VIEWER_STATES.NEVER_STARTED) {
    return null;
  }

  const token = promotion.startToken.trim();
  return token || null;
}

/**
 * Catalog listing display + PDP href.
 * Does not start a promotion. NEVER_STARTED personal winner gets `?promo=`.
 */
export function buildCatalogListingPriceView(input: {
  isFree: boolean | null | undefined;
  basePrice: number | null | undefined;
  promotions: PricePromotionRecord[];
  starts: PersonalPromotionStart[];
  authorSlug: string;
  productSlug: string;
  now?: Date;
  personalTeaser: boolean;
}): CatalogListingPriceView {
  const resolved = resolvePracticePrice({
    isFree: input.isFree,
    basePrice: input.basePrice,
    promotions: input.promotions,
    starts: input.starts,
    now: input.now,
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: input.personalTeaser,
  });
  const nowMs = (input.now ?? new Date()).getTime();
  const startToken = input.personalTeaser
    ? resolveNeverStartedPersonalStartToken({
        resolved,
        promotions: input.promotions,
        starts: input.starts,
        nowMs,
      })
    : null;
  const href = startToken
    ? buildPracticePromoStartPath(input.authorSlug, input.productSlug, startToken)
    : buildPracticePublicPath(input.authorSlug, input.productSlug);
  const compareAtPrice =
    !resolved.isFree && resolved.promotion ? resolved.basePrice : null;

  return {
    isFree: resolved.isFree,
    price: resolved.isFree ? input.basePrice ?? null : resolved.finalPrice,
    compareAtPrice,
    priceLabel: resolved.isFree
      ? getProductPriceLabel(input.basePrice, input.isFree)
      : formatRubles(resolved.finalPrice),
    compareAtPriceLabel:
      compareAtPrice === null ? null : formatRubles(compareAtPrice),
    href,
    promotionEndsAt: resolved.promotion?.endsAt ?? null,
    resolved,
  };
}
