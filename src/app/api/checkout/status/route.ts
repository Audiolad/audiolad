import { NextResponse } from "next/server";

import { logCheckoutEvent } from "@/lib/payments/checkout-log";
import {
  toCheckoutStatusBody,
  type CheckoutStatusErrorCode,
} from "@/lib/payments/checkout-status-api";
import { verifySignedCheckoutToken } from "@/lib/payments/checkout-token";
import { extractRouteOrderId } from "@/lib/payments/payment-api";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function errorResponse(
  error: CheckoutStatusErrorCode,
  status: number,
  orderId?: string | null,
): NextResponse {
  logCheckoutEvent("checkout_status_denied", {
    orderId: orderId ?? null,
    error,
  });

  return NextResponse.json({ error }, { status });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = extractRouteOrderId(searchParams.get("order_id") ?? undefined);
  const token = searchParams.get("token")?.trim() ?? "";

  if (!orderId || !token) {
    return errorResponse("invalid_request", 400, orderId);
  }

  const verification = verifySignedCheckoutToken(token, orderId);

  if (!verification.ok) {
    return errorResponse("invalid_token", 400, orderId);
  }

  logCheckoutEvent("checkout_status_token_valid", {
    orderId,
  });

  let serviceRoleClient;

  try {
    serviceRoleClient = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const { data: order, error: orderError } = await serviceRoleClient
    .from("orders")
    .select("id, status, practice_slug_snapshot, practice_title_snapshot")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    logCheckoutEvent("checkout_status_lookup_error", {
      orderId,
    });
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  if (!order) {
    return errorResponse("invalid_token", 400, orderId);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const body = toCheckoutStatusBody({
    status: order.status,
    practiceSlug:
      typeof order.practice_slug_snapshot === "string"
        ? order.practice_slug_snapshot
        : null,
    practiceTitle:
      typeof order.practice_title_snapshot === "string"
        ? order.practice_title_snapshot
        : null,
    authenticated: Boolean(user),
  });

  logCheckoutEvent("checkout_status_resolved", {
    orderId,
    orderStatus: body.status,
    authenticated: body.authenticated,
  });

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
