import { NextResponse } from "next/server";

import { mapBusinessSubscriptionRpcError } from "@/lib/business/subscription-checkout";
import { resolveIdempotencyKey } from "@/lib/orders/create-order-api";
import { isPaymentsConfigured } from "@/lib/payments/is-configured";
import type { OrderRow } from "@/lib/payments/payment-api";
import { startTochkaCheckoutForPendingOrder } from "@/lib/payments/start-tochka-checkout";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/**
 * Owner account only. Creates one pending business_subscription order and the
 * existing one-off Tochka link (card or SBP). No auto-charge. A venue credential
 * has no user session and cannot call this.
 */
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
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const customerEmail = user.email?.trim() ?? "";
  if (!customerEmail) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isPaymentsConfigured()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const idempotencyKey = resolveIdempotencyKey(request.headers.get("Idempotency-Key"));
  if (typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_business_subscription_order", {
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const mapped = mapBusinessSubscriptionRpcError(error.message);
    return NextResponse.json(
      { error: mapped.error, ...(mapped.href ? { href: mapped.href } : {}) },
      { status: mapped.status },
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as { order_id?: string } | null;
  const orderId = row?.order_id;
  if (!orderId) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  let serviceRoleClient;
  try {
    serviceRoleClient = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const { data: payable, error: payableError } = await serviceRoleClient
    .from("orders")
    .select(
      "id, user_id, practice_id, status, amount_minor, currency, practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, created_at, paid_at, order_kind",
    )
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (payableError || !payable) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const started = await startTochkaCheckoutForPendingOrder({
    orderRow: {
      ...(payable as OrderRow),
      practice_id: (payable as { practice_id?: string | null }).practice_id ?? "",
    },
    userId: user.id,
    customerEmail,
    serviceRoleClient,
  });

  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: started.status });
  }

  return NextResponse.json({
    ok: true,
    payment_url: started.body.payment.payment_url,
  });
}
