import { COURSE_UPGRADE_CHECKOUT_STAGES } from "@/lib/course-content/course-upgrade-stages";
import {
  mapOrderStatusToHttpError,
  toPaymentCreateBody,
  type OrderRow,
  type PaymentRow,
  type PublicPaymentCreateBody,
} from "@/lib/payments/payment-api";
import { createSignedCheckoutToken } from "@/lib/payments/checkout-token";
import { decidePendingTochkaPayment } from "@/lib/payments/pending-tochka-payment";
import { formatTochkaPaymentPurpose } from "@/lib/payments/payment-purpose";
import {
  createTochkaPaymentOperation,
  type CreateTochkaPaymentResult,
} from "@/lib/payments/tochka-client";
import { getTochkaConfig } from "@/lib/payments/tochka-config";
import { getOrderSaleAccrualReady } from "@/lib/author-sales/queries";
import type { SupabaseClient } from "@supabase/supabase-js";

const METADATA_PERSIST_ATTEMPTS = 3;

function asMinorInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

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
  for (let attempt = 1; attempt <= METADATA_PERSIST_ATTEMPTS; attempt += 1) {
    const { error: updatePaymentError } = await serviceRoleClient
      .from("payments")
      .update({
        provider_payment_id: tochkaPayment.operationId,
        provider_metadata: buildProviderMetadata(checkoutToken, tochkaPayment),
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    if (!updatePaymentError) {
      return true;
    }

    console.error(
      "create_payment_metadata_update_error",
      updatePaymentError.message,
      attempt,
    );
  }

  return false;
}

async function markPaymentFailed(
  serviceRoleClient: SupabaseClient,
  paymentId: string,
  error: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await serviceRoleClient
    .from("payments")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      provider_metadata: {
        ...metadata,
        error,
      },
    })
    .eq("id", paymentId);
}

async function createTochkaPaymentForOrder(input: {
  orderRow: OrderRow;
  paymentId: string;
  userId: string;
  customerEmail: string;
  serviceRoleClient: SupabaseClient;
}): Promise<
  | { ok: true; paymentUrl: string }
  | {
      ok: false;
      status: number;
      error: "internal_error" | "provider_checkout_failed";
      stage: string;
    }
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
      return {
        ok: false,
        status: 500,
        error: "internal_error",
        stage: COURSE_UPGRADE_CHECKOUT_STAGES.METADATA_SAVE,
      };
    }

    return { ok: true, paymentUrl: tochkaPayment.paymentLink };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "tochka_create_payment_failed";

    console.error("create_payment_tochka_error", message);
    return {
      ok: false,
      status: 502,
      error: "provider_checkout_failed",
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.CREATE_TOCHKA,
    };
  }
}

export type StartTochkaCheckoutResult =
  | { ok: true; status: number; body: PublicPaymentCreateBody }
  | { ok: false; status: number; error: string; stage: string };

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
    return {
      ok: false,
      status: 503,
      error: "payments_not_configured",
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.START_TOCHKA,
    };
  }

  const statusError = mapOrderStatusToHttpError(input.orderRow.status);

  if (statusError) {
    return {
      ok: false,
      status: statusError.status,
      error: statusError.error,
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.START_TOCHKA,
    };
  }

  const amountMinor = asMinorInteger(input.orderRow.amount_minor);
  const priceMinor = asMinorInteger(input.orderRow.price_minor_snapshot);

  if (
    amountMinor == null ||
    priceMinor == null ||
    amountMinor !== priceMinor ||
    input.orderRow.currency !== "RUB"
  ) {
    console.error("create_payment_order_amount_invalid", input.orderRow.id);
    return {
      ok: false,
      status: 500,
      error: "internal_error",
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.START_TOCHKA,
    };
  }

  const orderRow: OrderRow = {
    ...input.orderRow,
    amount_minor: amountMinor,
    price_minor_snapshot: priceMinor,
  };

  if (orderRow.amount_minor > 0) {
    const accrualReady = await getOrderSaleAccrualReady(orderRow.id);
    if (!accrualReady.ready) {
      console.error(
        "create_payment_accrual_not_ready",
        orderRow.id,
        accrualReady.code,
      );
      return {
        ok: false,
        status: 409,
        error: "author_finance_not_ready",
        stage: COURSE_UPGRADE_CHECKOUT_STAGES.ACCRUAL,
      };
    }
  }

  if (!input.customerEmail.trim()) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.START_TOCHKA,
    };
  }

  const { data: existingPayments, error: existingPaymentsError } =
    await input.serviceRoleClient
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
    return {
      ok: false,
      status: 500,
      error: "internal_error",
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.EXISTING_PAYMENTS,
    };
  }

  const paymentRows = (existingPayments ?? []) as PaymentRow[];
  const pendingPayment = paymentRows.find((row) => row.status === "pending");

  if (pendingPayment) {
    const pendingAmount = asMinorInteger(pendingPayment.amount_minor);
    const decision = decidePendingTochkaPayment({
      pendingPayment: {
        ...pendingPayment,
        amount_minor: pendingAmount ?? pendingPayment.amount_minor,
      },
      orderId: orderRow.id,
      orderAmountMinor: orderRow.amount_minor,
    });

    if (decision.kind === "mark_failed_amount_changed") {
      await markPaymentFailed(
        input.serviceRoleClient,
        pendingPayment.id,
        "quick_offer_amount_changed",
        pendingPayment.provider_metadata ?? {},
      );
    } else if (decision.kind === "reuse_url") {
      return {
        ok: true,
        status: 200,
        body: toPaymentCreateBody(
          pendingPayment.id,
          pendingPayment.order_id,
          decision.paymentUrl,
        ),
      };
    } else {
      const recreated = await createTochkaPaymentForOrder({
        orderRow,
        paymentId: pendingPayment.id,
        userId: input.userId,
        customerEmail: input.customerEmail,
        serviceRoleClient: input.serviceRoleClient,
      });

      if (!recreated.ok) {
        console.error(
          "create_payment_pending_recreate_failed",
          orderRow.id,
          pendingPayment.id,
          recreated.stage,
          recreated.error,
        );
        return {
          ok: false,
          status: recreated.status,
          error: recreated.error,
          stage: recreated.stage,
        };
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
  }

  const succeededPayment = paymentRows.find((row) => row.status === "succeeded");

  if (succeededPayment || orderRow.status === "paid") {
    return {
      ok: false,
      status: 409,
      error: "order_already_paid",
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.PAYMENT_INSERT_REUSE,
    };
  }

  const idempotencyKey = crypto.randomUUID();

  const { data: insertedPayment, error: insertPaymentError } =
    await input.serviceRoleClient
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
    return {
      ok: false,
      status: 500,
      error: "internal_error",
      stage: COURSE_UPGRADE_CHECKOUT_STAGES.PAYMENT_INSERT_REUSE,
    };
  }

  const paymentRow = insertedPayment as PaymentRow;
  const created = await createTochkaPaymentForOrder({
    orderRow,
    paymentId: paymentRow.id,
    userId: input.userId,
    customerEmail: input.customerEmail,
    serviceRoleClient: input.serviceRoleClient,
  });

  if (!created.ok) {
    await markPaymentFailed(
      input.serviceRoleClient,
      paymentRow.id,
      "tochka_create_payment_failed",
    );

    return {
      ok: false,
      status: created.status,
      error: created.error,
      stage: created.stage,
    };
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
