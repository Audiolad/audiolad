#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  coveringExportDateWindow,
  GETCOURSE_EXPORT_MAX_POLLS,
  indexExportedDealsById,
  matchIntentToExportedDeal,
  parseExportedGetCourseDeal,
  readExportId,
} from "../src/lib/author-appreciation/getcourse/confirm-deal";
import {
  reconcilePendingGetCourseAppreciationIntents,
  resetGetCourseAppreciationReconcileForTests,
  RECONCILE_MIN_INTERVAL_MS,
  type PendingAppreciationIntent,
  type ReconcileCooldownStore,
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

function memoryCooldown(initial = 0): ReconcileCooldownStore {
  let last = initial;
  return {
    readLastStartedAt: () => last,
    writeLastStartedAt: (ms: number) => {
      last = ms;
    },
  };
}

function paidRow(dealId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: dealId,
    number: 1001,
    status: "payed",
    deal_cost: "100",
    payed_money: "100",
    left_cost_money: "0",
    offers: OFFER_ID,
    ...overrides,
  };
}

function createExportFetch(options: {
  rows?: unknown[];
  readyAfter?: number;
  dealsError?: boolean;
}) {
  let dealsCalls = 0;
  let exportCalls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const href = String(input);
    if (href.includes("/pl/api/account/deals")) {
      dealsCalls += 1;
      if (options.dealsError) {
        return new Response("nope", { status: 500 });
      }
      return Response.json({ success: true, export_id: 77 });
    }
    if (href.includes("/pl/api/account/exports/")) {
      exportCalls += 1;
      if ((options.readyAfter ?? 1) > exportCalls) {
        return Response.json({ status: "pending" });
      }
      return Response.json({
        status: "finished",
        info: options.rows ?? [paidRow(DEAL_ID)],
      });
    }
    throw new Error(`unexpected_url:${href}`);
  };
  return {
    fetchImpl,
    counts: () => ({ dealsCalls, exportCalls }),
  };
}

async function run(options: {
  pending?: PendingAppreciationIntent[];
  fetch?: ReturnType<typeof createExportFetch>;
  applyError?: boolean;
  force?: boolean;
  cooldown?: ReconcileCooldownStore;
  now?: Date;
}) {
  resetGetCourseAppreciationReconcileForTests();
  const applyCalls: Array<Record<string, unknown>> = [];
  const fetch = options.fetch ?? createExportFetch({});
  const result = await reconcilePendingGetCourseAppreciationIntents({
    force: options.force ?? true,
    config,
    listPending: async () => options.pending ?? [pendingIntent()],
    fetchImpl: fetch.fetchImpl,
    exportOptions: { pollMs: 0 },
    cooldown: options.cooldown ?? memoryCooldown(),
    now: options.now,
    applyCallback: async (args) => {
      applyCalls.push(args);
      return {
        error: options.applyError ? { message: "rpc" } : null,
        data: [{ outcome: applyCalls.length === 1 ? "paid" : "already_paid" }],
      };
    },
  });
  return { result, applyCalls, fetch };
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
  const window = coveringExportDateWindow(
    ["2026-09-01T10:00:00.000Z", "2026-09-03T08:40:00.000Z"],
    new Date("2026-09-03T12:00:00.000Z"),
  );
  assert.equal(window.from, "2026-08-31");
  assert.equal(window.to, "2026-09-04");
  const index = indexExportedDealsById([parsed!]);
  const matched = matchIntentToExportedDeal({
    deal: index.get(DEAL_ID),
    configuredOfferId: OFFER_ID,
    amountMinor: 10_000,
  });
  assert.equal(matched.matched, true);
}

{
  // A: 20 pending → one export, not 20
  const pending = Array.from({ length: 20 }, (_, index) =>
    pendingIntent({
      id: `intent-${index}`,
      provider_deal_id: String(1000 + index),
    }),
  );
  const rows = pending.map((intent) => paidRow(intent.provider_deal_id!));
  const fetch = createExportFetch({ rows });
  const { result, applyCalls } = await run({ pending, fetch });
  assert.equal(result.exports, 1);
  assert.equal(fetch.counts().dealsCalls, 1);
  assert.ok(fetch.counts().exportCalls <= GETCOURSE_EXPORT_MAX_POLLS);
  assert.equal(result.applied, 20);
  assert.equal(applyCalls.length, 20);
}

