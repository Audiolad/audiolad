#!/usr/bin/env npx tsx
import assert from "node:assert/strict";

import {
  matchExportedDeal,
  parseExportedGetCourseDeal,
  readExportId,
} from "../src/lib/author-appreciation/getcourse/confirm-deal";
import {
  reconcilePendingGetCourseAppreciationIntents,
  resetGetCourseAppreciationReconcileForTests,
  type PendingAppreciationIntent,
} from "../src/lib/author-appreciation/getcourse/reconcile";

const OFFER_ID = "3875235";
const DEAL_ID = "99887766";
const config = {
  accountName: "example",
  apiKey: "secret-not-logged",
  appreciationOfferId: OFFER_ID,
};

function pendingIntent(overrides: Partial<PendingAppreciationIntent> = {}): PendingAppreciationIntent {
  return {
    id: "803348fb-59af-49bc-8127-c491b2e9c360",
    amount_minor: 10_000,
    provider_deal_id: DEAL_ID,
    provider_deal_number: "1001",
    provider_metadata: { offer_id: OFFER_ID },
    created_at: "2026-09-03T08:40:00.000Z",
    status: "pending",
    ...overrides,
  };
}

type ConfirmResult = {
  confirmed: true;
  deal: {
    dealId: string;
    dealNumber: string | null;
    status: string | null;
    amountMinor: number | null;
    payedMoneyMinor: number | null;
    leftCostMoneyMinor: number | null;
    offerIds: string[];
  };
} | {
  confirmed: false;
  reason: "provider_error" | "not_found" | "unpaid" | "ambiguous";
};

async function run(options: {
  pending?: PendingAppreciationIntent[];
  confirmResult?: ConfirmResult;
  applyError?: boolean;
}) {
  resetGetCourseAppreciationReconcileForTests();
  const applyCalls: Array<Record<string, unknown>> = [];
  const confirmCalls: Array<{ dealId: string }> = [];
  const result = await reconcilePendingGetCourseAppreciationIntents({
    force: true,
    config,
    listPending: async () => options.pending ?? [pendingIntent()],
    confirmDeal: async (_cfg, input) => {
      confirmCalls.push({ dealId: input.dealId });
      return (
        options.confirmResult ?? {
          confirmed: true,
          deal: {
            dealId: DEAL_ID,
            dealNumber: "1001",
            status: "payed",
            amountMinor: 10_000,
            payedMoneyMinor: 10_000,
            leftCostMoneyMinor: 0,
            offerIds: [OFFER_ID],
          },
        }
      );
    },
    applyCallback: async (args) => {
      applyCalls.push(args);
      return {
        error: options.applyError ? { message: "rpc" } : null,
        data: [{ outcome: applyCalls.length === 1 ? "paid" : "already_paid" }],
      };
    },
  });
  return { result, applyCalls, confirmCalls };
}

{
  const parsed = parseExportedGetCourseDeal({
    id: DEAL_ID,
    number: 1001,
    status: "payed",
    deal_cost: "100",
    payed_money: "100",
    left_cost_money: "0",
    offers: OFFER_ID,
  });
  assert.equal(parsed?.dealId, DEAL_ID);
  assert.equal(parsed?.amountMinor, 10_000);
  assert.deepEqual(parsed?.offerIds, [OFFER_ID]);
  assert.equal(readExportId({ success: true, export_id: 55 }), "55");
  const matched = matchExportedDeal(
    [{ id: DEAL_ID, status: "payed", deal_cost: "100" }],
    DEAL_ID,
  );
  assert.equal(matched.confirmed, true);
}

{
  // pending + provider payed → paid via canonical RPC, one apply
  const { result, applyCalls } = await run({});
  assert.equal(result.applied, 1);
  assert.equal(result.provider_error, false);
  assert.equal(applyCalls.length, 1);
  assert.equal(applyCalls[0].providerDealId, DEAL_ID);
  assert.equal(applyCalls[0].offerId, OFFER_ID);
  assert.equal(applyCalls[0].amountMinor, 10_000);
  assert.equal(applyCalls[0].status, "payed");
}

{
  // unpaid stays pending
  const { result, applyCalls } = await run({
    confirmResult: { confirmed: false, reason: "unpaid" },
  });
  assert.equal(result.applied, 0);
  assert.equal(result.skipped, 1);
  assert.equal(applyCalls.length, 0);
}

{
  // wrong amount — no mutation
  const { result, applyCalls } = await run({
    confirmResult: {
      confirmed: true,
      deal: {
        dealId: DEAL_ID,
        dealNumber: "1001",
        status: "payed",
        amountMinor: 50_000,
        payedMoneyMinor: 50_000,
        leftCostMoneyMinor: 0,
        offerIds: [OFFER_ID],
      },
    },
  });
  assert.equal(result.applied, 0);
  assert.equal(applyCalls.length, 0);
}

{
  // unknown deal — no mutation
  const { result, applyCalls } = await run({
    confirmResult: { confirmed: false, reason: "not_found" },
  });
  assert.equal(result.applied, 0);
  assert.equal(applyCalls.length, 0);
}

{
  // repeat is idempotent: second apply still one logical accrual (already_paid)
  const first = await run({});
  const second = await run({});
  assert.equal(first.applyCalls.length, 1);
  assert.equal(second.applyCalls.length, 1);
}

{
  // failed intents are never selected
  const { result, applyCalls, confirmCalls } = await run({
    pending: [pendingIntent({ status: "failed", id: "failed-1" })],
  });
  assert.equal(result.applied, 0);
  assert.equal(applyCalls.length, 0);
  assert.equal(confirmCalls.length, 0);
}

{
  // already projected / non-pending is not selected
  const { result, applyCalls } = await run({
    pending: [],
  });
  assert.equal(result.attempted, 0);
  assert.equal(result.applied, 0);
  assert.equal(applyCalls.length, 0);
}

{
  // provider error — no paid mutation
  const { result, applyCalls } = await run({
    confirmResult: { confirmed: false, reason: "provider_error" },
  });
  assert.equal(result.applied, 0);
  assert.equal(result.provider_error, true);
  assert.equal(applyCalls.length, 0);
}

{
  // offer metadata must match the configured technical offer
  const { result, applyCalls } = await run({
    pending: [pendingIntent({ provider_metadata: { offer_id: "other-offer" } })],
  });
  assert.equal(result.applied, 0);
  assert.equal(applyCalls.length, 0);
}

{
  const provider = await import("node:fs").then((fs) =>
    fs.readFileSync("src/lib/author-appreciation/getcourse/provider.ts", "utf8"),
  );
  assert.match(provider, /return_deal_number: 1/);
  assert.match(provider, /return_payment_link: 1/);
  assert.doesNotMatch(provider, /deal_number:\s*input\./);
  const confirm = await import("node:fs").then((fs) =>
    fs.readFileSync("src/lib/author-appreciation/getcourse/confirm-deal.ts", "utf8"),
  );
  assert.match(confirm, /\/pl\/api\/account\/deals/);
  assert.match(confirm, /status=payed|set\("status", "payed"\)/);
  assert.doesNotMatch(confirm, /action=add/);
}

console.log("author-appreciation-getcourse-reconcile-unit: ok");
