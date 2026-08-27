import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeAccess,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { parsePromotionWriteBody } from "@/lib/pricing/author-promotions";
import { PRICE_PROMOTION_SELECT } from "@/lib/pricing/map";
import { parseJsonObject } from "@/lib/orders/create-order-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);

    const { data, error } = await supabase
      .from("practice_price_promotions")
      .select(PRICE_PROMOTION_SELECT)
      .eq("practice_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("author_price_promotions_list_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ promotions: data ?? [] });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);

    const { data: priced, error: pricedError } = await supabase
      .from("practices")
      .select("price, is_free, product_kind")
      .eq("id", id)
      .maybeSingle();

    if (pricedError || !priced) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (priced.product_kind === "audio_post" || priced.is_free === true) {
      return NextResponse.json({ error: "promotions_paid_only" }, { status: 400 });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const parsedBody = parseJsonObject(body);

    if (!parsedBody) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const parsed = parsePromotionWriteBody(parsedBody, priced.price ?? 0);

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("practice_price_promotions")
      .insert({
        practice_id: id,
        name: parsed.name,
        promotion_type: parsed.promotionType,
        sale_price: parsed.salePrice,
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt,
        duration_seconds: parsed.durationSeconds,
        above_timer_text: parsed.aboveTimerText,
        below_button_text: parsed.belowButtonText,
        is_active: parsed.isActive,
      })
      .select(PRICE_PROMOTION_SELECT)
      .single();

    if (error || !data) {
      console.error("author_price_promotions_create_error", error?.message);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }

    return NextResponse.json({ promotion: data }, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
