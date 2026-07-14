import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OrderRow, PaymentRow } from "@/lib/payments/payment-api";

type FulfillPaymentInput = {
  paymentId: string;
  providerPaymentId: string;
  providerStatus: string;
  webhookPayload: Record<string, unknown>;
};

type FulfillPaymentResult =
  | { ok: true; alreadyProcessed: boolean; orderId: string }
  | { ok: false; reason: string };

export async function fulfillSucceededTochkaPayment(
  input: FulfillPaymentInput,
): Promise<FulfillPaymentResult> {
  const supabase = createServiceRoleClient();

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(
      "id, order_id, provider, provider_payment_id, status, amount_minor, currency, provider_metadata",
    )
    .eq("id", input.paymentId)
    .maybeSingle();

  if (paymentError) {
    console.error("fulfill_payment_lookup_error", paymentError.message);
    return { ok: false, reason: "payment_lookup_failed" };
  }

  if (!payment) {
    return { ok: false, reason: "payment_not_found" };
  }

  const paymentRow = payment as PaymentRow;

  if (paymentRow.status === "succeeded") {
    return {
      ok: true,
      alreadyProcessed: true,
      orderId: paymentRow.order_id,
    };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, user_id, practice_id, status, amount_minor, currency, practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, created_at, paid_at",
    )
    .eq("id", paymentRow.order_id)
    .maybeSingle();

  if (orderError) {
    console.error("fulfill_order_lookup_error", orderError.message);
    return { ok: false, reason: "order_lookup_failed" };
  }

  if (!order) {
    return { ok: false, reason: "order_not_found" };
  }

  const orderRow = order as OrderRow;

  if (orderRow.status === "paid") {
    return {
      ok: true,
      alreadyProcessed: true,
      orderId: orderRow.id,
    };
  }

  const now = new Date().toISOString();
  const mergedMetadata = {
    ...(paymentRow.provider_metadata ?? {}),
    provider_status: input.providerStatus,
    webhook_payload: input.webhookPayload,
    fulfilled_at: now,
  };

  const { error: paymentUpdateError } = await supabase
    .from("payments")
    .update({
      status: "succeeded",
      provider_payment_id: input.providerPaymentId,
      confirmed_at: now,
      updated_at: now,
      provider_metadata: mergedMetadata,
    })
    .eq("id", paymentRow.id)
    .eq("status", paymentRow.status);

  if (paymentUpdateError) {
    console.error("fulfill_payment_update_error", paymentUpdateError.message);
    return { ok: false, reason: "payment_update_failed" };
  }

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      status: "paid",
      paid_at: now,
      updated_at: now,
    })
    .eq("id", orderRow.id)
    .eq("status", orderRow.status);

  if (orderUpdateError) {
    console.error("fulfill_order_update_error", orderUpdateError.message);
    return { ok: false, reason: "order_update_failed" };
  }

  const { error: grantError } = await supabase.rpc(
    "grant_practice_purchase_access",
    {
      p_order_id: orderRow.id,
    },
  );

  if (grantError) {
    console.error("fulfill_grant_access_error", grantError.message);
    return { ok: false, reason: "grant_access_failed" };
  }

  return {
    ok: true,
    alreadyProcessed: false,
    orderId: orderRow.id,
  };
}

export async function findPaymentByProviderOperationId(
  operationId: string,
): Promise<PaymentRow | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at",
    )
    .eq("provider", "tochka")
    .eq("provider_payment_id", operationId)
    .maybeSingle();

  if (error) {
    console.error("find_payment_by_operation_error", error.message);
    return null;
  }

  return (data as PaymentRow | null) ?? null;
}

export async function findPaymentByOrderId(
  orderId: string,
): Promise<PaymentRow | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at",
    )
    .eq("order_id", orderId)
    .eq("provider", "tochka")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("find_payment_by_order_error", error.message);
    return null;
  }

  return (data as PaymentRow | null) ?? null;
}
