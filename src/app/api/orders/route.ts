import { NextResponse } from "next/server";

import {
  extractPracticeSlug,
  mapRpcErrorMessage,
  parseJsonObject,
  resolveIdempotencyKey,
  toCreateOrderSuccessBody,
  type CreateOrderRpcRow,
} from "@/lib/orders/create-order-api";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("create_order_auth_error", authError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
