#!/usr/bin/env node
/**
 * Payments P3.0 client/unit checks (no production DB writes).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTochkaWebhookDedupKey,
  ledgerPayloadContainsForbiddenKeys,
  sanitizeTochkaWebhookPayload,
} from "../src/lib/payments/webhook-ledger.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function testSanitizeAndDedup() {
  const raw = {
    webhookType: "acquiringInternetPayment",
    status: "APPROVED",
    operationId: "op-1",
    paymentLinkId: "order-1",
    amount: "299.00",
    paymentType: "sbp",
    transactionId: "tx-abc",
    customerCode: "123",
    merchantId: "456",
    qrcId: "qrc",
    payerName: "Secret Person",
    purpose: "should not matter",
  };

  const sanitized = sanitizeTochkaWebhookPayload(raw);
  assertEqual(sanitized.transactionId, "tx-abc", "keeps transactionId");
  assertEqual(sanitized.operationId, "op-1", "keeps operationId");
  assert(!("payerName" in sanitized), "payerName dropped from sanitized object shape");
  assertEqual(
    buildTochkaWebhookDedupKey(sanitized),
    "tochka:tx:tx-abc",
    "prefers transactionId dedup",
  );

  const noTx = sanitizeTochkaWebhookPayload({
    webhookType: "acquiringInternetPayment",
    status: "APPROVED",
    operationId: "op-2",
    amount: 99,
  });
  assertEqual(
    buildTochkaWebhookDedupKey(noTx),
    "tochka:acquiringInternetPayment:op-2:APPROVED:99",
    "fallback dedup",
  );

  assert(
    ledgerPayloadContainsForbiddenKeys({ payerName: "x" }),
    "detects forbidden keys",
  );
  assert(
    !ledgerPayloadContainsForbiddenKeys({ operationId: "x" }),
    "allows safe keys",
  );
}

function testSourceContracts() {
  const fulfill = readFileSync(
    join(ROOT, "src/lib/payments/fulfill-payment.ts"),
    "utf8",
  );
  const webhook = readFileSync(
    join(ROOT, "src/app/api/webhooks/tochka/route.ts"),
    "utf8",
  );
  const admin = readFileSync(join(ROOT, "src/lib/admin/queries.ts"), "utf8");
  const migration = readFileSync(
    join(
      ROOT,
      "supabase/migrations/20260725190000_payments_p30_transactional_fulfill.sql",
    ),
    "utf8",
  );
  const checkoutStatus = readFileSync(
    join(ROOT, "src/app/api/checkout/status/route.ts"),
    "utf8",
  );

  assert(
    fulfill.includes("fulfill_tochka_payment_transactional"),
    "fulfill calls transactional RPC",
  );
  assert(
    !fulfill.includes('from("payments")\n    .update'),
    "fulfill no longer updates payments table directly",
  );
  assert(webhook.includes("recordTochkaWebhookEvent"), "webhook ledger");
  assert(webhook.includes("status: 400"), "invalid signature 400");
  assert(webhook.includes("status: 500"), "retryable 500");
  assert(
    admin.includes('.eq("status", "succeeded")') &&
      admin.includes('.eq("is_test", false)'),
    "admin revenue uses succeeded non-test payments",
  );
  assert(
    admin.includes("Подтверждённая выручка (без test)"),
    "admin revenue label excludes test",
  );
  assert(
    migration.includes("cancelled_order_late_approved"),
    "cancelled late APPROVED policy",
  );
  assert(migration.includes("payment_webhook_events"), "ledger table");
  assert(migration.includes("is_test"), "test flags");
  assert(
    !checkoutStatus.includes("grant_practice_purchase_access"),
    "checkout status does not grant access",
  );
  assert(
    !checkoutStatus.includes("status: \"paid\""),
    "checkout status does not write paid",
  );
}

function testPaymentsRouteIgnoresClientTestFlags() {
  const route = readFileSync(
    join(ROOT, "src/app/api/payments/route.ts"),
    "utf8",
  );
  assert(
    !route.includes("body.is_test") && !route.includes('parsedBody.is_test'),
    "payments route does not read client is_test",
  );
}

async function main() {
  // Dynamic import path above uses .ts — run via tsx.
  testSanitizeAndDedup();
  testSourceContracts();
  testPaymentsRouteIgnoresClientTestFlags();
  console.log("payments-p30-client-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
