import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPricePromotionByIdForPractice } from "@/lib/pricing/queries";
import { resolvePracticePrice } from "@/lib/pricing/resolve";
import {
  PRICE_PROMOTION_TYPES,
  PRICE_SURFACES,
  type PersonalPromotionStart,
  type PricePromotionRecord,
  type ResolvedPracticePrice,
} from "@/lib/pricing/types";
import type { ProductAccessResult } from "@/lib/products/access";
import { isPracticePublished } from "@/lib/products/access";

export const PRACTICE_PROMO_PREVIEW_QUERY_PARAM = "promo_preview";

/** Synthetic visitor id. Not a UUID, so it cannot be persisted as a buyer cookie. */
export const AUTHOR_PROMO_PREVIEW_VISITOR_ID = "author-promo-preview";

export function parsePromoPreviewId(
  value: string | null | undefined,
): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

/**
 * Author-only gate for the display-only personal-timer simulation.
 * Same membership as existing author preview (`isAuthorMember`).
 * Strangers with the URL get no simulated sale.
 */
export function canActivatePromoPreviewMode(input: {
  promoPreviewId: string | null | undefined;
  access: Pick<ProductAccessResult, "isAuthorMember">;
}): boolean {
  return (
    parsePromoPreviewId(input.promoPreviewId) !== null &&
    input.access.isAuthorMember === true
  );
}

/**
 * Real buyer `?promo=` must never start a window while the author
 * preview signal is active. Ordinary buyer start stays unchanged.
 */
export function shouldMountPricePromotionStartHandler(input: {
  promoStartToken: string | null | undefined;
  promoPreviewMode: boolean;
}): boolean {
  return Boolean(input.promoStartToken?.trim()) && !input.promoPreviewMode;
}

export function buildSyntheticAuthorPromoStart(input: {
  promotionId: string;
  durationSeconds: number;
  now: Date;
  salePriceSnapshot: number;
}): PersonalPromotionStart {
  const startedAt = input.now.toISOString();
  const expiresAt = new Date(
    input.now.getTime() + input.durationSeconds * 1000,
  ).toISOString();

  return {
    id: `author-promo-preview:${input.promotionId}`,
    promotionId: input.promotionId,
    visitorId: AUTHOR_PROMO_PREVIEW_VISITOR_ID,
    userId: null,
    startedAt,
    expiresAt,
    salePriceSnapshot: input.salePriceSnapshot,
  };
}

/**
 * Display-only resolve: synthesizes an active personal start in memory.
 * Does not write starts, bind user_id, or require a visitor cookie.
 */
export function resolveAuthorPromoPreviewPrice(input: {
  isFree: boolean | null | undefined;
  basePrice: number | null | undefined;
  promotion: PricePromotionRecord | null;
  now?: Date;
}): ResolvedPracticePrice | null {
  const promotion = input.promotion;

  if (
    !promotion ||
    promotion.promotionType !== PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN
  ) {
    return null;
  }

  const durationSeconds = promotion.durationSeconds;

  if (
    typeof durationSeconds !== "number" ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return null;
  }

  const now = input.now ?? new Date();
  const previewPromotion: PricePromotionRecord = {
    ...promotion,
    isActive: true,
  };
  const start = buildSyntheticAuthorPromoStart({
    promotionId: previewPromotion.id,
    durationSeconds,
    now,
    salePriceSnapshot: previewPromotion.salePrice,
  });

  const resolved = resolvePracticePrice({
    isFree: input.isFree,
    basePrice: input.basePrice,
    promotions: [previewPromotion],
    starts: [start],
    now,
    surface: PRICE_SURFACES.PRODUCT,
  });

  return resolved.promotion ? resolved : null;
}

/**
 * Reuses existing listener / buyer presentation so the author sees
 * the standard PDP CTAs, not a second promo layout.
 */
export function resolvePromoPreviewPresentationFlags(input: {
  promoPreviewMode: boolean;
  practiceStatus: string | null | undefined;
  publishPreviewMode: boolean;
  publishListenerViewMode: boolean;
  buyerPreviewMode: boolean;
  canUseBuyerPreview: boolean;
}): {
  publishPreviewMode: boolean;
  publishListenerViewMode: boolean;
  buyerPreviewMode: boolean;
} {
  if (!input.promoPreviewMode) {
    return {
      publishPreviewMode: input.publishPreviewMode,
      publishListenerViewMode: input.publishListenerViewMode,
      buyerPreviewMode: input.buyerPreviewMode,
    };
  }

  if (!isPracticePublished(input.practiceStatus)) {
    return {
      publishPreviewMode: true,
      publishListenerViewMode: true,
      buyerPreviewMode: false,
    };
  }

  if (input.canUseBuyerPreview) {
    return {
      publishPreviewMode: false,
      publishListenerViewMode: false,
      buyerPreviewMode: true,
    };
  }

  return {
    publishPreviewMode: input.publishPreviewMode,
    publishListenerViewMode: input.publishListenerViewMode,
    buyerPreviewMode: input.buyerPreviewMode,
  };
}

export async function resolveAuthorPromoPreview(input: {
  supabase: SupabaseClient;
  practiceId: string;
  promotionId: string;
  isFree: boolean | null | undefined;
  basePrice: number | null | undefined;
  isAuthorMember: boolean;
  now?: Date;
}): Promise<ResolvedPracticePrice | null> {
  if (!input.isAuthorMember) {
    return null;
  }

  const promotion = await loadPricePromotionByIdForPractice(
    input.supabase,
    input.practiceId,
    input.promotionId,
  );

  return resolveAuthorPromoPreviewPrice({
    isFree: input.isFree,
    basePrice: input.basePrice,
    promotion,
    now: input.now,
  });
}
