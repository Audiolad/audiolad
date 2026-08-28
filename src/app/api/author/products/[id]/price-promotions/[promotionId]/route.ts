import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { buildPromotionPatchUpdates } from "@/lib/pricing/author-promotions";
import { PRICE_PROMOTION_SELECT } from "@/lib/pricing/map";
import { parseJsonObject } from "@/lib/orders/create-order-api";

type RouteContext = {
  params: Promise<{ id: string; promotionId: string }>;
};

async function loadPracticePrice(
  supabase: Awaited<ReturnType<typeof requirePracticeMutationAccess>>["supabase"],
  practiceId: string,
) {
  const { data, error } = await supabase
    .from("practices")
    .select("price, is_free, product_kind")
    .eq("id", practiceId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id, promotionId } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);
    const priced = await loadPracticePrice(supabase, id);

    if (!priced) {
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

    const parsedUpdates = buildPromotionPatchUpdates(
      parsedBody,
      priced.price ?? 0,
    );

    if (!parsedUpdates.ok) {
      return NextResponse.json({ error: parsedUpdates.error }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      ...parsedUpdates.updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("practice_price_promotions")
      .update(updates)
      .eq("id", promotionId)
      .eq("practice_id", id)
      .select(PRICE_PROMOTION_SELECT)
      .maybeSingle();

    if (error) {
      console.error("author_price_promotions_update_error", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ promotion: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, promotionId } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);

    const { data, error } = await supabase
      .from("practice_price_promotions")
      .delete()
      .eq("id", promotionId)
      .eq("practice_id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("author_price_promotions_delete_error", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