{
  // B: one export recovers several matching IDs
  const pending = [
    pendingIntent({ id: "a", provider_deal_id: "11" }),
    pendingIntent({ id: "b", provider_deal_id: "22" }),
    pendingIntent({ id: "c", provider_deal_id: "33" }),
  ];
  const fetch = createExportFetch({
    rows: [paidRow("11"), paidRow("22"), paidRow("33"), paidRow("999999")],
  });
  const { result, applyCalls } = await run({ pending, fetch });
  assert.equal(result.exports, 1);
  assert.equal(fetch.counts().dealsCalls, 1);
  assert.equal(result.applied, 3);
  assert.deepEqual(
    applyCalls.map((call) => call.providerDealId),
    ["11", "22", "33"],
  );
}

{
  // C: bounded polls
  const fetch = createExportFetch({ readyAfter: GETCOURSE_EXPORT_MAX_POLLS });
  const { result } = await run({ fetch });
  assert.equal(result.exports, 1);
  assert.equal(fetch.counts().dealsCalls, 1);
  assert.equal(fetch.counts().exportCalls, GETCOURSE_EXPORT_MAX_POLLS);
  assert.ok(result.polls <= GETCOURSE_EXPORT_MAX_POLLS);
}

{
  // D: cooldown skips Export API
  const cooldown = memoryCooldown();
  const firstFetch = createExportFetch({});
  const first = await run({ fetch: firstFetch, cooldown, force: true });
  assert.equal(first.result.exports, 1);
  const secondFetch = createExportFetch({});
  resetGetCourseAppreciationReconcileForTests();
  const second = await reconcilePendingGetCourseAppreciationIntents({
    force: false,
    config,
    listPending: async () => [pendingIntent()],
    fetchImpl: secondFetch.fetchImpl,
    exportOptions: { pollMs: 0 },
    cooldown,
    now: new Date(Date.now() + 1_000),
    applyCallback: async () => ({ error: null, data: [{ outcome: "paid" }] }),
  });
  assert.equal(second.deferred, true);
  assert.equal(second.exports, 0);
  assert.equal(secondFetch.counts().dealsCalls, 0);
  assert.equal(secondFetch.counts().exportCalls, 0);
  assert.ok(RECONCILE_MIN_INTERVAL_MS >= 30 * 60 * 1000);
  assert.ok(RECONCILE_MIN_INTERVAL_MS <= 60 * 60 * 1000);
}

{
  // E / F: successful webhook and checkout must not start Export recovery
  const webhook = readFileSync(
    "src/app/api/webhooks/getcourse/author-appreciation/route.ts",
    "utf8",
  );
  const checkout = readFileSync(
    "src/app/api/author-appreciation/checkout/route.ts",
    "utf8",
  );
  const reconcile = readFileSync(
    "src/lib/author-appreciation/getcourse/reconcile.ts",
    "utf8",
  );
  assert.doesNotMatch(webhook, /scheduleGetCourseAppreciationReconcile|reconcilePendingGetCourseAppreciationIntents|exportPaidGetCourseDealsOnce/);
  assert.doesNotMatch(checkout, /scheduleGetCourseAppreciationReconcile|reconcilePendingGetCourseAppreciationIntents|exportPaidGetCourseDealsOnce/);
  assert.doesNotMatch(reconcile, /scheduleGetCourseAppreciationReconcile/);
  assert.doesNotMatch(reconcile, /confirmGetCourseDealPayment/);
}

{
  // G: scheduled recovery of old paid pending → RPC → one accrual
  const { result, applyCalls } = await run({});
  assert.equal(result.applied, 1);
  assert.equal(result.exports, 1);
  assert.equal(result.provider_error, false);
  assert.equal(applyCalls.length, 1);
  assert.equal(applyCalls[0].providerDealId, DEAL_ID);
  assert.equal(applyCalls[0].offerId, OFFER_ID);
  assert.equal(applyCalls[0].amountMinor, 10_000);
  assert.equal(applyCalls[0].status, "payed");
}

{
  // H: second run no duplicate logical accrual (already_paid)
  const first = await run({});
  const second = await run({});
  assert.equal(first.applyCalls.length, 1);
  assert.equal(second.applyCalls.length, 1);
}

{
  // I: unpaid stays pending
  const fetch = createExportFetch({
    rows: [paidRow(DEAL_ID, { status: "new", payed_money: "0", left_cost_money: "100" })],
  });
  const { result, applyCalls } = await run({ fetch });
  assert.equal(result.applied, 0);
  assert.equal(applyCalls.length, 0);
}

