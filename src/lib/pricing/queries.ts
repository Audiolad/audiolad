import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mapPersonalPromotionStart,
  mapPricePromotionRow,
  PRICE_PROMOTION_SELECT,
  PRICE_PROMOTION_START_SELECT,
} from "@/lib/pricing/map";
import {
  PRICE_SURFACES,
  type PersonalPromotionStart,
  type PricePromotionRecord,
  type PriceSurface,
  type ResolvedPracticePrice,
} from "@/lib/pricing/types";
import { resolvePracticePrice } from "@/lib/pricing/resolve";

export async function loadPricePromotionsForPractices(
  supabase: SupabaseClient,
  practiceIds: string[],
): Promise<Map<string, PricePromotionRecord[]>> {
  const result = new Map<string, PricePromotionRecord[]>();

  if (practiceIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("practice_price_promotions")
    .select(PRICE_PROMOTION_SELECT)
    .in("practice_id", practiceIds)
    .eq("is_active", true);

  if (error) {
    console.error("price_promotions_load_error", error.message);
    return result;
  }

  for (const row of data ?? []) {
    const mapped = mapPricePromotionRow(row as Parameters<typeof mapPricePromotionRow>[0]);

    if (!mapped) {
      continue;
    }

    const list = result.get(mapped.practiceId) ?? [];
    list.push(mapped);
    result.set(mapped.practiceId, list);
  }

  return result;
}

export async function loadPricePromotionsForPractice(
  supabase: SupabaseClient,
  practiceId: string,
): Promise<PricePromotionRecord[]> {
  const map = await loadPricePromotionsForPractices(supabase, [practiceId]);
  return map.get(practiceId) ?? [];
}

/**
 * Loads one saved promotion for author preview, including inactive rows.
 * Does not load or write `practice_price_promotion_starts`.
 */
export async function loadPricePromotionByIdForPractice(
  supabase: SupabaseClient,
  practiceId: string,
  promotionId: string,
): Promise<PricePromotionRecord | null> {
  const trimmedPracticeId = practiceId.trim();
  const trimmedPromotionId = promotionId.trim();

  if (!trimmedPracticeId || !trimmedPromotionId) {
    return null;
  }

  const { data, error } = await supabase
    .from("practice_price_promotions")
    .select(PRICE_PROMOTION_SELECT)
    .eq("id", trimmedPromotionId)
    .eq("practice_id", trimmedPracticeId)
    .maybeSingle();

  if (error) {
    console.error("price_promotion_preview_load_error", error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return mapPricePromotionRow(data as Parameters<typeof mapPricePromotionRow>[0]);
}

export async function loadPersonalPromotionStarts(input: {
  supabase: SupabaseClient;
  practiceId: string;
  visitorId: string | null;
  userId: string | null;
}): Promise<PersonalPromotionStart[]> {
  if (!input.visitorId && !input.userId) {
    return [];
  }

  const { data: promotions, error: promotionsError } = await input.supabase
    .from("practice_price_promotions")
    .select("id")
    .eq("practice_id", input.practiceId)
    .eq("promotion_type", "personal_countdown")
    .eq("is_active", true);

  if (promotionsError) {
    console.error("price_promotion_ids_load_error", promotionsError.message);
    return [];
  }

  const promotionIds = (promotions ?? []).map((row) => row.id as string);

  if (promotionIds.length === 0) {
    return [];
  }

  let query = input.supabase
    .from("practice_price_promotion_starts")
    .select(PRICE_PROMOTION_START_SELECT)
    .in("promotion_id", promotionIds);

  if (input.visitorId && input.userId) {
    query = query.or(`visitor_id.eq.${input.visitorId},user_id.eq.${input.userId}`);
  } else if (input.visitorId) {
    query = query.eq("visitor_id", input.visitorId);
  } else if (input.userId) {
    query = query.eq("user_id", input.userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("price_promotion_starts_load_error", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    mapPersonalPromotionStart(row as Parameters<typeof mapPersonalPromotionStart>[0]),
  );
}

export async function resolvePracticePriceForSurface(input: {
  supabase: SupabaseClient;
  practiceId: string;
  isFree: boolean | null | undefined;
  basePrice: number | null | undefined;
  surface: PriceSurface;
  visitorId?: string | null;
  userId?: string | null;
  now?: Date;
}): Promise<ResolvedPracticePrice> {
  const promotions = await loadPricePromotionsForPractice(
    input.supabase,
    input.practiceId,
  );
  const starts =
    input.surface === PRICE_SURFACES.CATALOG
      ? []
      : await loadPersonalPromotionStarts({
          supabase: input.supabase,
          practiceId: input.practiceId,
          visitorId: input.visitorId ?? null,
          userId: input.userId ?? null,
        });

  return resolvePracticePrice({
    isFree: input.isFree,
    basePrice: input.basePrice,
    promotions,
    starts,
    now: input.now,
    surface: input.surface,
  });
}
