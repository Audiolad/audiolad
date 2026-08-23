export const PRICE_PROMOTION_TYPES = {
  CALENDAR: "calendar",
  PERSONAL_COUNTDOWN: "personal_countdown",
} as const;

export type PricePromotionType =
  (typeof PRICE_PROMOTION_TYPES)[keyof typeof PRICE_PROMOTION_TYPES];

export const PRICE_SURFACES = {
  CATALOG: "catalog",
  PRODUCT: "product",
  CHECKOUT: "checkout",
} as const;

export type PriceSurface = (typeof PRICE_SURFACES)[keyof typeof PRICE_SURFACES];

export type PricePromotionRecord = {
  id: string;
  practiceId: string;
  name: string;
  promotionType: PricePromotionType;
  salePrice: number;
  startsAt: string | null;
  endsAt: string | null;
  durationSeconds: number | null;
  isActive: boolean;
  startToken: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalPromotionStart = {
  id: string;
  promotionId: string;
  visitorId: string;
  userId: string | null;
  startedAt: string;
  expiresAt: string;
};

export type ResolvedPromotion = {
  id: string;
  name: string;
  promotionType: PricePromotionType;
  salePrice: number;
  endsAt: string | null;
  expiresAt: string | null;
};

export type ResolvedPracticePrice = {
  isFree: boolean;
  basePrice: number;
  salePrice: number | null;
  finalPrice: number;
  promotion: ResolvedPromotion | null;
  basePriceMinor: number;
  salePriceMinor: number | null;
  finalPriceMinor: number;
};

export type PriceChangedPayload = {
  error: "price_changed";
  current_amount_minor: number;
  base_price_minor: number;
  promotion_price_minor: number | null;
  promotion_id: string | null;
  promotion_type: PricePromotionType | null;
  message: string;
};
