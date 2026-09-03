#!/usr/bin/env npx tsx
import assert from "node:assert/strict";

import {
  decideGetCourseCallbackApply,
  isProviderConfirmedFullyPaid,
  parseGetCourseCallback,
} from "../src/lib/author-appreciation/getcourse/callback";
import { authorShareMinor, platformShareMinor } from "../src/lib/payments/author-finance/types";
import { handleGetCourseAppreciationCallback } from "../src/lib/author-appreciation/getcourse/handle-callback";

const SECRET = "callback-secret";
const OFFER_ID = "3875235";
const PRODUCTION_PAYLOAD = {
  deal: {
    id: "99887766",
    number: "1001",
    offers: OFFER_ID,
    deal_cost: "100",
    payed_money: "100",
    left_cost_money: "0",
    status: "payed",
  },
};

type RpcCall = {
  p_provider_deal_id: string | null;
  p_provider_deal_number: string | null;
  p_offer_id: string;
  p_amount_minor: number;
  p_status: string;
  p_payed_money_minor: number | null;
  p_left_cost_money_minor: number | null;
};

function captureLogs() {
  const logs: Array<{ label: unknown; details: Record<string, unknown> }> = [];
  const original = console.info;
  console.info = (label: unknown, details?: unknown) => {
    logs.push({
      label,
      details: details && typeof details === "object" ? (details as Record<string, unknown>) : {},
    });
  };
  return {
    logs,
    restore() {
      console.info = original;
    },
  };
}

async function handle(
  overrides: Partial<Parameters<typeof handleGetCourseAppreciationCallback>[0]> & {
    rpcImpl?: (args: RpcCall) => Promise<{ error: null; data: unknown }>;
    rpcOutcome?: string;
  } = {},
) {
  const calls: RpcCall[] = [];
  const result = await handleGetCourseAppreciationCallback({
    secretHeader: overrides.secretHeader ?? SECRET,
    expectedSecret: overrides.expectedSecret ?? SECRET,
    contentType: overrides.contentType ?? "application/json",
    payload: overrides.payload ?? PRODUCTION_PAYLOAD,
    configuredOfferId: overrides.configuredOfferId ?? OFFER_ID,
    rpc: async (args) => {
      calls.push(args);
      if (overrides.rpcImpl) return overrides.rpcImpl(args);
      return { error: null, data: [{ outcome: overrides.rpcOutcome ?? "paid", intent_id: "intent-1" }] };
    },
  });
  return { result, calls };
}

function assertSafeIgnoreLog(
  logs: Array<{ label: unknown; details: Record<string, unknown> }>,
  reason: string,
) {
  assert.equal(logs.length, 1);
  assert.equal(logs[0].label, "author_appreciation_getcourse_callback_ignored");
  assert.equal(logs[0].details.reason, reason);
  const serialized = JSON.stringify(logs);
  assert.doesNotMatch(serialized, /callback-secret/);
  assert.doesNotMatch(serialized, /@/);
  assert.doesNotMatch(serialized, /pay\.example/);
  assert.equal(Object.prototype.hasOwnProperty.call(logs[0].details, "payload"), false);
  assert.ok("deal_id_present" in logs[0].details);
  assert.ok("deal_number_present" in logs[0].details);
  assert.ok("offer_field_present" in logs[0].details);
  assert.ok("amount_present" in logs[0].details);
  assert.ok("status_present" in logs[0].details);
}

{
  // A — exact production Process payload with deal.offers
  const parsed = parseGetCourseCallback(PRODUCTION_PAYLOAD);
  assert.equal(parsed.dealId, "99887766");
  assert.equal(parsed.dealNumber, "1001");
  assert.deepEqual(parsed.offerIds, [OFFER_ID]);
  assert.equal(parsed.offerId, OFFER_ID);
  assert.equal(parsed.offerFieldPresent, true);
  assert.equal(parsed.amountMinor, 10_000);
  assert.equal(parsed.status, "payed");
  assert.equal(parsed.payedMoneyMinor, 10_000);
  assert.equal(parsed.leftCostMoneyMinor, 0);
  const { result, calls } = await handle();
  assert.equal(result.status, 200);
  assert.equal(result.rpcCalled, true);
  assert.equal(result.ignoredReason, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_provider_deal_id, "99887766");
  assert.equal(calls[0].p_provider_deal_number, "1001");
  assert.equal(calls[0].p_offer_id, OFFER_ID);
  assert.equal(calls[0].p_amount_minor, 10_000);
  assert.equal(calls[0].p_status, "payed");
}

