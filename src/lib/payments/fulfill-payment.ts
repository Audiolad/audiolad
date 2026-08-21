import { ensureFinanceObligationProcessed } from "@/lib/payments/author-finance/finance-rpc";
import { logCheckoutEvent } from "@/lib/payments/checkout-log";
import { shouldNotifyPlatformOwnerOfSale } from "@/lib/admin/sales";
import { notifyAuthorOfCanonicalSale } from "@/lib/payments/notify-author-sale";
import { notifyPlatformOwnerOfConfirmedSale } from "@/lib/payments/notify-platform-owner-sale";
import type { PaymentRow } from "@/lib/payments/payment-api";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type FulfillTochkaOutcome =
  | "completed"
  | "already_complete"
  | "repaired"
  | "requires_review"
  | "ignored"
  | "failed";

export type FulfillTochkaPaymentResult = {
  ok: boolean;
  outcome: FulfillTochkaOutcome;
  reviewReason: string | null;
  paymentId: string | null;
  orderId: string | null;
  paymentStatus: string | null;
  orderStatus: string | null;
  accessGranted: boolean;
  accessInserted: boolean;
  wasRepaired: boolean;
  wasAlreadyComplete: boolean;
  isTest: boolean;
  processingStatus: string | null;
  webhookEventId: string | null;
  httpRetryable: boolean;
};

type RpcFulfillRow = {
  ok?: boolean;
  outcome?: string;
  review_reason?: string | null;
  payment_id?: string | null;
  order_id?: string | null;
  payment_status?: string | null;
  order_status?: string | null;
  access_granted?: boolean;
  access_inserted?: boolean;
  was_repaired?: boolean;
  was_already_complete?: boolean;
  is_test?: boolean;
  processing_status?: string | null;
  webhook_event_id?: string | null;
  error_code?: string | null;
};

function asOutcome(value: string | undefined): FulfillTochkaOutcome {
  switch (value) {
    case "completed":
    case "already_complete":
    case "repaired":
    case "requires_review":
    case "ignored":
    case "failed":
      return value;
    default:
      return "failed";
  }
}

function mapRpcResult(raw: unknown): FulfillTochkaPaymentResult {
  const row = (raw ?? {}) as RpcFulfillRow;
  const ok = row.ok === true;
  const outcome = asOutcome(row.outcome);
  const httpRetryable = !ok && outcome === "failed";

  return {
    ok,
    outcome,
    reviewReason:
      typeof row.review_reason === "string" ? row.review_reason : null,
    paymentId: typeof row.payment_id === "string" ? row.payment_id : null,
    orderId: typeof row.order_id === "string" ? row.order_id : null,
    paymentStatus:
      typeof row.payment_status === "string" ? row.payment_status : null,
    orderStatus: typeof row.order_status === "string" ? row.order_status : null,
    accessGranted: row.access_granted === true,
    accessInserted: row.access_inserted === true,
    wasRepaired: row.was_repaired === true,
    wasAlreadyComplete: row.was_already_complete === true,
    isTest: row.is_test === true,
    processingStatus:
      typeof row.processing_status === "string" ? row.processing_status : null,
    webhookEventId:
      typeof row.webhook_event_id === "string" ? row.webhook_event_id : null,
    httpRetryable,
  };
}

export type RecordWebhookEventResult = {
  id: string;
  isNew: boolean;
  processingStatus: string;
  paymentId: string | null;
  orderId: string | null;
  reviewReason: string | null;
};

export async function recordTochkaWebhookEvent(input: {
  dedupKey: string;
  providerEventId: string | null;
  providerPaymentId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  signatureVerified: boolean;
}): Promise<RecordWebhookEventResult | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("record_payment_webhook_event", {
    p_provider: "tochka",
    p_dedup_key: input.dedupKey,
    p_provider_event_id: input.providerEventId,
    p_provider_payment_id: input.providerPaymentId,
    p_event_type: input.eventType,
    p_payload: input.payload,
    p_signature_verified: input.signatureVerified,
  });

  if (error) {
    console.error("record_payment_webhook_event_error", error.message);
    return null;
  }

  const row = data as {
    id?: string;
    is_new?: boolean;
    processing_status?: string;
    payment_id?: string | null;
    order_id?: string | null;
    review_reason?: string | null;
  };

  if (typeof row?.id !== "string") {
    return null;
  }

  return {
    id: row.id,
    isNew: row.is_new === true,
    processingStatus:
      typeof row.processing_status === "string"
        ? row.processing_status
        : "received",
    paymentId: typeof row.payment_id === "string" ? row.payment_id : null,
    orderId: typeof row.order_id === "string" ? row.order_id : null,
    reviewReason:
      typeof row.review_reason === "string" ? row.review_reason : null,
  };
}

/**
 * Transactional Tochka APPROVED fulfillment (P3.0).
 * Always goes through fulfill_tochka_payment_transactional — repairs gaps on replay.
 */
