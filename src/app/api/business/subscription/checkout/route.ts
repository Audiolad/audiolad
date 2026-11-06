import { loadBusinessOwnerHomeContext } from "@/lib/business-app/domain";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { NextResponse } from "next/server";

import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import { BUSINESS_OFFER_HREF, businessOfferPaymentGate } from "@/lib/business/offer";
import { mapBusinessSubscriptionRpcError, resolveBusinessReceiptEmail } from "@/lib/business/subscription-checkout";
import { resolveIdempotencyKey } from "@/lib/orders/create-order-api";
import { isPaymentsConfigured } from "@/lib/payments/is-configured";
import type { OrderRow } from "@/lib/payments/payment-api";
import {
  CHECKOUT_RETURN_SITE_COOKIE,
  CHECKOUT_RETURN_SITE_MAX_AGE_SECONDS,
} from "@/lib/payments/checkout-result-cta";
import { startTochkaCheckoutForPendingOrder } from "@/lib/payments/start-tochka-checkout";
import { getSupabaseCookieOptions, hostnameFromHeaders } from "@/lib/supabase/cookie-domain";
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
  if (await businessHallDeviceLocked()) {
    return NextResponse.json({ error: "venue_device" }, { status: 403 });
  }
  if (authError) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const domain = await loadBusinessOwnerHomeContext();
  if (domain.status === "authenticated" && domain.pilotSlots) {
    return NextResponse.json({ error: "pilot_payment_requires_location_binding", message: "Оплата пилота за каждую точку согласуется отдельно." }, { status: 409 });
  }

  // Optional body { receipt_email }: only for an account without email (guest start).
  const body = (await request.json().catch(() => null)) as { receipt_email?: unknown } | null;
  const customerEmail = resolveBusinessReceiptEmail(user.email, body?.receipt_email) ?? "";
  if (!customerEmail) {
    return NextResponse.json({ error: "receipt_email_required" }, { status: 400 });
  }
  if (!isPaymentsConfigured()) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const idempotencyKey = resolveIdempotencyKey(request.headers.get("Idempotency-Key"));
  if (typeof idempotencyKey !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Payment needs the current edition of the договор-оферта (the SQL order gate only
  // knows the annex 1 row). Accepted once per account, never asked twice.
  const offerGate = await businessOfferPaymentGate("business_subscription", () =>
    supabase.rpc("business_offer_edition_acceptances_for_caller"));
  if (offerGate === "unavailable") {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  if (offerGate === "offer_acceptance_required") {
    return NextResponse.json({ error: "offer_acceptance_required", href: BUSINESS_OFFER_HREF }, { status: 409 });
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

  const returnSite = isCoffeeHostRequest(request.headers) ? "coffee" : undefined;
  const started = await startTochkaCheckoutForPendingOrder({
    orderRow: {
      ...(payable as OrderRow),
      practice_id: (payable as { practice_id?: string | null }).practice_id ?? "",
    },
    userId: user.id,
    customerEmail,
    serviceRoleClient,
    returnSite,
  });

  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: started.status });
  }

  const response = NextResponse.json({
    ok: true,
    payment_url: started.body.payment.payment_url,
  });
  // Return target of THIS start, also when a pending payment link is reused.
  response.cookies.set(CHECKOUT_RETURN_SITE_COOKIE, returnSite ?? "business", {
    ...getSupabaseCookieOptions(hostnameFromHeaders(request.headers)),
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: CHECKOUT_RETURN_SITE_MAX_AGE_SECONDS,
  });
  return response;
}
