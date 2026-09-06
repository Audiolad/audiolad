import { NextResponse } from "next/server";

import {
  coerceCourseUpgradeOrderRow,
  mapCourseUpgradeRpcError,
  parseCourseUpgradeRequest,
  parseJsonObject,
  toCourseUpgradeSuccessBody,
} from "@/lib/course-content/course-upgrade-order-api";
import { resolveIdempotencyKey } from "@/lib/orders/create-order-api";
import { startTochkaCheckoutForPendingOrder } from "@/lib/payments/start-tochka-checkout";
import type { OrderRow } from "@/lib/payments/payment-api";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
    console.error("course_upgrade_auth_error", authError.message);
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

  const parsed = parseCourseUpgradeRequest(parsedBody);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const customerEmail = user.email?.trim() ?? "";

  if (!customerEmail) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const idempotencyKey = resolveIdempotencyKey(
    request.headers.get("Idempotency-Key"),
  );

  if (typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_course_upgrade_order", {
    p_practice_id: parsed.value.practiceId,
    p_idempotency_key: idempotencyKey,
    p_expected_target_access_level: parsed.value.targetAccessLevel ?? null,
  });

  if (error) {
    const mapped = mapCourseUpgradeRpcError(error.message);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const orderRow = coerceCourseUpgradeOrderRow(
    Array.isArray(data) ? data[0] : data,
  );

  if (!orderRow) {
    console.error("course_upgrade_order_invalid_row");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let serviceRoleClient;

  try {
    serviceRoleClient = createServiceRoleClient();
  } catch {
    return NextResponse.json(
      { error: "payments_not_configured" },
      { status: 503 },
    );
  }

  const { data: payable, error: payableError } = await serviceRoleClient
    .from("orders")
    .select(
      "id, user_id, practice_id, status, amount_minor, currency, practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, created_at, paid_at",
    )
    .eq("id", orderRow.order_id)
    .maybeSingle();

  if (payableError || !payable) {
    console.error("course_upgrade_order_reload_error", payableError?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const started = await startTochkaCheckoutForPendingOrder({
    orderRow: payable as OrderRow,
    userId: user.id,
    customerEmail,
    serviceRoleClient,
  });

  if (!started.ok) {
    return NextResponse.json(
      { error: started.error },
      { status: started.status },
    );
  }

  return NextResponse.json(
    toCourseUpgradeSuccessBody({
      order: orderRow,
      paymentId: started.body.payment.id,
      paymentUrl: started.body.payment.payment_url,
    }),
    { status: started.status === 201 ? 201 : 200 },
  );
}
