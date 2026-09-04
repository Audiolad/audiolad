#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  collectExportRows,
  coveringExportDateWindow,
  GETCOURSE_EXPORT_MAX_POLLS,
  indexExportedDealsById,
  indexExportedDealsByNumber,
  lookupExportedDealForIntent,
  matchIntentToExportedDeal,
  parseExportedGetCourseDeal,
  readExportId,
  summarizeExportEnvelope,
} from "../src/lib/author-appreciation/getcourse/confirm-deal";
import {
  reconcilePendingGetCourseAppreciationIntents,
  resetGetCourseAppreciationReconcileForTests,
  RECONCILE_MIN_INTERVAL_MS,
  type PendingAppreciationIntent,
  type ReconcileCooldownStore,
} from "../src/lib/author-appreciation/getcourse/reconcile";
import { authorShareMinor, platformShareMinor } from "../src/lib/payments/author-finance/types";

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

function officialExportPayload(rows: Record<string, unknown>[]) {
  const fields = [
    ...new Set(
      rows.flatMap((row) => Object.keys(row)).concat([
        "id",
        "number",
        "status",
        "deal_cost",
        "payed_money",
        "left_cost_money",
        "offers",
      ]),
    ),
  ];
  return {
    success: true,
    status: "finished",
    info: {
      fields,
      items: rows.map((row) => fields.map((field) => row[field] ?? "")),
    },
  };
}

