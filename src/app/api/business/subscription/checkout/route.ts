import { cookies } from "next/headers";
import { AUTHOR_SUPPORT_COOKIE_NAME } from "@/lib/author-support/policy";
import { linkBusinessLoginEmail } from "@/lib/business-app/login-access";
import { sendBusinessLoginEmail } from "@/lib/email/send-business-login-email";
import { isCoffeeHostRequest } from "@/lib/business-app/host";
import { after, NextResponse } from "next/server";

import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import { BUSINESS_OFFER_HREF, businessOfferPaymentGate } from "@/lib/business/offer";
import { parsePartnerQuote } from "@/lib/business/partner-codes";
import {
  BUSINESS_STANDARD_UNIT_PRICE_MINOR,
  mapBusinessSubscriptionRpcError,
  parseConfirmedUnitPriceMinor,
  businessReceiptEmailToRemember,
  resolveBusinessReceiptEmail,
  savedBusinessReceiptEmail,
  BUSINESS_RECEIPT_EMAIL_META_KEY,
} from "@/lib/business/subscription-checkout";
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

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

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

  // Optional body { receipt_email }: only for an account without email (guest start).
  // Without it the remembered one (user_metadata.receipt_email, t1343u) is used.
  // { confirmed_unit_price_minor }: the per-venue price shown next to «Оплатить» (8142d69a).
  const body = (await request.json().catch(() => null)) as {
    receipt_email?: unknown;
    confirmed_unit_price_minor?: unknown;
  } | null;
  const confirmedUnitPriceMinor = parseConfirmedUnitPriceMinor(body?.confirmed_unit_price_minor);
  if (confirmedUnitPriceMinor === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const savedReceiptEmail = savedBusinessReceiptEmail(user.user_metadata);
  const customerEmail = resolveBusinessReceiptEmail(user.email, body?.receipt_email, savedReceiptEmail) ?? "";
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

  if (user.is_anonymous) {
    // Linking the receipt email changes the login, so never in support mode (t1442u).
    if ((await cookies()).has(AUTHOR_SUPPORT_COOKIE_NAME)) {
      return NextResponse.json({ error: "support_mode_consent_forbidden" }, { status: 403 });
    }
    const { data: owner, error: ownerError } = await supabase.from("business_organization_members")
      .select("organization_id").eq("user_id", user.id).eq("role", "owner").limit(1);
    if (ownerError) return NextResponse.json({ error: "internal_error" }, { status: 503 });
    if (!owner?.length) return NextResponse.json({ error: "not_organization_owner" }, { status: 403 });
  }
  const linked = await linkBusinessLoginEmail(supabase, user, customerEmail);
  if (!linked.ok) {
    return NextResponse.json({ error: linked.code }, { status: linked.code === "receipt_email_taken" ? 409 : 503 });
  }
  if (linked.linked) {
    const hostname = hostnameFromHeaders(request.headers);
    after(() => sendBusinessLoginEmail(customerEmail, hostname, user.id));
  }

  // The server computes the amount; the order is refused unless it matches the confirmed price.
  let { data, error } = await supabase.rpc("create_business_subscription_order", {
    p_idempotency_key: idempotencyKey,
    p_expected_unit_price_minor: confirmedUnitPriceMinor,
  });
  if (error && isMissingRpc(error) && confirmedUnitPriceMinor === BUSINESS_STANDARD_UNIT_PRICE_MINOR) {
    // Schema before the partner-code migration: the standard price path stays as it was.
    ({ data, error } = await supabase.rpc("create_business_subscription_order", { p_idempotency_key: idempotencyKey }));
  }
  if (error) {
    const mapped = mapBusinessSubscriptionRpcError(error.message);
    if (mapped.error === "partner_terms_changed") {
      const { data: quoteRow } = await supabase.rpc("business_partner_quote_for_caller");
      return NextResponse.json({ error: mapped.error, quote: parsePartnerQuote(quoteRow) }, { status: mapped.status });
    }
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

  // t1343u: remember the receipt email of an account without its own email, so the next
  // payment and the profile show it. Best effort: the payment link is already created.
  const rememberEmail = businessReceiptEmailToRemember(user.email, customerEmail, savedReceiptEmail);
  if (rememberEmail) {
    try {
      const { error: rememberError } = await serviceRoleClient.auth.admin.updateUserById(user.id, {
        user_metadata: { [BUSINESS_RECEIPT_EMAIL_META_KEY]: rememberEmail },
      });
      if (rememberError) console.error("business_receipt_email_remember_failed");
    } catch {
      console.error("business_receipt_email_remember_failed");
    }
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
