import {
  getPaymentUrlFromMetadata,
  mapOrderStatusToHttpError,
  toPaymentCreateBody,
  type OrderRow,
  type PaymentRow,
  type PublicPaymentCreateBody,
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
import { getOrderSaleAccrualReady } from "@/lib/author-sales/queries";
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

export type StartTochkaCheckoutResult =
  | { ok: true; status: number; body: PublicPaymentCreateBody }
  | { ok: false; status: number; error: string };

/**
 * Same Tochka payment creation as POST /api/payments.
 * Caller must already authenticate the user and load a pending order
 * whose amount_minor === price_minor_snapshot and currency is RUB.
 */
export async function startTochkaCheckoutForPendingOrder(input: {
  orderRow: OrderRow;
  userId: string;
  customerEmail: string;
  serviceRoleClient: SupabaseClient;
}): Promise<StartTochkaCheckoutResult> {
  if (!getTochkaConfig()) {
    return { ok: false, status: 503, error: "payments_not_configured" };
  }

  const statusError = mapOrderStatusToHttpError(input.orderRow.status);

  if (statusError) {
    return {
      ok: false,
      status: statusError.status,
      error: statusError.error,
    };
  }

  if (
    input.orderRow.amount_minor !== input.orderRow.price_minor_snapshot ||
    input.orderRow.currency !== "RUB"
  ) {
    console.error("create_payment_order_amount_invalid", input.orderRow.id);
    return { ok: false, status: 500, error: "internal_error" };
  }

  if (input.orderRow.amount_minor > 0) {
    const accrualReady = await getOrderSaleAccrualReady(input.orderRow.id);
    if (!accrualReady.ready) {
      console.error(
        "create_payment_accrual_not_ready",
        input.orderRow.id,
        accrualReady.code,
      );
      return { ok: false, status: 409, error: "author_finance_not_ready" };
    }
  }

  if (!input.customerEmail.trim()) {
    return { ok: false, status: 400, error: "invalid_request" };
  }

  const { data: existingPayments, error: existingPaymentsError } =
    await input.serviceRoleClient
      .from("payments")
      .select(
        "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at",
      )
      .eq("order_id", input.orderRow.id)
      .eq("provider", "tochka")
      .order("created_at", { ascending: false });

  if (existingPaymentsError) {
    console.error(
      "create_payment_existing_lookup_error",
      existingPaymentsError.message,
    );
    return { ok: false, status: 500, error: "internal_error" };
  }

  const paymentRows = (existingPayments ?? []) as PaymentRow[];
  const pendingPayment = paymentRows.find((row) => row.status === "pending");

  if (pendingPayment && pendingPayment.amount_minor !== input.orderRow.amount_minor) {
    await input.serviceRoleClient
      .from("payments")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider_metadata: {
          ...(pendingPayment.provider_metadata ?? {}),
          error: "quick_offer_amount_changed",
        },
      })
      .eq("id", pendingPayment.id);
  } else if (pendingPayment) {
    const paymentUrl = getPaymentUrlFromMetadata(pendingPayment.provider_metadata);
    const hasValidCheckoutToken = isStoredCheckoutTokenValidForOrder(
      pendingPayment.provider_metadata,
      input.orderRow.id,
    );

    if (paymentUrl && hasValidCheckoutToken) {
      return {
        ok: true,
        status: 200,
        body: toPaymentCreateBody(
          pendingPayment.id,
          pendingPayment.order_id,
          paymentUrl,
        ),
      };
    }

    const recreated = await createTochkaPaymentForOrder({
      orderRow: input.orderRow,
      paymentId: pendingPayment.id,
      userId: input.userId,
      customerEmail: input.customerEmail,
      serviceRoleClient: input.serviceRoleClient,
    });

    if (!recreated.ok) {
      return { ok: false, status: recreated.status, error: recreated.error };
    }

    return {
      ok: true,
      status: 200,
      body: toPaymentCreateBody(
        pendingPayment.id,
        pendingPayment.order_id,
        recreated.paymentUrl,
      ),
    };
  }

  const succeededPayment = paymentRows.find((row) => row.status === "succeeded");

  if (succeededPayment || input.orderRow.status === "paid") {
    return { ok: false, status: 409, error: "order_already_paid" };
  }

  const idempotencyKey = crypto.randomUUID();

  const { data: insertedPayment, error: insertPaymentError } =
    await input.serviceRoleClient
      .from("payments")
      .insert({
        order_id: input.orderRow.id,
        provider: "tochka",
        idempotency_key: idempotencyKey,
        status: "pending",
        amount_minor: input.orderRow.amount_minor,
        currency: input.orderRow.currency,
        provider_metadata: {},
      })
      .select(
        "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at",
      )
      .single();

  if (insertPaymentError || !insertedPayment) {
    console.error("create_payment_insert_error", insertPaymentError?.message);
    return { ok: false, status: 500, error: "internal_error" };
  }

  const paymentRow = insertedPayment as PaymentRow;
  const created = await createTochkaPaymentForOrder({
    orderRow: input.orderRow,
    paymentId: paymentRow.id,
    userId: input.userId,
    customerEmail: input.customerEmail,
    serviceRoleClient: input.serviceRoleClient,
  });

  if (!created.ok) {
    await input.serviceRoleClient
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

    return { ok: false, status: created.status, error: created.error };
  }

  return {
    ok: true,
    status: 201,
    body: toPaymentCreateBody(
      paymentRow.id,
      paymentRow.order_id,
      created.paymentUrl,
    ),
  };
}
