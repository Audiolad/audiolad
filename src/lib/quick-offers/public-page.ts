import { cache } from "react";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapPublicMaterial, mapQuickOfferAdminDto } from "@/lib/quick-offers/mappers";
import type { PublicQuickOfferDto } from "@/lib/quick-offers/types";

export type LoadPublicQuickOfferResult =
  | { ok: true; offer: PublicQuickOfferDto }
  | { ok: false; reason: "not_found" | "error" };

function mapRpcPublicOffer(raw: unknown): PublicQuickOfferDto | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const mapped = mapQuickOfferAdminDto(raw as Record<string, unknown>);

  if (!mapped.product || mapped.status !== "published") {
    return null;
  }

  return {
    id: mapped.id,
    slug: mapped.slug,
    title: mapped.title,
    short_description: mapped.short_description,
    hero_image_url: mapped.hero_image_url,
    cta_text: mapped.cta_text,
    timer_duration_seconds: mapped.timer_duration_seconds,
    template_key: mapped.template_key,
    mid_cta_after_count: mapped.mid_cta_after_count,
    regular_price: mapped.product.price,
    promo_price: mapped.promo_price,
    practice_id: mapped.product.practice_id,
    practice_slug: mapped.product.slug,
    author_id: mapped.author_id,
    materials: mapped.materials.map(mapPublicMaterial),
  };
}

async function loadPublicQuickOffer(
  supabase: SupabaseClient,
  slug: string,
): Promise<LoadPublicQuickOfferResult> {
  const normalized = slug.trim();

  if (!normalized) {
    return { ok: false, reason: "not_found" };
  }

  const { data, error } = await supabase.rpc("get_public_quick_offer", {
    p_slug: normalized,
  });

  if (error) {
    console.error("public_quick_offer_load_error", error.message);
    return { ok: false, reason: "error" };
  }

  const offer = mapRpcPublicOffer(data);

  if (!offer) {
    return { ok: false, reason: "not_found" };
  }

  return { ok: true, offer };
}

export const loadPublicQuickOfferCached = cache(loadPublicQuickOffer);