{
  // B — legacy offer_id / offer_ids still works
  const legacy = parseGetCourseCallback({
    data: {
      deal: {
        id: 42,
        number: 1001,
        offer_ids: ["offer-1"],
        deal_cost: "500",
        status: "payed",
        payed_money: "500",
        left_cost_money: "0",
      },
    },
  });
  assert.equal(legacy.offerId, "offer-1");
  assert.deepEqual(legacy.offerIds, ["offer-1"]);
  const { result, calls } = await handle({
    payload: {
      deal: {
        id: "42",
        number: "1001",
        offer_id: "offer-1",
        deal_cost: "500",
        payed_money: "500",
        left_cost_money: "0",
        status: "payed",
      },
    },
    configuredOfferId: "offer-1",
  });
  assert.equal(result.status, 200);
  assert.equal(calls[0].p_offer_id, "offer-1");
}

{
  // C — wrong secret rejected, no RPC
  const { result, calls } = await handle({ secretHeader: "wrong-secret" });
  assert.equal(result.status, 401);
  assert.equal(result.rpcCalled, false);
  assert.equal(calls.length, 0);
}

{
  // D — unknown deal does not create an intent
  const { result, calls } = await handle({ rpcOutcome: "unknown" });
  assert.equal(result.status, 200);
  assert.equal(result.ignoredReason, "unknown_deal");
  assert.equal(calls.length, 1);
  assert.equal(result.rpcCalled, true);
}

{
  // E — fully-paid amount mismatch reaches RPC (needs_review / no accrual lives in SQL)
  const { result, calls } = await handle({
    payload: {
      ...PRODUCTION_PAYLOAD,
      deal: {
        ...PRODUCTION_PAYLOAD.deal,
        deal_cost: "999",
        payed_money: "999",
        left_cost_money: "0",
      },
    },
    rpcOutcome: "needs_review",
  });
  assert.equal(result.status, 200);
  assert.equal(calls[0].p_amount_minor, 99_900);
  assert.notEqual(calls[0].p_amount_minor, 10_000);
}

{
  // F — partial payment stays pending (no RPC, no needs_review promotion)
  const ignored = captureLogs();
  try {
    const { result, calls } = await handle({
      payload: {
        ...PRODUCTION_PAYLOAD,
        deal: { ...PRODUCTION_PAYLOAD.deal, status: "part_payed", left_cost_money: "50" },
      },
    });
    assert.equal(result.status, 200);
    assert.equal(result.rpcCalled, false);
    assert.equal(result.ignoredReason, "partial_payment");
    assert.equal(calls.length, 0);
    assertSafeIgnoreLog(ignored.logs, "partial_payment");
  } finally {
    ignored.restore();
  }

  const { result: payedPartial, calls: payedPartialCalls } = await handle({
    payload: {
      ...PRODUCTION_PAYLOAD,
      deal: { ...PRODUCTION_PAYLOAD.deal, payed_money: "50", left_cost_money: "50" },
    },
  });
  assert.equal(payedPartial.rpcCalled, false);
  assert.equal(payedPartial.ignoredReason, "partial_payment");
  assert.equal(payedPartialCalls.length, 0);
}