function createExportFetch(options: {
  rows?: unknown[];
  readyAfter?: number;
  dealsError?: boolean;
  officialContainer?: boolean;
  finishedPayload?: unknown;
}) {
  let dealsCalls = 0;
  let exportCalls = 0;
  let lastDealsHref = "";
  const fetchImpl: typeof fetch = async (input) => {
    const href = String(input);
    if (href.includes("/pl/api/account/deals")) {
      dealsCalls += 1;
      lastDealsHref = href;
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
      if (options.finishedPayload !== undefined) {
        return Response.json(options.finishedPayload);
      }
      const rows = (options.rows ?? [paidRow(DEAL_ID)]) as Record<string, unknown>[];
      if (options.officialContainer) {
        return Response.json(officialExportPayload(rows));
      }
      return Response.json({
        status: "finished",
        info: rows,
      });
    }
    throw new Error(`unexpected_url:${href}`);
  };
  return {
    fetchImpl,
    counts: () => ({ dealsCalls, exportCalls }),
    lastDealsHref: () => lastDealsHref,
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
  assert.equal(result.correlatable, 20);
  assert.equal(result.matched, 20);
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
  assert.equal(empty.result.correlatable, 0);
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
  assert.equal(recovered.result.matched, 1);
  assert.equal(recovered.applyCalls[0].status, "payed");
}

{
  const confirm = readFileSync("src/lib/author-appreciation/getcourse/confirm-deal.ts", "utf8");
  assert.match(confirm, /\/pl\/api\/account\/deals/);
  assert.match(confirm, /created_at\[from\]/);
  assert.match(confirm, /created_at\[to\]/);
  assert.doesNotMatch(confirm, /set\("status", "payed"\)/);
  assert.doesNotMatch(confirm, /searchParams\.set\("status"/);
  assert.doesNotMatch(confirm, /confirmGetCourseDealPayment/);
  assert.doesNotMatch(confirm, /action=add/);
  assert.doesNotMatch(confirm, /from\("(?:orders|payments|user_practices)"\)/);
  assert.doesNotMatch(confirm, /INSERT INTO public\.(?:orders|payments|user_practices)/);
  const provider = readFileSync("src/lib/author-appreciation/getcourse/provider.ts", "utf8");
  assert.match(provider, /return_deal_number: 1/);
  assert.match(provider, /return_payment_link: 1/);
  assert.doesNotMatch(provider, /deal_number:\s*input\./);

  const deployScript = readFileSync("deploy/scripts/deploy.sh", "utf8");
  assert.match(deployScript, /ensure-author-appreciation-getcourse-reconcile\.sh/);
  assert.match(deployScript, /DEPLOY_TREE="\$RELEASE_DIR\/deploy"/);
  assert.match(deployScript, /assert_author_appreciation_reconcile_release_tree/);
  assert.match(deployScript, /author_appreciation_getcourse_reconcile_ensure_failed/);
  assert.doesNotMatch(deployScript, /ensure_nonfatal/);
  assert.match(deployScript, /author_appreciation_getcourse_reconcile_log_tail/);
  assert.match(deployScript, /author_appreciation_getcourse_reconcile_summary/);
  const pin = readFileSync("deploy/scripts/lib/pin-target-deploy-scripts.sh", "utf8");
  assert.match(pin, /deploy\/scripts deploy\/systemd deploy\/logrotate/);
  assert.match(pin, /pin_has_reconcile_artifacts/);
  const launcher = readFileSync("deploy/scripts/run-from-target-sha.sh", "utf8");
  assert.match(launcher, /deploy\/scripts deploy\/systemd deploy\/logrotate/);
  assert.match(launcher, /pin_has_reconcile_artifacts/);
  const ensure = readFileSync(
    "deploy/scripts/ensure-author-appreciation-getcourse-reconcile.sh",
    "utf8",
  );
  assert.match(ensure, /DEPLOY_TREE:-/);
  assert.match(ensure, /audiolad-reconcile-diagnose/);
  assert.match(ensure, /immediate reconcile systemd start exit=/);
  assert.match(ensure, /reconcile_summary/);
  assert.match(ensure, /ERROR immediate reconcile start failed/);
  const wrapper = readFileSync(
    "deploy/scripts/run-author-appreciation-getcourse-reconcile.sh",
    "utf8",
  );
  assert.match(wrapper, /APPRECIATION_RECONCILE/);
  assert.match(wrapper, /extract_reconcile_json/);
  const timer = readFileSync(
    "deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer",
    "utf8",
  );
  assert.match(timer, /OnUnitActiveSec=45min/);
  const pkg = readFileSync("package.json", "utf8");
  assert.match(pkg, /run:author-appreciation-getcourse-reconcile/);
}

{
  // Deal-number fallback when Export row id match is missing
  const numberOnly = await run({
    pending: [pendingIntent({ provider_deal_id: null, provider_deal_number: "1001" })],
    fetch: createExportFetch({
      rows: [paidRow("555", { number: "1001" })],
    }),
  });
  assert.equal(numberOnly.result.applied, 1);
  assert.equal(numberOnly.applyCalls[0].providerDealId, "555");
  assert.equal(numberOnly.applyCalls[0].providerDealNumber, "1001");
  assert.equal(numberOnly.applyCalls[0].status, "payed");

  const byNumber = indexExportedDealsByNumber([
    parseExportedGetCourseDeal(paidRow("555", { number: "1001" }))!,
  ]);
  const lookedUp = lookupExportedDealForIntent({
    providerDealId: null,
    providerDealNumber: "1001",
    byId: indexExportedDealsById([]),
    byNumber,
  });
  assert.notEqual(lookedUp, undefined);
  assert.notEqual(lookedUp, "ambiguous");
  if (lookedUp && lookedUp !== "ambiguous") {
    assert.equal(lookedUp.dealId, "555");
  }
}

{
  // Recovery export is created_at-bounded and never sends status=payed
  const fetch = createExportFetch({});
  const { result } = await run({ fetch });
  assert.equal(result.exports, 1);
  assert.equal(fetch.counts().dealsCalls, 1);
  const dealsUrl = new URL(fetch.lastDealsHref());
  assert.equal(dealsUrl.searchParams.get("status"), null);
  assert.ok(dealsUrl.searchParams.get("created_at[from]"));
  assert.ok(dealsUrl.searchParams.get("created_at[to]"));
  assert.doesNotMatch(fetch.lastDealsHref(), /[?&]status=/);
}

{
  // Official GetCourse { info: { fields, items } } container is parsed
  const columnar = officialExportPayload([
    paidRow(DEAL_ID, { status: "in_work", payed_money: "100", left_cost_money: "0" }),
  ]);
  const rows = collectExportRows(columnar);
  assert.equal(rows.length, 1);
  const parsed = parseExportedGetCourseDeal(rows[0]);
  assert.equal(parsed?.dealId, DEAL_ID);
  assert.equal(parsed?.amountMinor, 10_000);
  assert.equal(parsed?.payedMoneyMinor, 10_000);
  const recovered = await run({
    fetch: createExportFetch({
      officialContainer: true,
      rows: [paidRow(DEAL_ID, { status: "new", payed_money: "100", left_cost_money: "0" })],
    }),
  });
  assert.equal(recovered.result.applied, 1);
  assert.equal(recovered.result.matched, 1);
}

{
  // Zero-row envelope distinguishes empty items from an unhandled container
  const emptyOfficial = summarizeExportEnvelope({
    success: true,
    status: "finished",
    info: { fields: ["id", "status"], items: [] },
  });
  assert.deepEqual(emptyOfficial.top_level_keys, ["info", "status", "success"]);
  assert.ok(emptyOfficial.info_keys.includes("fields"));
  assert.ok(emptyOfficial.info_keys.includes("items"));
  assert.ok(emptyOfficial.array_field_names.includes("info.fields"));
  assert.ok(emptyOfficial.array_field_names.includes("info.items"));
  assert.equal(emptyOfficial.array_lengths["info.items"], 0);
  assert.equal(emptyOfficial.provider_status, "finished");
  assert.equal(emptyOfficial.provider_message_present, false);
  assert.equal(collectExportRows({
    success: true,
    status: "finished",
    info: { fields: ["id", "status"], items: [] },
  }).length, 0);

  const unhandled = summarizeExportEnvelope({
    success: true,
    status: "finished",
    result: { deals_blob: { nested: true } },
  });
  assert.ok(unhandled.top_level_keys.includes("result"));
  assert.ok(unhandled.result_keys.includes("deals_blob"));
  assert.equal(unhandled.info_keys.length, 0);
  assert.equal(unhandled.array_field_names.length, 0);
  assert.equal(collectExportRows({
    success: true,
    status: "finished",
    result: { deals_blob: { nested: true } },
  }).length, 0);
}

{
  // Two pending 100 RUB intents outside status=payed recover when money proves payment.
  // Exactly once. 70/30. No name/UUID exceptions in production code.
  const firstId = "803348fb-59af-49bc-8127-c491b2e9c360";
  const secondId = "96c9eb2-a0b0-4f4e-bfd7-7b17c42f7e11";
  const pending = [
    pendingIntent({
      id: firstId,
      provider_deal_id: "11111111",
      provider_deal_number: "2001",
      created_at: "2026-09-03T08:40:00.000Z",
    }),
    pendingIntent({
      id: secondId,
      provider_deal_id: "22222222",
      provider_deal_number: "2002",
      created_at: "2026-09-03T09:10:00.000Z",
    }),
  ];
  const rows = [
    paidRow("11111111", {
      number: "2001",
      status: "new",
      deal_cost: "100",
      payed_money: "100",
      left_cost_money: "0",
    }),
    paidRow("22222222", {
      number: "2002",
      status: "in_work",
      deal_cost: "100",
      payed_money: "100",
      left_cost_money: "0",
    }),
  ];
  const logical = new Map<string, { gross: number; author: number; platform: number }>();
  const applyCalls: Array<Record<string, unknown>> = [];
  const fetch = createExportFetch({ officialContainer: true, rows });
  resetGetCourseAppreciationReconcileForTests();
  const apply = async (args: {
    providerDealId: string | null;
    providerDealNumber: string | null;
    offerId: string;
    amountMinor: number;
    status: string;
    payedMoneyMinor: number | null;
    leftCostMoneyMinor: number | null;
  }) => {
    applyCalls.push(args);
    const key = String(args.providerDealId);
    if (logical.has(key)) {
      return { error: null, data: [{ outcome: "already_paid" }] };
    }
    assert.equal(args.amountMinor, 10_000);
    assert.equal(args.status, "payed");
    logical.set(key, {
      gross: args.amountMinor,
      author: authorShareMinor(args.amountMinor, 7000),
      platform: platformShareMinor(args.amountMinor, 7000),
    });
    return { error: null, data: [{ outcome: "paid" }] };
  };
  const first = await reconcilePendingGetCourseAppreciationIntents({
    force: true,
    config,
    listPending: async () => pending,
    fetchImpl: fetch.fetchImpl,
    exportOptions: { pollMs: 0 },
    cooldown: memoryCooldown(),
    applyCallback: apply,
  });
  assert.equal(first.exports, 1);
  assert.equal(fetch.counts().dealsCalls, 1);
  assert.equal(first.correlatable, 2);
  assert.equal(first.matched, 2);
  assert.equal(first.applied, 2);
  assert.equal(applyCalls.length, 2);
  assert.deepEqual(
    applyCalls.map((call) => call.providerDealId).sort(),
    ["11111111", "22222222"],
  );
  assert.equal(logical.size, 2);
  for (const accrual of logical.values()) {
    assert.equal(accrual.gross, 10_000);
    assert.equal(accrual.author, 7_000);
    assert.equal(accrual.platform, 3_000);
  }
  assert.equal(authorShareMinor(10_000, 7000), 7_000);
  assert.equal(platformShareMinor(10_000, 7000), 3_000);

  const secondFetch = createExportFetch({ officialContainer: true, rows });
  resetGetCourseAppreciationReconcileForTests();
  const second = await reconcilePendingGetCourseAppreciationIntents({
    force: true,
    config,
    listPending: async () => pending,
    fetchImpl: secondFetch.fetchImpl,
    exportOptions: { pollMs: 0 },
    cooldown: memoryCooldown(),
    applyCallback: apply,
  });
  assert.equal(second.applied, 2);
  assert.equal(logical.size, 2);
  assert.equal(applyCalls.length, 4);
  assert.equal(applyCalls.filter((call) => call.providerDealId === "11111111").length, 2);
  assert.equal(applyCalls.filter((call) => call.providerDealId === "22222222").length, 2);

  const confirm = readFileSync("src/lib/author-appreciation/getcourse/confirm-deal.ts", "utf8");
  const reconcile = readFileSync("src/lib/author-appreciation/getcourse/reconcile.ts", "utf8");
  assert.doesNotMatch(confirm, /803348fb-59af-49bc-8127-c491b2e9c360|96c9eb2-a0b0-4f4e-bfd7-7b17c42f7e11|Sergey|Zoya|Сергей|Зоя/);
  assert.doesNotMatch(reconcile, /803348fb-59af-49bc-8127-c491b2e9c360|96c9eb2-a0b0-4f4e-bfd7-7b17c42f7e11|Sergey|Zoya|Сергей|Зоя/);
  assert.doesNotMatch(reconcile, /from\("(?:orders|payments|user_practices)"\)/);
  assert.doesNotMatch(reconcile, /INSERT INTO public\.(?:orders|payments|user_practices)/);
}

{
  // Money-unknown + non-paid status must not promote after the broader export
  const unknownMoney = await run({
    fetch: createExportFetch({
      rows: [paidRow(DEAL_ID, { status: "new", payed_money: "", left_cost_money: "" })],
    }),
  });
  assert.equal(unknownMoney.result.applied, 0);
  assert.equal(unknownMoney.applyCalls.length, 0);

  const partial = await run({
    fetch: createExportFetch({
      rows: [paidRow(DEAL_ID, { status: "part_payed", payed_money: "40", left_cost_money: "60" })],
    }),
  });
  assert.equal(partial.result.applied, 0);
  assert.equal(partial.applyCalls.length, 0);

  const voided = await run({
    fetch: createExportFetch({
      rows: [paidRow(DEAL_ID, { status: "cancelled", payed_money: "100", left_cost_money: "0" })],
    }),
  });
  assert.equal(voided.result.applied, 0);
  assert.equal(voided.applyCalls.length, 0);

  const returned = await run({
    fetch: createExportFetch({
      rows: [paidRow(DEAL_ID, { status: "returned", payed_money: "100", left_cost_money: "0" })],
    }),
  });
  assert.equal(returned.result.applied, 0);
  assert.equal(returned.applyCalls.length, 0);
}

{
  const logs: unknown[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    await run({
      fetch: createExportFetch({
        finishedPayload: {
          success: true,
          status: "finished",
          info: { fields: ["id", "status"], items: [] },
        },
      }),
    });
  } finally {
    console.info = original;
  }
  const observed = logs.find((entry) => Array.isArray(entry) && entry[0] === "author_appreciation_getcourse_export_observed");
  assert.ok(observed);
  const payload = (observed as unknown[])[1] as Record<string, unknown>;
  assert.equal(payload.row_count, 0);
  assert.equal(payload.provider_status, "finished");
  assert.equal(payload.provider_message_present, false);
  assert.ok(Array.isArray(payload.top_level_keys));
  assert.ok(Array.isArray(payload.info_keys));
  assert.ok(Array.isArray(payload.array_field_names));
  assert.equal(typeof payload.array_lengths, "object");
  assert.equal(
    JSON.stringify(payload).includes("@") || JSON.stringify(payload).includes("secret-not-logged"),
    false,
  );
}

console.log("author-appreciation-getcourse-reconcile-unit: ok");