{
  // J: wrong amount / offer — no paid
  const amountFetch = createExportFetch({
    rows: [paidRow(DEAL_ID, { deal_cost: "500", payed_money: "500" })],
  });
  const amount = await run({ fetch: amountFetch });
  assert.equal(amount.result.applied, 0);
  assert.equal(amount.applyCalls.length, 0);

  const offerFetch = createExportFetch({
    rows: [paidRow(DEAL_ID, { offers: "999" })],
  });
  const offer = await run({ fetch: offerFetch });
  assert.equal(offer.result.applied, 0);
  assert.equal(offer.applyCalls.length, 0);

  const localOffer = await run({
    pending: [pendingIntent({ provider_metadata: { offer_id: "other-offer" } })],
  });
  assert.equal(localOffer.result.applied, 0);
  assert.equal(localOffer.applyCalls.length, 0);
}

{
  // K: provider error stays pending
  const fetch = createExportFetch({ dealsError: true });
  const { result, applyCalls } = await run({ fetch });
  assert.equal(result.applied, 0);
  assert.equal(result.provider_error, true);
  assert.equal(applyCalls.length, 0);
}

{
  const empty = await run({ pending: [] });
  assert.equal(empty.result.attempted, 0);
  assert.equal(empty.result.exports, 0);
  assert.equal(empty.applyCalls.length, 0);

  const failed = await run({
    pending: [pendingIntent({ status: "failed", id: "failed-1" })],
  });
  assert.equal(failed.result.applied, 0);
}

{
  // Localized / official-display export status still matches a payed export row
  const localized = parseExportedGetCourseDeal({
    id: DEAL_ID,
    number: 1001,
    status: "Завершен",
    deal_cost: "100",
    payed_money: "100",
    left_cost_money: "0",
    offers: OFFER_ID,
  });
  assert.ok(localized);
  const localizedMatch = matchIntentToExportedDeal({
    deal: localized,
    configuredOfferId: OFFER_ID,
    amountMinor: 10_000,
  });
  assert.equal(localizedMatch.matched, true);

  const fetch = createExportFetch({
    rows: [paidRow(DEAL_ID, { status: "Оплачен" })],
  });
  const recovered = await run({ fetch });
  assert.equal(recovered.result.applied, 1);
  assert.equal(recovered.applyCalls[0].status, "payed");
}

{
  const confirm = readFileSync("src/lib/author-appreciation/getcourse/confirm-deal.ts", "utf8");
  assert.match(confirm, /\/pl\/api\/account\/deals/);
  assert.match(confirm, /set\("status", "payed"\)/);
  assert.doesNotMatch(confirm, /confirmGetCourseDealPayment/);
  assert.doesNotMatch(confirm, /action=add/);
  const provider = readFileSync("src/lib/author-appreciation/getcourse/provider.ts", "utf8");
  assert.match(provider, /return_deal_number: 1/);
  assert.match(provider, /return_payment_link: 1/);
  assert.doesNotMatch(provider, /deal_number:\s*input\./);

  const deploy = readFileSync("deploy/scripts/deploy.sh", "utf8");
  assert.match(deploy, /ensure-author-appreciation-getcourse-reconcile\.sh/);
  assert.match(deploy, /DEPLOY_TREE="\$RELEASE_DIR\/deploy"/);
  const pin = readFileSync("deploy/scripts/lib/pin-target-deploy-scripts.sh", "utf8");
  assert.match(pin, /deploy\/scripts deploy\/systemd deploy\/logrotate/);
  const launcher = readFileSync("deploy/scripts/run-from-target-sha.sh", "utf8");
  assert.match(launcher, /deploy\/scripts deploy\/systemd deploy\/logrotate/);
  const ensure = readFileSync(
    "deploy/scripts/ensure-author-appreciation-getcourse-reconcile.sh",
    "utf8",
  );
  assert.match(ensure, /DEPLOY_TREE:-/);
  const timer = readFileSync(
    "deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer",
    "utf8",
  );
  assert.match(timer, /OnUnitActiveSec=45min/);
  const pkg = readFileSync("package.json", "utf8");
  assert.match(pkg, /run:author-appreciation-getcourse-reconcile/);
}

console.log("author-appreciation-getcourse-reconcile-unit: ok");
