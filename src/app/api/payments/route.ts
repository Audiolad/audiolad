import { NextResponse } from "next/server";

import {
  extractOrderId,
  getPaymentUrlFromMetadata,
  mapOrderStatusToHttpError,
  parseJsonObject,
  toPaymentCreateBody,
  type OrderRow,
  type PaymentRow,
} from "@/lib/payments/payment-api";
import {
  createSignedCheckoutToken,
  isStoredCheckoutTokenValidForOrder,
} from "@/lib/payments/checkout-token";
import { formatTochkaPaymentPurpose } from "@/lib/payments/payment-purpose";
import {
  createTochkaPaymentOperation,
  type CreateTochkaPaymentResult,
} from "@/lib/payments/tochka-client";
import { getTochkaConfig } from "@/lib/payments/tochka-config";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SupabaseClient } from "@supabase/supabase-js";

function buildProviderMetadata(
  checkoutToken: string,
  tochkaPayment: CreateTochkaPaymentResult,
): Record<string, unknown> {
  return {
    payment_url: tochkaPayment.paymentLink,
    payment_link_id: tochkaPayment.paymentLinkId,
    provider_status: tochkaPayment.status,
    create_response: tochkaPayment.rawResponse,
    checkout_token: checkoutToken,
  };
}

async function persistTochkaPaymentMetadata(
  serviceRoleClient: SupabaseClient,
  paymentId: string,
  checkoutToken: string,
  tochkaPayment: CreateTochkaPaymentResult,
): Promise<boolean> {
  const { error: updatePaymentError } = await serviceRoleClient
    .from("payments")
    .update({
      provider_payment_id: tochkaPayment.operationId,
      provider_metadata: buildProviderMetadata(checkoutToken, tochkaPayment),
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (updatePaymentError) {
    console.error("create_payment_metadata_update_error", updatePaymentError.message);
    return false;
  }

  return true;
}

async function createTochkaPaymentForOrder(input: {
  orderRow: OrderRow;
  paymentId: string;
  userId: string;
  customerEmail: string;
  serviceRoleClient: SupabaseClient;
}): Promise<
  | { ok: true; paymentUrl: string }
  | { ok: false; status: number; error: "internal_error" }
> {
  const checkoutToken = createSignedCheckoutToken(input.orderRow.id).token;

  try {
    const tochkaPayment = await createTochkaPaymentOperation({
      orderId: input.orderRow.id,
      checkoutToken,
      amountMinor: input.orderRow.amount_minor,
      purpose: formatTochkaPaymentPurpose(
        input.orderRow.id,
        input.orderRow.practice_title_snapshot,
      ),
      consumerId: input.userId,
      customerEmail: input.customerEmail,
      itemName: input.orderRow.practice_title_snapshot,
    });

    const persisted = await persistTochkaPaymentMetadata(
      input.serviceRoleClient,
      input.paymentId,
      checkoutToken,
      tochkaPayment,
    );

    if (!persisted) {
      return { ok: false, status: 500, error: "internal_error" };
    }

    return { ok: true, paymentUrl: tochkaPayment.paymentLink };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "tochka_create_payment_failed";

    console.error("create_payment_tochka_error", message);
    return { ok: false, status: 500, error: "internal_error" };
  }
}

export async function POST(request: Request) {
  if (!getTochkaConfig()) {
    return NextResponse.json(
      { error: "payments_not_configured" },
      { status: 503 },
    );
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
    console.error("create_payment_auth_error", authError.message);
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

  const orderId = extractOrderId(parsedBody);

  if (!orderId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, user_id, practice_id, status, amount_minor, currency, practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, created_at, paid_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    console.error("create_payment_order_lookup_error", orderError.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const orderRow = order as OrderRow;
  const statusError = mapOrderStatusToHttpError(orderRow.status);

  if (statusError) {
    return NextResponse.json(
      { error: statusError.error },
      { status: statusError.status },
    );
  }

  if (
    orderRow.amount_minor !== orderRow.price_minor_snapshot ||
    orderRow.currency !== "RUB"
  ) {
    console.error("create_payment_order_amount_invalid", orderRow.id);
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

  const { data: existingPayments, error: existingPaymentsError } =
    await serviceRoleClient
      .from("payments")
      .select(
        "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at",
      )
      .eq("order_id", orderRow.id)
      .eq("provider", "tochka")
      .order("created_at", { ascending: false });

  if (existingPaymentsError) {
    console.error(
      "create_payment_existing_lookup_error",
      existingPaymentsError.message,
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const paymentRows = (existingPayments ?? []) as PaymentRow[];
  const pendingPayment = paymentRows.find((row) => row.status === "pending");

  if (pendingPayment) {
    const paymentUrl = getPaymentUrlFromMetadata(pendingPayment.provider_metadata);
    const hasValidCheckoutToken = isStoredCheckoutTokenValidForOrder(
      pendingPayment.provider_metadata,
      orderRow.id,
    );

    if (paymentUrl && hasValidCheckoutToken) {
      return NextResponse.json(
        toPaymentCreateBody(
          pendingPayment.id,
          pendingPayment.order_id,
          paymentUrl,
        ),
        { status: 200 },
      );
    }

    const customerEmail = user.email?.trim();

    if (!customerEmail) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const recreated = await createTochkaPaymentForOrder({
      orderRow,
      paymentId: pendingPayment.id,
      userId: user.id,
      customerEmail,
      serviceRoleClient,
    });

    if (!recreated.ok) {
      return NextResponse.json(
        { error: recreated.error },
        { status: recreated.status },
      );
    }

    return NextResponse.json(
      toPaymentCreateBody(
        pendingPayment.id,
        pendingPayment.order_id,
        recreated.paymentUrl,
      ),
      { status: 200 },
    );
  }

  const succeededPayment = paymentRows.find((row) => row.status === "succeeded");

  if (succeededPayment || orderRow.status === "paid") {
    return NextResponse.json(
      { error: "order_already_paid" },
      { status: 409 },
    );
  }

  const idempotencyKey = crypto.randomUUID();
  const customerEmail = user.email?.trim();

  if (!customerEmail) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data: insertedPayment, error: insertPaymentError } =
    await serviceRoleClient
      .from("payments")
      .insert({
        order_id: orderRow.id,
        provider: "tochka",
        idempotency_key: idempotencyKey,
        status: "pending",
        amount_minor: orderRow.amount_minor,
        currency: orderRow.currency,
        provider_metadata: {},
      })
      .select(
        "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at",
      )
      .single();

  if (insertPaymentError || !insertedPayment) {
    console.error("create_payment_insert_error", insertPaymentError?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const paymentRow = insertedPayment as PaymentRow;
  const created = await createTochkaPaymentForOrder({
    orderRow,
    paymentId: paymentRow.id,
    userId: user.id,
    customerEmail,
    serviceRoleClient,
  });

  if (!created.ok) {
    await serviceRoleClient
      .from("payments")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider_metadata: {
          error: "tochka_create_payment_failed",
        },
      })
      .eq("id", paymentRow.id);

    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  return NextResponse.json(
    toPaymentCreateBody(
      paymentRow.id,
      paymentRow.order_id,
      created.paymentUrl,
    ),
    { status: 201 },
  );
}
