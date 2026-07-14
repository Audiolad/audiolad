import { NextResponse } from "next/server";

import {
  extractPracticeSlug,
  pendingOrderToSuccessBody,
  type PendingOrderRow,
} from "@/lib/orders/create-order-api";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("pending_order_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const practiceSlug = extractPracticeSlug({
    practice_slug: searchParams.get("practice_slug") ?? "",
  });

  if (!practiceSlug) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id")
    .eq("slug", practiceSlug)
    .maybeSingle();

  if (practiceError) {
    console.error("pending_order_practice_lookup_error", practiceError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!practice?.id) {
    return NextResponse.json({ order: null });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, practice_id, practice_slug_snapshot, status, amount_minor, currency, created_at",
    )
    .eq("user_id", user.id)
    .eq("practice_id", practice.id)
    .eq("status", "pending")
    .maybeSingle();

  if (orderError) {
    console.error("pending_order_lookup_error", orderError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ order: null });
  }

  return NextResponse.json({
    order: pendingOrderToSuccessBody(order as PendingOrderRow).order,
  });
}
