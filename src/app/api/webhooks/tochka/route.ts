import { NextResponse } from "next/server";

import {
  findPaymentByOrderId,
  findPaymentByProviderOperationId,
  fulfillSucceededTochkaPayment,
} from "@/lib/payments/fulfill-payment";
import { parseTochkaAmountToMinor } from "@/lib/payments/payment-api";
import { getTochkaConfig } from "@/lib/payments/tochka-config";
import { verifyTochkaWebhookJwt } from "@/lib/payments/tochka-webhook";

export async function POST(request: Request) {
  const jwtBody = await request.text();

  if (!jwtBody || jwtBody.trim() === "") {
    return new NextResponse(null, { status: 400 });
  }

  const payload = await verifyTochkaWebhookJwt(jwtBody.trim());

  if (!payload) {
    console.error("tochka_webhook_invalid_signature");
    return new NextResponse(null, { status: 400 });
  }

  if (payload.webhookType !== "acquiringInternetPayment") {
    return new NextResponse(null, { status: 200 });
  }

  const status = typeof payload.status === "string" ? payload.status : "";

  if (status !== "APPROVED") {
    return new NextResponse(null, { status: 200 });
  }

  const config = getTochkaConfig();

  if (!config) {
    console.error("tochka_webhook_config_missing");
    return new NextResponse(null, { status: 500 });
  }

  const operationId =
    typeof payload.operationId === "string" ? payload.operationId : null;
  const paymentLinkId =
    typeof payload.paymentLinkId === "string" ? payload.paymentLinkId : null;
  const webhookCustomerCode =
    typeof payload.customerCode === "string" ? payload.customerCode : null;
  const webhookMerchantId =
    typeof payload.merchantId === "string" ? payload.merchantId : null;

  if (!operationId) {
    console.error("tochka_webhook_missing_operation_id");
    return new NextResponse(null, { status: 200 });
  }

  if (
    webhookCustomerCode &&
    webhookCustomerCode !== config.customerCode
  ) {
    console.error("tochka_webhook_customer_code_mismatch");
    return new NextResponse(null, { status: 200 });
  }

  if (config.merchantId && webhookMerchantId && webhookMerchantId !== config.merchantId) {
    console.error("tochka_webhook_merchant_id_mismatch");
    return new NextResponse(null, { status: 200 });
  }

  const payment =
    (await findPaymentByProviderOperationId(operationId)) ??
    (paymentLinkId ? await findPaymentByOrderId(paymentLinkId) : null);

  if (!payment) {
    console.error("tochka_webhook_payment_not_found", operationId);
    return new NextResponse(null, { status: 200 });
  }

  if (paymentLinkId && paymentLinkId !== payment.order_id) {
    console.error("tochka_webhook_payment_link_id_mismatch", {
      paymentId: payment.id,
    });
    return new NextResponse(null, { status: 200 });
  }

  if (payment.currency !== "RUB") {
    console.error("tochka_webhook_currency_mismatch", {
      paymentId: payment.id,
    });
    return new NextResponse(null, { status: 200 });
  }

  const webhookAmountMinor = parseTochkaAmountToMinor(payload.amount);

  if (
    webhookAmountMinor === null ||
    webhookAmountMinor !== payment.amount_minor
  ) {
    console.error("tochka_webhook_amount_mismatch", {
      expected: payment.amount_minor,
      actual: webhookAmountMinor,
      paymentId: payment.id,
    });
    return new NextResponse(null, { status: 200 });
  }

  const result = await fulfillSucceededTochkaPayment({
    paymentId: payment.id,
    providerPaymentId: operationId,
    providerStatus: status,
    webhookPayload: payload,
  });

  if (!result.ok) {
    console.error("tochka_webhook_fulfill_failed", result.reason);
  }

  return new NextResponse(null, { status: 200 });
}
