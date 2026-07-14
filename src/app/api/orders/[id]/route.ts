import { NextResponse } from "next/server";

import {
  extractRouteOrderId,
  toOrderStatusBody,
  type OrderRow,
} from "@/lib/payments/payment-api";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const orderId = extractRouteOrderId(id);

  if (!orderId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("get_order_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, user_id, practice_id, status, amount_minor, currency, practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, created_at, paid_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    console.error("get_order_lookup_error", orderError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  return NextResponse.json(toOrderStatusBody(order as OrderRow));
}