{
  // G — duplicate callback calls the same canonical RPC twice (exactly-once accrual is SQL)
  const calls: RpcCall[] = [];
  const rpc = async (args: RpcCall) => {
    calls.push(args);
    return {
      error: null,
      data: [{ outcome: calls.length === 1 ? "paid" : "already_paid", intent_id: "intent-1" }],
    };
  };
  const first = await handleGetCourseAppreciationCallback({
    secretHeader: SECRET,
    expectedSecret: SECRET,
    contentType: "application/json",
    payload: PRODUCTION_PAYLOAD,
    configuredOfferId: OFFER_ID,
    rpc,
  });
  const second = await handleGetCourseAppreciationCallback({
    secretHeader: SECRET,
    expectedSecret: SECRET,
    contentType: "application/json",
    payload: PRODUCTION_PAYLOAD,
    configuredOfferId: OFFER_ID,
    rpc,
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
}

{
  // H — missing / non-numeric offer with exact saved provider-deal correlation
  const namedOffers = parseGetCourseCallback({
    deal: {
      id: "99887766",
      number: "1001",
      offers: "Благодарность автору",
      deal_cost: "100",
      payed_money: "100",
      left_cost_money: "0",
      status: "payed",
    },
  });
  assert.equal(namedOffers.offerId, null);
  assert.deepEqual(namedOffers.offerIds, []);
  assert.equal(namedOffers.offerFieldPresent, true);
  const namedDecision = decideGetCourseCallbackApply({
    callback: namedOffers,
    configuredOfferId: OFFER_ID,
  });
  assert.equal(namedDecision.action, "apply");
  if (namedDecision.action === "apply") {
    assert.equal(namedDecision.usedDealCorrelation, true);
    assert.equal(namedDecision.args.offerId, OFFER_ID);
    assert.equal(namedDecision.args.providerDealId, "99887766");
  }

  const missingOffers = parseGetCourseCallback({
    deal: {
      id: "99887766",
      number: "1001",
      deal_cost: "100",
      payed_money: "100",
      left_cost_money: "0",
      status: "payed",
    },
  });
  assert.equal(missingOffers.offerFieldPresent, false);
  const { result, calls } = await handle({
    payload: {
      deal: {
        id: "99887766",
        number: "1001",
        deal_cost: "100",
        payed_money: "100",
        left_cost_money: "0",
        status: "payed",
      },
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.usedDealCorrelation, true);
  assert.equal(calls[0].p_offer_id, OFFER_ID);
  assert.equal(calls[0].p_provider_deal_id, "99887766");
}

{
  // I — authenticated callback is never silently dropped
  const capture = captureLogs();
  try {
    const { result, calls } = await handle({
      payload: { deal: { offers: OFFER_ID, status: "payed", deal_cost: "100" } },
    });
    assert.equal(result.status, 200);
    assert.equal(result.rpcCalled, false);
    assert.equal(result.ignoredReason, "missing_deal_identifier");
    assert.equal(calls.length, 0);
    assertSafeIgnoreLog(capture.logs, "missing_deal_identifier");
  } finally {
    capture.restore();
  }
}

{
  // List of offer IDs prefers the configured technical offer
  const parsed = parseGetCourseCallback({
    deal: {
      id: "1",
      number: "2",
      offers: `111, ${OFFER_ID}, 222`,
      deal_cost: "100",
      status: "payed",
    },
  });
  assert.deepEqual(parsed.offerIds, ["111", OFFER_ID, "222"]);
  const decision = decideGetCourseCallbackApply({
    callback: parsed,
    configuredOfferId: OFFER_ID,
  });
  assert.equal(decision.action, "apply");
  if (decision.action === "apply") {
    assert.equal(decision.args.offerId, OFFER_ID);
    assert.equal(decision.usedDealCorrelation, false);
  }
}

{
  // Real Process `{object.status}` values that are not the API token `payed`
  const realStatuses = ["Оплачен", "Завершен", "paid", "completed", "payed"];
  for (const status of realStatuses) {
    const payload = {
      deal: {
        id: "99887766",
        number: "1001",
        offers: OFFER_ID,
        deal_cost: "100",
        payed_money: "100",
        left_cost_money: "0",
        status,
      },
    };
    const { result, calls } = await handle({ payload });
    assert.equal(result.status, 200, status);
    assert.equal(result.rpcCalled, true, status);
    assert.equal(result.ignoredReason, null, status);
    assert.equal(calls[0].p_status, "payed", status);
    assert.equal(calls[0].p_amount_minor, 10_000, status);
  }

  const moneyOnly = await handle({
    payload: {
      deal: {
        id: "99887766",
        number: "1001",
        offers: OFFER_ID,
        deal_cost: "100",
        payed_money: "100",
        left_cost_money: "0",
        status: "неизвестный-статус",
      },
    },
  });
  assert.equal(moneyOnly.result.rpcCalled, true);
  assert.equal(moneyOnly.calls[0].p_status, "payed");

  const unpaid = await handle({
    payload: {
      deal: {
        ...PRODUCTION_PAYLOAD.deal,
        status: "new",
        payed_money: "0",
        left_cost_money: "100",
      },
    },
  });
  assert.equal(unpaid.result.rpcCalled, false);
  assert.equal(unpaid.result.ignoredReason, "status_not_payed");

  const voided = await handle({
    payload: {
      deal: {
        ...PRODUCTION_PAYLOAD.deal,
        status: "cancelled",
        payed_money: "100",
        left_cost_money: "0",
      },
    },
  });
  assert.equal(voided.result.rpcCalled, false);
  assert.equal(voided.result.ignoredReason, "status_not_payed");
}

{
  assert.equal(authorShareMinor(10_000, 7000), 7_000);
  assert.equal(platformShareMinor(10_000, 7000), 3_000);
  assert.equal(
    isProviderConfirmedFullyPaid({
      status: "Завершен",
      amountMinor: 10_000,
      payedMoneyMinor: 10_000,
      leftCostMoneyMinor: 0,
    }),
    true,
  );
}

{
  // Applied + needs_review observability (no PII)
  const capture = captureLogs();
  try {
    const { result } = await handle({ rpcOutcome: "paid_needs_review" });
    assert.equal(result.rpcCalled, true);
    assert.equal(result.rpcOutcome, "paid_needs_review");
    const labels = capture.logs.map((row) => row.label);
    assert.ok(labels.includes("author_appreciation_getcourse_callback_applied"));
    assert.ok(labels.includes("author_appreciation_finance_projection_needs_review"));
    assert.doesNotMatch(JSON.stringify(capture.logs), /callback-secret/);
  } finally {
    capture.restore();
  }
}

console.log("author-appreciation-getcourse-callback-unit: ok");
