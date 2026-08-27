import type { SupabaseClient } from "@supabase/supabase-js";

import { PRICE_CHANGED_MESSAGE } from "@/lib/pricing/resolve";
import { isPricePromotionType } from "@/lib/pricing/resolve";
import {
  PRICE_PROMOTION_TYPES,
  type PricePromotionType,
  type PriceSurface,
  type ResolvedPracticePrice,
  type ResolvedPromotion,
} from "@/lib/pricing/types";
import { formatRubles } from "@/lib/products/price-format";

type RpcRow = {
  is_free: boolean;
  base_price: number;
  sale_price: number | null;
  final_price: number;
  promotion_id: string | null;
  promotion_name: string | null;
  promotion_type: string | null;
  ends_at: string | null;
  expires_at: string | null;
  base_price_minor: number;
  sale_price_minor: number | null;
  final_price_minor: number;
};

function asInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

export function mapResolvedPriceRpcRow(row: RpcRow): ResolvedPracticePrice {
  const promotionType = isPricePromotionType(row.promotion_type)
    ? row.promotion_type
    : null;
  const promotion: ResolvedPromotion | null =
    row.promotion_id && promotionType && row.sale_price !== null
      ? {
          id: row.promotion_id,
          name: row.promotion_name ?? "",
          promotionType,
          salePrice: asInteger(row.sale_price),
          endsAt: row.ends_at,
          expiresAt: row.expires_at,
          aboveTimerText: null,
          belowButtonText: null,
        }
      : null;

  return {
    isFree: row.is_free === true,
    basePrice: asInteger(row.base_price),
    salePrice: row.sale_price === null ? null : asInteger(row.sale_price),
    finalPrice: asInteger(row.final_price),
    promotion,
    basePriceMinor: asInteger(row.base_price_minor),
    salePriceMinor:
      row.sale_price_minor === null ? null : asInteger(row.sale_price_minor),
    finalPriceMinor: asInteger(row.final_price_minor),
  };
}

export async function bindPracticePricePromotionStarts(input: {
  supabase: SupabaseClient;
  visitorId?: string | null;
  userId?: string | null;
}): Promise<void> {
  if (!input.visitorId || !input.userId) {
    return;
  }

  const { error } = await input.supabase.rpc(
    "bind_practice_price_promotion_starts",
    {
      p_visitor_id: input.visitorId,
      p_user_id: input.userId,
    },
  );

  if (error) {
    console.error("bind_practice_price_promotion_starts_error", error.message);
  }
}

export async function resolvePracticePriceRpc(input: {
  supabase: SupabaseClient;
  practiceId: string;
  surface: PriceSurface;
  visitorId?: string | null;
  userId?: string | null;
  now?: Date;
}): Promise<ResolvedPracticePrice | null> {
  await bindPracticePricePromotionStarts({
    supabase: input.supabase,
    visitorId: input.visitorId,
    userId: input.userId,
  });

  const { data, error } = await input.supabase.rpc(
    "resolve_practice_effective_price",
    {
      p_practice_id: input.practiceId,
      p_surface: input.surface,
      p_visitor_id: input.visitorId ?? null,
      p_user_id: input.userId ?? null,
      p_now: (input.now ?? new Date()).toISOString(),
    },
  );

  if (error) {
    console.error("resolve_practice_effective_price_rpc_error", error.message);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined;

  if (!row) {
    return null;
  }

  return attachPersonalTimerCopy(input.supabase, mapResolvedPriceRpcRow(row));
}

async function attachPersonalTimerCopy(
  supabase: SupabaseClient,
  resolved: ResolvedPracticePrice,
): Promise<ResolvedPracticePrice> {
  if (
    !resolved.promotion ||
    resolved.promotion.promotionType !== PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN
  ) {
    return resolved;
  }

  const { data, error } = await supabase
    .from("practice_price_promotions")
    .select("above_timer_text, below_button_text")
    .eq("id", resolved.promotion.id)
    .maybeSingle();

  if (error) {
    console.error("personal_timer_copy_load_error", error.message);
    return resolved;
  }

  return {
    ...resolved,
    promotion: {
      ...resolved.promotion,
      aboveTimerText:
        typeof data?.above_timer_text === "string" ? data.above_timer_text : null,
      belowButtonText:
        typeof data?.below_button_text === "string"
          ? data.below_button_text
          : null,
    },
  };
}

export function buildPriceChangedPayload(resolved: ResolvedPracticePrice): {
  error: "price_changed";
  current_amount_minor: number;
  base_price_minor: number;
  promotion_price_minor: number | null;
  promotion_id: string | null;
  promotion_type: PricePromotionType | null;
  message: string;
} {
  return {
    error: "price_changed",
    current_amount_minor: resolved.finalPriceMinor,
    base_price_minor: resolved.basePriceMinor,
    promotion_price_minor: resolved.salePriceMinor,
    promotion_id: resolved.promotion?.id ?? null,
    promotion_type: resolved.promotion?.promotionType ?? null,
    message: `${PRICE_CHANGED_MESSAGE}${formatRubles(resolved.finalPrice)}.`,
  };
}
