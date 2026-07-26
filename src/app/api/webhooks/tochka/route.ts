import { NextResponse } from "next/server";

import { logCheckoutEvent } from "@/lib/payments/checkout-log";
import {
  findPaymentByOrderId,
  findPaymentByProviderOperationId,
  fulfillSucceededTochkaPayment,
  markWebhookEventTerminal,
  recordTochkaWebhookEvent,
} from "@/lib/payments/fulfill-payment";
import { parseTochkaAmountToMinor } from "@/lib/payments/payment-api";
import {
  applyTochkaRefundWebhookStatus,
  isTochkaRefundWebhookStatus,
} from "@/lib/payments/refunds/webhook-refunds";
import { getTochkaConfig } from "@/lib/payments/tochka-config";
import { verifyTochkaWebhookJwt } from "@/lib/payments/tochka-webhook";
import {
  buildTochkaWebhookDedupKey,
  sanitizeTochkaWebhookPayload,
} from "@/lib/payments/webhook-ledger";

/**
 * Tochka acquiring webhook.
 * - Invalid signature → 400 (no fulfill, no ledger trust)
 * - Transient processing failure → 500 (provider retry; event stays failed/received)
 * - Business handled (processed / duplicate / requires_review / ignored) → 200
 */
export async function POST(request: Request) {
  const jwtBody = await request.text();

  if (!jwtBody || jwtBody.trim() === "") {
    logCheckoutEvent("tochka_webhook_empty_body");
    return new NextResponse(null, { status: 400 });
  }

  const payload = await verifyTochkaWebhookJwt(jwtBody.trim());

  if (!payload) {
    console.error("tochka_webhook_invalid_signature");
    logCheckoutEvent("tochka_webhook_signature_invalid");
    return new NextResponse(null, { status: 400 });
  }

  const sanitized = sanitizeTochkaWebhookPayload(payload);
  const dedupKey = buildTochkaWebhookDedupKey(sanitized);

  logCheckoutEvent("tochka_webhook_verified", {
    webhookType: sanitized.webhookType,
    status: sanitized.status,
    hasOperationId: Boolean(sanitized.operationId),
    hasTransactionId: Boolean(sanitized.transactionId),
  });

  if (!dedupKey) {
    logCheckoutEvent("tochka_webhook_dedup_key_missing");
    return new NextResponse(null, { status: 200 });
  }

  const eventType = sanitized.webhookType ?? "unknown";
  const recorded = await recordTochkaWebhookEvent({
    dedupKey,
    providerEventId: sanitized.transactionId,
    providerPaymentId: sanitized.operationId,
    eventType,
    payload: sanitized,
    signatureVerified: true,
  });

  if (!recorded) {
    logCheckoutEvent("tochka_webhook_ledger_write_failed");
    return new NextResponse(null, { status: 500 });
  }

  if (
    recorded.processingStatus === "processed" ||
    recorded.processingStatus === "duplicate"
  ) {
    logCheckoutEvent("tochka_webhook_duplicate", {
      webhookEventId: recorded.id,
      processingStatus: recorded.processingStatus,
    });
    return new NextResponse(null, { status: 200 });
  }

  if (recorded.processingStatus === "requires_review") {
    logCheckoutEvent("tochka_webhook_requires_review", {
      webhookEventId: recorded.id,
      reviewReason: recorded.reviewReason,
    });
    return new NextResponse(null, { status: 200 });
  }

  if (sanitized.webhookType !== "acquiringInternetPayment") {
    await markWebhookEventTerminal({
      webhookEventId: recorded.id,
      processingStatus: "ignored",
      lastError: "unsupported_webhook_type",
    });
    logCheckoutEvent("tochka_webhook_ignored_type", {
      webhookEventId: recorded.id,
    });
    return new NextResponse(null, { status: 200 });
  }

  // Refund lifecycle (P3.3.1) — separate fact layer, APPROVED fulfill untouched.
  if (isTochkaRefundWebhookStatus(sanitized.status)) {
    if (!sanitized.operationId) {
      await markWebhookEventTerminal({
        webhookEventId: recorded.id,
        processingStatus: "ignored",
        lastError: "refund_missing_operation_id",
      });
      return new NextResponse(null, { status: 200 });
    }

    const refundResult = await applyTochkaRefundWebhookStatus({
      providerPaymentId: sanitized.operationId,
      providerStatus: sanitized.status,
      amountMinor: parseTochkaAmountToMinor(sanitized.amount),
      safeSnapshot: {
        webhook_status: sanitized.status,
        webhook_event_id: recorded.id,
      },
      correlationId: `webhook:${recorded.id}`,
    });

    if (!refundResult.ok) {
      logCheckoutEvent("tochka_webhook_refund_failed", {
        webhookEventId: recorded.id,
        outcome: refundResult.outcome,
      });
      return new NextResponse(null, { status: 500 });
    }

    await markWebhookEventTerminal({
      webhookEventId: recorded.id,
      processingStatus:
        refundResult.outcome === "requires_review" ? "requires_review" : "processed",
      reviewReason:
        refundResult.outcome === "requires_review"
          ? "webhook_refund_ambiguous"
          : null,
    });

    logCheckoutEvent("tochka_webhook_refund_applied", {
      webhookEventId: recorded.id,
      outcome: refundResult.outcome,
      updatedCount: refundResult.updatedCount,
    });

    return new NextResponse(null, { status: 200 });
  }

  if (sanitized.status !== "APPROVED") {
    await markWebhookEventTerminal({
      webhookEventId: recorded.id,
      processingStatus: "ignored",
      lastError: "unsupported_status",
    });
    logCheckoutEvent("tochka_webhook_ignored_status", {
      webhookEventId: recorded.id,
      status: sanitized.status,
    });
    return new NextResponse(null, { status: 200 });
  }

  const config = getTochkaConfig();

  if (!config) {
    console.error("tochka_webhook_config_missing");
    logCheckoutEvent("tochka_webhook_config_missing");
    return new NextResponse(null, { status: 500 });
  }

  if (!sanitized.operationId) {
    console.error("tochka_webhook_missing_operation_id");
    logCheckoutEvent("tochka_webhook_missing_operation_id", {
      webhookEventId: recorded.id,
    });
    // Keep event retryable / reviewable via fulfill with empty operation id.
    const result = await fulfillSucceededTochkaPayment({
      webhookEventId: recorded.id,
      providerPaymentId: "",
      paymentId: null,
      providerAmountMinor: 0,
      providerCurrency: "RUB",
      providerStatus: "APPROVED",
    });
    return new NextResponse(null, {
      status: result.httpRetryable ? 500 : 200,
    });
  }

  if (
    sanitized.customerCode &&
    sanitized.customerCode !== config.customerCode
  ) {
    console.error("tochka_webhook_customer_code_mismatch");
    logCheckoutEvent("tochka_webhook_customer_code_mismatch", {
      webhookEventId: recorded.id,
    });
    return new NextResponse(null, { status: 200 });
  }

  if (
    config.merchantId &&
    sanitized.merchantId &&
    sanitized.merchantId !== config.merchantId
  ) {
    console.error("tochka_webhook_merchant_id_mismatch");
    logCheckoutEvent("tochka_webhook_merchant_id_mismatch", {
      webhookEventId: recorded.id,
    });
    return new NextResponse(null, { status: 200 });
  }

  const payment =
    (await findPaymentByProviderOperationId(sanitized.operationId)) ??
    (sanitized.paymentLinkId
      ? await findPaymentByOrderId(sanitized.paymentLinkId)
      : null);

  if (!payment) {
    console.error("tochka_webhook_payment_not_found");
    logCheckoutEvent("tochka_webhook_payment_not_found", {
      webhookEventId: recorded.id,
    });
  } else if (
    sanitized.paymentLinkId &&
    sanitized.paymentLinkId !== payment.order_id
  ) {
    console.error("tochka_webhook_payment_link_id_mismatch");
    logCheckoutEvent("tochka_webhook_payment_link_id_mismatch", {
      webhookEventId: recorded.id,
      paymentId: payment.id,
    });
  }

  if (payment && payment.currency !== "RUB") {
    console.error("tochka_webhook_currency_mismatch");
    logCheckoutEvent("tochka_webhook_currency_mismatch", {
      webhookEventId: recorded.id,
      paymentId: payment.id,
    });
  }

  const webhookAmountMinor = parseTochkaAmountToMinor(sanitized.amount);

  const result = await fulfillSucceededTochkaPayment({
    webhookEventId: recorded.id,
    providerPaymentId: sanitized.operationId,
    paymentId: payment?.id ?? null,
    providerAmountMinor: webhookAmountMinor ?? -1,
    providerCurrency: "RUB",
    providerStatus: "APPROVED",
  });

  if (result.httpRetryable) {
    logCheckoutEvent("tochka_webhook_fulfill_retryable", {
      webhookEventId: recorded.id,
      outcome: result.outcome,
    });
    return new NextResponse(null, { status: 500 });
  }

  if (result.outcome === "requires_review") {
    logCheckoutEvent("tochka_webhook_requires_review", {
      webhookEventId: recorded.id,
      reviewReason: result.reviewReason,
      orderId: result.orderId,
      paymentId: result.paymentId,
    });
  } else if (result.outcome === "repaired") {
    logCheckoutEvent("tochka_webhook_fulfill_repaired", {
      webhookEventId: recorded.id,
      orderId: result.orderId,
      paymentId: result.paymentId,
    });
  } else {
    logCheckoutEvent("tochka_webhook_fulfill_ok", {
      webhookEventId: recorded.id,
      orderId: result.orderId,
      alreadyProcessed: result.wasAlreadyComplete,
      outcome: result.outcome,
    });
  }

  return new NextResponse(null, { status: 200 });
}
