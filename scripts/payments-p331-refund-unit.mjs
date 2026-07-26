#!/usr/bin/env node
/**
 * P3.3.1 refund unit tests: state machine, classification, money math,
 * provider mapping and source contracts. No DB, no provider calls.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canTransitionRefund,
  classifyRefundTransportFailure,
  isRefundInFlight,
  isRefundReserved,
  isRefundStatus,
  isRefundTerminal,
  mapProviderRefundStatus,
  REFUND_IN_FLIGHT_STATUSES,
  REFUND_RESERVED_STATUSES,
  REFUND_STATUSES,
} from "../src/lib/payments/refunds/types.ts";
import {
  classifyRefundKind,
  computeRefundableMinor,
  mapRefundSettlement,
  predictRefundAccessEffect,
  validateRefundAmount,
} from "../src/lib/payments/refunds/settlement.ts";
import { minorToRubles } from "../src/lib/payments/tochka-config.ts";
import { PLATFORM_ROLE_PERMISSIONS } from "../src/lib/auth/platform-permissions.ts";

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

function testStatusMachine() {
  assertEqual(REFUND_STATUSES.length, 7, "seven refund statuses");
  assert(isRefundStatus("requires_review"), "requires_review is a status");
  assert(!isRefundStatus("refunded"), "payment statuses are not refund statuses");

  assert(canTransitionRefund("requested", "submitted"), "requested → submitted");
  assert(canTransitionRefund("requested", "cancelled"), "requested → cancelled");
  assert(canTransitionRefund("submitted", "pending"), "submitted → pending");
  assert(canTransitionRefund("submitted", "succeeded"), "submitted → succeeded");
  assert(canTransitionRefund("pending", "succeeded"), "pending → succeeded");
  assert(canTransitionRefund("requires_review", "succeeded"), "review → succeeded");
  assert(canTransitionRefund("requires_review", "failed"), "review → failed");

  assert(!canTransitionRefund("requested", "succeeded"), "no jump to succeeded");
  assert(!canTransitionRefund("requested", "pending"), "no jump to pending");
  assert(!canTransitionRefund("submitted", "cancelled"), "submitted is provider-owned");
  // Spec allows cancel/reconcile repair from pending and requires_review.
  assert(canTransitionRefund("pending", "cancelled"), "pending → cancelled via reconcile");
  assert(canTransitionRefund("requires_review", "cancelled"), "review → cancelled via reconcile");
  assert(canTransitionRefund("requires_review", "pending"), "review → pending via reconcile");

  for (const terminal of ["succeeded", "failed", "cancelled"]) {
    assert(isRefundTerminal(terminal), `${terminal} is terminal`);
    assert(canTransitionRefund(terminal, terminal), `${terminal} self is idempotent`);
    for (const other of REFUND_STATUSES) {
      if (other === terminal) continue;
      assert(
        !canTransitionRefund(terminal, other),
        `${terminal} must not move to ${other}`,
      );
    }
  }
}

function testReserveSets() {
  assertEqual(REFUND_IN_FLIGHT_STATUSES.length, 3, "three in-flight statuses");
  for (const status of ["requested", "submitted", "pending"]) {
    assert(isRefundInFlight(status), `${status} is in flight`);
    assert(isRefundReserved(status), `${status} reserves money`);
  }

  // A timeout must keep the money reserved without pretending work is in flight.
  assert(!isRefundInFlight("requires_review"), "requires_review is not in flight");
  assert(isRefundReserved("requires_review"), "requires_review still reserves");
  assert(REFUND_RESERVED_STATUSES.includes("requires_review"), "reserved set includes review");

  for (const status of ["succeeded", "failed", "cancelled"]) {
    assert(!isRefundReserved(status), `${status} releases the reserve`);
  }
}

function testProviderMapping() {
  assertEqual(mapProviderRefundStatus("REFUNDED"), "succeeded", "REFUNDED → succeeded");
  assertEqual(mapProviderRefundStatus("ON-REFUND"), "pending", "ON-REFUND → pending");
  assertEqual(mapProviderRefundStatus("on-refund"), "pending", "case insensitive");
  assertEqual(mapProviderRefundStatus("CREATED"), "pending", "CREATED → pending");
  assertEqual(
    mapProviderRefundStatus("SOMETHING_NEW"),
    "requires_review",
    "unknown → requires_review",
  );
  assertEqual(mapProviderRefundStatus(null), "requires_review", "null → requires_review");

  // Definitive rejections release the reserve; unknown outcomes keep it.
  assertEqual(
    classifyRefundTransportFailure("tochka_refund_rejected"),
    "failed",
    "4xx is a definitive failure",
  );
  assertEqual(
    classifyRefundTransportFailure("tochka_refund_invalid_amount"),
    "failed",
    "invalid amount never reached the provider",
  );
  assertEqual(
    classifyRefundTransportFailure("tochka_refund_timeout"),
    "requires_review",
    "timeout leaves state unknown",
  );
  assertEqual(
    classifyRefundTransportFailure("tochka_refund_transport_error"),
    "requires_review",
    "network error leaves state unknown",
  );
  assertEqual(
    classifyRefundTransportFailure("tochka_refund_failed"),
    "requires_review",
    "5xx leaves state unknown",
  );
  assertEqual(
    classifyRefundTransportFailure(undefined),
    "requires_review",
    "unknown code is conservative",
  );
}

function testRefundableMath() {
  assertEqual(
    computeRefundableMinor({
      grossMinor: 30000,
      confirmedRefundedMinor: 0,
      inFlightMinor: 0,
      requiresReviewMinor: 0,
    }),
    30000,
    "fresh payment is fully refundable",
  );
  assertEqual(
    computeRefundableMinor({
      grossMinor: 30000,
      confirmedRefundedMinor: 10000,
      inFlightMinor: 5000,
      requiresReviewMinor: 0,
    }),
    15000,
    "in-flight reserves reduce refundable",
  );
  assertEqual(
    computeRefundableMinor({
      grossMinor: 30000,
      confirmedRefundedMinor: 10000,
      inFlightMinor: 5000,
      requiresReviewMinor: 15000,
    }),
    0,
    "requires_review keeps its reserve",
  );
  assertEqual(
    computeRefundableMinor({
      grossMinor: 10000,
      confirmedRefundedMinor: 12000,
      inFlightMinor: 0,
      requiresReviewMinor: 0,
    }),
    0,
    "never negative",
  );
}

function testAmountValidation() {
  assertEqual(validateRefundAmount(10000, 30000).ok, true, "valid partial");
  assertEqual(validateRefundAmount(30000, 30000).ok, true, "valid full");
  assertEqual(
    validateRefundAmount(30001, 30000).error,
    "refund_amount_exceeds_refundable",
    "over-refund by one kopek is rejected",
  );
  assertEqual(validateRefundAmount(0, 30000).error, "amount_must_be_positive", "zero");
  assertEqual(validateRefundAmount(-1, 30000).error, "amount_must_be_positive", "negative");
  assertEqual(
    validateRefundAmount(100.5, 30000).error,
    "amount_must_be_integer",
    "fractional minor units are rejected",
  );
  assertEqual(
    validateRefundAmount(Number.NaN, 30000).error,
    "amount_must_be_positive",
    "NaN",
  );
  assertEqual(
    validateRefundAmount(100, 0).error,
    "no_refundable_amount",
    "fully refunded payment",
  );
}

function testKindAndAccessEffect() {
  assertEqual(classifyRefundKind(10000, 30000), "partial", "part of the balance");
  assertEqual(classifyRefundKind(30000, 30000), "full", "closes the balance");
  assertEqual(classifyRefundKind(29999, 30000), "partial", "one kopek short is partial");

  assertEqual(
    predictRefundAccessEffect({
      amountMinor: 10000,
      grossMinor: 30000,
      confirmedRefundedMinor: 0,
    }),
    "keep",
    "partial refund keeps access",
  );
  assertEqual(
    predictRefundAccessEffect({
      amountMinor: 20000,
      grossMinor: 30000,
      confirmedRefundedMinor: 10000,
    }),
    "manual_review",
    "last refund flags a manual access decision",
  );
  assertEqual(
    predictRefundAccessEffect({
      amountMinor: 30000,
      grossMinor: 30000,
      confirmedRefundedMinor: 0,
    }),
    "manual_review",
    "single full refund flags review",
  );
}

function testMoneySerialization() {
  // Refund amount must be serialized exactly like create payment.
  assertEqual(minorToRubles(29900), 299, "whole rubles");
  assertEqual(minorToRubles(19999), 199.99, "kopeks preserved");
  assertEqual(minorToRubles(1), 0.01, "one kopek");
  assertEqual(minorToRubles(123400), 1234, "1234.00 style amount");
  assertEqual(minorToRubles(100), 1, "one ruble");

  // Round-trip must not drift for typical prices.
  for (const minor of [1, 99, 100, 12345, 29900, 199999]) {
    assertEqual(
      Math.round(minorToRubles(minor) * 100),
      minor,
      `round-trip ${minor}`,
    );
  }
}

function testSettlementMapping() {
  const mapped = mapRefundSettlement(
    {
      found: true,
      payment_id: "p1",
      order_id: "o1",
      provider_payment_id: "op1",
      payment_status: "succeeded",
      currency: "RUB",
      is_test: false,
      gross_minor: 30000,
      confirmed_refunded_minor: 10000,
      in_flight_minor: 5000,
      requires_review_minor: 2000,
      reserved_minor: 7000,
      refundable_minor: 13000,
      net_collected_minor: 20000,
      refund_count: 3,
      confirmed_count: 1,
      in_flight_count: 1,
      requires_review_count: 1,
      settlement_status: "partially_refunded",
    },
    "p1",
  );

  assertEqual(mapped.found, true, "found");
  assertEqual(mapped.refundableMinor, 13000, "refundable mapped");
  assertEqual(mapped.settlementStatus, "partially_refunded", "status mapped");
  assertEqual(
    mapped.refundableMinor,
    computeRefundableMinor({
      grossMinor: mapped.grossMinor,
      confirmedRefundedMinor: mapped.confirmedRefundedMinor,
      inFlightMinor: mapped.inFlightMinor,
      requiresReviewMinor: mapped.requiresReviewMinor,
    }),
    "SQL and TS refundable agree",
  );

  const missing = mapRefundSettlement(null, "p2");
  assertEqual(missing.found, false, "missing payment");
  assertEqual(missing.grossMinor, 0, "zero gross");
  assertEqual(missing.settlementStatus, "requires_review", "missing maps to requires_review");
}

function testPermissions() {
  assert(
    PLATFORM_ROLE_PERMISSIONS.finance.includes("refunds.manage"),
    "finance can manage refunds",
  );
  assert(
    PLATFORM_ROLE_PERMISSIONS.owner.includes("refunds.manage"),
    "owner can manage refunds",
  );
  for (const role of ["analyst", "support", "editor", "admin"]) {
    assert(
      !PLATFORM_ROLE_PERMISSIONS[role].includes("refunds.manage"),
      `${role} cannot manage refunds`,
    );
  }
}

function testSourceContracts() {
  const migration = readFileSync(
    join(ROOT, "supabase/migrations/20260726120000_payments_p331_refund_facts.sql"),
    "utf8",
  );
  const p31Migration = readFileSync(
    join(ROOT, "supabase/migrations/20260725192000_admin_payments_p31_money.sql"),
    "utf8",
  );
  const client = readFileSync(join(ROOT, "src/lib/payments/tochka-client.ts"), "utf8");
  const webhook = readFileSync(join(ROOT, "src/app/api/webhooks/tochka/route.ts"), "utf8");
  const panel = readFileSync(join(ROOT, "src/components/admin/AdminRefundsPanel.tsx"), "utf8");
  const moneyPanel = readFileSync(join(ROOT, "src/components/admin/AdminMoneyPanel.tsx"), "utf8");
  const moneyQueries = readFileSync(join(ROOT, "src/lib/admin/analytics-money-queries.ts"), "utf8");

  // Refund facts never rewrite the P3.1 source of truth.
  assert(
    !/UPDATE\s+public\.payments\s+SET[\s\S]{0,400}status\s*=/i.test(migration),
    "refund migration never updates payments.status",
  );
  assert(
    !/DELETE\s+FROM\s+public\.user_practices/i.test(migration),
    "refund migration never revokes access",
  );
  assert(
    migration.includes("admin_payments_p31_payment_base"),
    "refund summary reuses the P3.1 gross base",
  );
  assert(
    !migration.includes("CREATE OR REPLACE FUNCTION public.admin_payments_p31_summary"),
    "refund migration does not redefine the P3.1 summary",
  );
  assert(
    p31Migration.includes("'refunds', 'not_connected'"),
    "P3.1 summary notes are untouched",
  );

  // Security posture.
  assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
  assert(migration.includes("FROM anon, authenticated"), "anon/authenticated revoked");
  assert(migration.includes("SET search_path = public, pg_temp"), "fixed search_path");
  assert(
    migration.includes("GRANT SELECT, INSERT ON TABLE public.finance_audit_log"),
    "audit log is append-only",
  );
  assert(
    !/GRANT\s+ALL\s+ON\s+TABLE\s+public\.finance_audit_log/i.test(migration),
    "audit log never gets ALL grants",
  );
  assert(migration.includes("'refunds.manage'"), "permission seeded");
  assert(migration.includes("FOR UPDATE"), "payment row is locked");
  assert(migration.includes("amount_minor > 0"), "positive amount constraint");
  assert(
    migration.includes("payment_refunds_idempotency_key_uidx"),
    "idempotency key is unique",
  );
  assert(
    migration.includes("payment_refunds_provider_refund_id_uidx"),
    "provider refund id is unique",
  );

  // Provider contract.
  assert(client.includes("/refund"), "refund endpoint wired");
  assert(client.includes("minorToRubles"), "refund amount uses the shared serializer");
  assert(client.includes("tochka_refund_timeout"), "timeout is a distinct code");
  assert(!client.includes("jwtToken}`,\n      body"), "token never lands in the body");
  assert(
    !/console\.(log|error)\([^)]*jwtToken/.test(client),
    "token is never logged",
  );

  // Webhook keeps the APPROVED fulfill path intact.
  assert(webhook.includes("isTochkaRefundWebhookStatus"), "refund statuses handled");
  assert(
    webhook.includes("fulfillSucceededTochkaPayment"),
    "APPROVED fulfill still present",
  );
  assert(
    webhook.indexOf("isTochkaRefundWebhookStatus") <
      webhook.indexOf('sanitized.status !== "APPROVED"'),
    "refund branch runs before the unsupported-status bail-out",
  );

  // Admin UI safety.
  const dictionary = readFileSync(
    join(ROOT, "src/lib/admin/analytics-money-dictionary.ts"),
    "utf8",
  );
  assert(
    dictionary.includes("Будет отправлен реальный возврат через Точку"),
    "real money warning copy exists",
  );
  assert(
    panel.includes("ADMIN_REFUND_REAL_MONEY_WARNING") && panel.includes("confirming"),
    "refund dialog has a real money confirmation step",
  );
  assert(panel.includes("Весь остаток"), "full remaining quick action");
  assert(!panel.includes("email"), "refund panel shows no payer email");
  assert(!panel.includes("user_id"), "refund panel shows no buyer id");
  assert(
    dictionary.includes("Чистые поступления") && dictionary.includes("netCollected"),
    "net collected metric is defined",
  );
  assert(
    moneyPanel.includes("ADMIN_REFUND_METRIC_DICTIONARY") &&
      moneyPanel.includes("netCollected"),
    "money panel renders the refund overlay",
  );
  assert(
    moneyPanel.includes("ADMIN_MONEY_PROVIDER_FEES_NOTE"),
    "provider fees marked as not connected",
  );
  assert(
    moneyQueries.includes("admin_refund_p331_summary"),
    "money summary loads the refund overlay",
  );
  assert(
    moneyQueries.includes('supabase.rpc("admin_payments_p31_summary"'),
    "money gross still comes from P3.1",
  );
}

function main() {
  testStatusMachine();
  testReserveSets();
  testProviderMapping();
  testRefundableMath();
  testAmountValidation();
  testKindAndAccessEffect();
  testMoneySerialization();
  testSettlementMapping();
  testPermissions();
  testSourceContracts();
  console.log("payments-p331-refund-unit: ok");
}

main();
