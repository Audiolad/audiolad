import { NextResponse } from "next/server";

import {
  extractPracticeSlug,
  mapRpcErrorMessage,
  parseJsonObject,
  pendingOrderToSuccessBody,
  resolveIdempotencyKey,
  toCreateOrderSuccessBody,
  type CreateOrderRpcRow,
  type PendingOrderRow,
} from "@/lib/orders/create-order-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";

export async function POST(request: Request) {
  const supabase = await createClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (authError) {
    console.error("create_order_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
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

  const practiceSlug = extractPracticeSlug(parsedBody);

  if (!practiceSlug) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const idempotencyKey = resolveIdempotencyKey(
    request.headers.get("Idempotency-Key"),
  );

  if (typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: practice, error: practiceError } = await supabase
    .from("practices")
    .select("id")
    .eq("slug", practiceSlug)
    .maybeSingle();

  if (practiceError) {
    console.error("create_order_practice_lookup_error", practiceError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!practice?.id) {
    return NextResponse.json({ error: "practice_not_found" }, { status: 404 });
  }

  const { data: existingPendingOrder, error: pendingOrderError } =
    await supabase
      .from("orders")
      .select(
        "id, practice_id, practice_slug_snapshot, status, amount_minor, currency, created_at",
      )
      .eq("user_id", user.id)
      .eq("practice_id", practice.id)
      .eq("status", "pending")
      .maybeSingle();

  if (pendingOrderError) {
    console.error("create_order_pending_lookup_error", pendingOrderError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (existingPendingOrder) {
    return NextResponse.json(
      pendingOrderToSuccessBody(existingPendingOrder as PendingOrderRow),
      { status: 200 },
    );
  }

  const { data, error } = await supabase.rpc("create_practice_order", {
    p_practice_slug: practiceSlug,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const mapped = mapRpcErrorMessage(error.message);

    if (mapped.status >= 500) {
      console.error("create_order_rpc_error", error.message);
    }

    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | CreateOrderRpcRow
    | undefined;

  if (!row?.order_id) {
    console.error("create_order_rpc_empty_result");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json(toCreateOrderSuccessBody(row), { status: 201 });
}
