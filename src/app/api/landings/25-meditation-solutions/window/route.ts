import { NextResponse } from "next/server";

import {
  MEDITATION_SOLUTIONS_BASE_PRICE_RUB,
  MEDITATION_SOLUTIONS_PRACTICE_SLUG,
  MEDITATION_SOLUTIONS_SALE_PRICE_RUB,
} from "@/lib/landings/25-meditation-solutions";
import { loadPricePromotionsForPractice } from "@/lib/pricing/queries";
import { PRICE_PROMOTION_TYPES } from "@/lib/pricing/types";
import { ensurePriceVisitorId, isPriceVisitorId } from "@/lib/pricing/visitor";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export const dynamic = "force-dynamic";

type StartRpcRow = {
  practice_id: string;
  promotion_id: string;
  started_at: string;
  expires_at: string;
  sale_price: number;
  reused: boolean;
};

type PracticeRow = {
  id: string;
  price: number | null;
};

export async function POST(request: Request) {
  const visitorId = await ensurePriceVisitorId();
  const supabase = await createClientFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: practice } = await supabase
    .from("practices")
    .select("id, price")
    .eq("slug", MEDITATION_SOLUTIONS_PRACTICE_SLUG)
    .maybeSingle();

  const row = practice as PracticeRow | null;

  if (!row?.id) {
    return NextResponse.json(
      {
        error: "practice_not_found",
        expires_at: null,
        sale_price: null,
        base_price: MEDITATION_SOLUTIONS_BASE_PRICE_RUB,
        reused: false,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const promotions = await loadPricePromotionsForPractice(supabase, row.id);
  const promotion = promotions.find(
    (item) =>
      item.promotionType === PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN &&
      item.isActive,
  );

  const basePrice =
    typeof row.price === "number" && Number.isInteger(row.price)
      ? row.price
      : MEDITATION_SOLUTIONS_BASE_PRICE_RUB;

  if (!promotion) {
    return NextResponse.json(
      {
        expires_at: null,
        sale_price: null,
        base_price: basePrice,
        reused: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await supabase.rpc("start_practice_price_promotion", {
    p_start_token: promotion.startToken,
    p_visitor_id: visitorId,
    p_user_id: user?.id ?? null,
  });

  if (error) {
    console.error(
      "meditation_solutions_start_promotion_error",
      error.message,
    );
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const start = (Array.isArray(data) ? data[0] : data) as StartRpcRow | undefined;

  if (!start?.expires_at) {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      expires_at: start.expires_at,
      sale_price:
        typeof start.sale_price === "number"
          ? start.sale_price
          : MEDITATION_SOLUTIONS_SALE_PRICE_RUB,
      base_price: basePrice,
      reused: start.reused === true,
      visitor_id: isPriceVisitorId(visitorId) ? visitorId : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
