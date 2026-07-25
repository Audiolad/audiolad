/**
 * Tochka webhook ledger helpers (P3.0).
 * Payload stored in DB is a sanitized audit subset — never JWT / payer PII.
 */

export const TOCHKA_WEBHOOK_PROVIDER = "tochka" as const;

/** Fields allowed in payment_webhook_events.payload */
export const TOCHKA_LEDGER_PAYLOAD_KEYS = [
  "webhookType",
  "status",
  "operationId",
  "paymentLinkId",
  "amount",
  "paymentType",
  "transactionId",
  "customerCode",
  "merchantId",
  "qrcId",
] as const;

const FORBIDDEN_LEDGER_KEYS = new Set([
  "payername",
  "customeremail",
  "email",
  "phone",
  "receipt",
  "jwt",
  "token",
  "authorization",
  "card",
  "pan",
]);

export type SanitizedTochkaWebhookPayload = {
  webhookType: string | null;
  status: string | null;
  operationId: string | null;
  paymentLinkId: string | null;
  amount: string | number | null;
  paymentType: string | null;
  transactionId: string | null;
  customerCode: string | null;
  merchantId: string | null;
  qrcId: string | null;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function asAmount(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  return null;
}

export function sanitizeTochkaWebhookPayload(
  payload: Record<string, unknown>,
): SanitizedTochkaWebhookPayload {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_LEDGER_KEYS.has(key.toLowerCase())) {
      // Explicitly drop — never copy into ledger JSON.
      continue;
    }
  }

  return {
    webhookType: asTrimmedString(payload.webhookType),
    status: asTrimmedString(payload.status),
    operationId: asTrimmedString(payload.operationId),
    paymentLinkId: asTrimmedString(payload.paymentLinkId),
    amount: asAmount(payload.amount),
    paymentType: asTrimmedString(payload.paymentType),
    transactionId: asTrimmedString(payload.transactionId),
    customerCode: asTrimmedString(payload.customerCode),
    merchantId: asTrimmedString(payload.merchantId),
    qrcId: asTrimmedString(payload.qrcId),
  };
}

/**
 * Stable dedup key for Tochka acquiringInternetPayment.
 * Prefer transactionId (unique per provider operation event);
 * fallback: webhookType:operationId:status:amount.
 */
export function buildTochkaWebhookDedupKey(
  sanitized: SanitizedTochkaWebhookPayload,
): string | null {
  if (sanitized.transactionId) {
    return `tochka:tx:${sanitized.transactionId}`;
  }

  if (!sanitized.operationId || !sanitized.status) {
    return null;
  }

  const amountPart =
    sanitized.amount === null || sanitized.amount === undefined
      ? "na"
      : String(sanitized.amount);

  const eventType = sanitized.webhookType ?? "acquiringInternetPayment";
  return `tochka:${eventType}:${sanitized.operationId}:${sanitized.status}:${amountPart}`;
}

export function ledgerPayloadContainsForbiddenKeys(
  payload: Record<string, unknown>,
): boolean {
  return Object.keys(payload).some((key) =>
    FORBIDDEN_LEDGER_KEYS.has(key.toLowerCase()),
  );
}