export async function fulfillSucceededTochkaPayment(input: {
  webhookEventId: string;
  providerPaymentId: string;
  paymentId: string | null;
  providerAmountMinor: number;
  providerCurrency: string;
  providerStatus: string;
}): Promise<FulfillTochkaPaymentResult> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc(
    "fulfill_tochka_payment_transactional",
    {
      p_webhook_event_id: input.webhookEventId,
      p_provider_payment_id: input.providerPaymentId,
      p_payment_id: input.paymentId,
      p_provider_amount_minor: input.providerAmountMinor,
      p_provider_currency: input.providerCurrency,
      p_provider_status: input.providerStatus,
    },
  );

  if (error) {
    console.error("fulfill_tochka_payment_rpc_error", error.message);
    logCheckoutEvent("fulfill_payment_rpc_error", {
      webhookEventId: input.webhookEventId,
      paymentId: input.paymentId,
    });
    return {
      ok: false,
      outcome: "failed",
      reviewReason: "rpc_error",
      paymentId: input.paymentId,
      orderId: null,
      paymentStatus: null,
      orderStatus: null,
      accessGranted: false,
      accessInserted: false,
      wasRepaired: false,
      wasAlreadyComplete: false,
      isTest: false,
      processingStatus: "failed",
      webhookEventId: input.webhookEventId,
      httpRetryable: true,
    };
  }

  const result = mapRpcResult(data);

  if (result.outcome === "repaired") {
    logCheckoutEvent("fulfill_payment_repaired", {
      orderId: result.orderId,
      paymentId: result.paymentId,
      webhookEventId: result.webhookEventId,
    });
  } else if (result.outcome === "completed") {
    logCheckoutEvent("fulfill_payment_succeeded", {
      orderId: result.orderId,
      paymentId: result.paymentId,
      alreadyProcessed: false,
      isTest: result.isTest,
    });
  } else if (result.outcome === "already_complete") {
    logCheckoutEvent("fulfill_payment_already_processed", {
      orderId: result.orderId,
      paymentId: result.paymentId,
      webhookEventId: result.webhookEventId,
    });
  } else if (result.outcome === "requires_review") {
    logCheckoutEvent("fulfill_payment_requires_review", {
      orderId: result.orderId,
      paymentId: result.paymentId,
      reviewReason: result.reviewReason,
      webhookEventId: result.webhookEventId,
    });
  } else if (!result.ok) {
    logCheckoutEvent("fulfill_payment_failed", {
      webhookEventId: result.webhookEventId,
      reviewReason: result.reviewReason,
    });
  }

  if (result.paymentId && result.paymentStatus === "succeeded") {
    await settleAuthorAccrual(result.paymentId, result.webhookEventId);
  }

  if (
    result.ok &&
    result.orderId &&
    result.paymentId &&
    !result.isTest
  ) {
    // Enqueue on every successful fulfillment/replay. The SQL enqueue function
    // re-checks canonical-sale conditions and is idempotent by sale_id, so a
    // handler crash after fulfillment cannot permanently lose the notification.
    await notifyAuthorOfCanonicalSale({
      orderId: result.orderId,
    });
  }

  if (
    shouldNotifyPlatformOwnerOfSale({
      ok: result.ok,
      paymentStatus: result.paymentStatus,
      isTest: result.isTest,
      paymentId: result.paymentId,
      orderId: result.orderId,
    })
  ) {
    // Isolated from checkout: never throws, never retries the payment itself.
    await notifyPlatformOwnerOfConfirmedSale({
      paymentId: result.paymentId as string,
      orderId: result.orderId as string,
    });
  }

  return result;
}

/**
 * P3.3.2: drain the accrual obligation the fulfill transaction enqueued.
 * The buyer already has their payment and their access at this point, so a
 * bookkeeping problem must never surface here — anything unresolved stays in
 * the outbox for process_due_finance_obligations.
 */
async function settleAuthorAccrual(
  paymentId: string,
  webhookEventId: string | null,
): Promise<void> {
  try {
    const settled = await ensureFinanceObligationProcessed({
      obligationType: "payment_succeeded_accrual",
      subjectId: paymentId,
      fallbackCorrelationId: webhookEventId,
    });

    if (settled && settled.status === "requires_review") {
      logCheckoutEvent("author_accrual_requires_review", {
        paymentId,
        resultCode: settled.resultCode,
      });
    }
  } catch (error) {
    console.error(
      "author_accrual_post_fulfill_error",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

export async function markWebhookEventTerminal(input: {
  webhookEventId: string;
  processingStatus: "processed" | "ignored" | "requires_review" | "failed";
  reviewReason?: string | null;
  lastError?: string | null;
}): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("payment_webhook_events")
    .update({
      processing_status: input.processingStatus,
      processed_at: now,
      updated_at: now,
      review_reason: input.reviewReason ?? null,
      last_error: input.lastError ?? null,
    })
    .eq("id", input.webhookEventId)
    .in("processing_status", ["received", "failed"]);

  if (error) {
    console.error("mark_webhook_event_terminal_error", error.message);
    return false;
  }

  return true;
}

export async function findPaymentByProviderOperationId(
  operationId: string,
): Promise<PaymentRow | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at, is_test, test_reason",
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
      "id, order_id, provider, provider_payment_id, idempotency_key, status, amount_minor, currency, provider_metadata, created_at, confirmed_at, is_test, test_reason",
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
