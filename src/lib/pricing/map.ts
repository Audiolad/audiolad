import { isPricePromotionType } from "@/lib/pricing/resolve";
import type {
  PersonalPromotionStart,
  PricePromotionRecord,
} from "@/lib/pricing/types";

type PromotionRow = {
  id: string;
  practice_id: string;
  name: string;
  promotion_type: string;
  sale_price: number;
  starts_at: string | null;
  ends_at: string | null;
  duration_seconds: number | null;
  above_timer_text?: string | null;
  below_button_text?: string | null;
  is_active: boolean;
  start_token: string;
  created_at: string;
  updated_at: string;
};

type StartRow = {
  id: string;
  promotion_id: string;
  visitor_id: string;
  user_id: string | null;
  started_at: string;
  expires_at: string;
  sale_price_snapshot: number;
};

export function mapPricePromotionRow(row: PromotionRow): PricePromotionRecord | null {
  if (!isPricePromotionType(row.promotion_type)) {
    return null;
  }

  if (!Number.isInteger(row.sale_price)) {
    return null;
  }

  return {
    id: row.id,
    practiceId: row.practice_id,
    name: row.name,
    promotionType: row.promotion_type,
    salePrice: row.sale_price,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationSeconds: row.duration_seconds,
    aboveTimerText:
      typeof row.above_timer_text === "string" ? row.above_timer_text : null,
    belowButtonText:
      typeof row.below_button_text === "string" ? row.below_button_text : null,
    isActive: row.is_active === true,
    startToken: row.start_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPersonalPromotionStart(
  row: StartRow,
): PersonalPromotionStart {
  return {
    id: row.id,
    promotionId: row.promotion_id,
    visitorId: row.visitor_id,
    userId: row.user_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    salePriceSnapshot: row.sale_price_snapshot,
  };
}

export const PRICE_PROMOTION_SELECT =
  "id, practice_id, name, promotion_type, sale_price, starts_at, ends_at, duration_seconds, above_timer_text, below_button_text, is_active, start_token, created_at, updated_at";

export const PRICE_PROMOTION_START_SELECT =
  "id, promotion_id, visitor_id, user_id, started_at, expires_at, sale_price_snapshot";
