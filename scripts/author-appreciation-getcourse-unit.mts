#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createGetCourseAppreciationDeal,
} from "../src/lib/author-appreciation/getcourse/provider";
import {
  getAuthorAppreciationRolloutConfig,
  isAuthorAppreciationRolloutEnabled,
} from "../src/lib/author-appreciation/config";
import { parseGetCourseCallback } from "../src/app/api/webhooks/getcourse/author-appreciation/route";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const config = {
  accountName: "example",
  apiKey: "secret-not-logged",
  appreciationOfferId: "offer-1",
};
const dealInput = {
  email: "listener@example.test",
  amountMinor: 50_000,
};
let requestUrl = "";
let requestMethod = "";
let requestBody = "";
const deal = await createGetCourseAppreciationDeal(
  config,
  dealInput,
  async (input, init) => {
    requestUrl = String(input);
    requestMethod = init?.method ?? "";
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      success: true,
      result: {
        success: true,
        deal_id: 42,
        deal_number: 1001,
        payment_link: "https://pay.example.test/1",
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  },
);
assert.equal(deal.dealId, "42");
assert.equal(deal.dealNumber, "1001");
assert.equal(deal.paymentLink, "https://pay.example.test/1");
assert.match(deal.paymentLink, /^https:\/\//);
assert.equal(requestMethod, "POST");
assert.match(requestUrl, /^https:\/\/example\.getcourse\.ru\/pl\/api\/deals$/);
const form = new URLSearchParams(requestBody);
assert.equal(form.get("action"), "add");
assert.equal(form.get("key"), config.apiKey);
const params = JSON.parse(Buffer.from(form.get("params")!, "base64").toString("utf8"));
assert.deepEqual(params.user, { email: "listener@example.test" });
assert.equal(params.system.return_payment_link, 1);
assert.equal(params.system.return_deal_number, 1);
assert.equal(params.deal.offer_id, config.appreciationOfferId);
assert.equal(params.deal.deal_cost, 500);
assert.equal(Object.prototype.hasOwnProperty.call(params.deal, "deal_number"), false);
assert.equal(Object.prototype.hasOwnProperty.call(params, "deal_number"), false);
assert.doesNotMatch(JSON.stringify(params), /aa-/);
assert.doesNotMatch(JSON.stringify(params), /localDealNumber|local_deal_number/);
await assert.rejects(
  () => createGetCourseAppreciationDeal(config, { email: "x@y.z", amountMinor: 101 }),
  /whole_rubles/,
);

{
  const httpDeal = await createGetCourseAppreciationDeal(
    config,
    dealInput,
    async () => new Response(JSON.stringify({
      success: true,
      result: {
        success: true,
        deal_id: "deal-1",
        deal_number: "provider-1",
        payment_link: "http://pay.example.test/insecure",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  ).catch((error: unknown) => error);
  assert.ok(httpDeal instanceof Error);
  assert.match(httpDeal.message, /payment_link_invalid/);
}

type ProviderLog = { label: unknown; details: Record<string, unknown> };

async function captureProviderFailure(
  fetchImpl: typeof fetch,
  expected: RegExp,
): Promise<ProviderLog[]> {
  const logs: ProviderLog[] = [];
  const originalError = console.error;
  console.error = (label: unknown, details?: unknown) => {
    logs.push({
      label,
      details: details && typeof details === "object" ? details as Record<string, unknown> : {},
    });
  };
  try {
    await assert.rejects(
      () => createGetCourseAppreciationDeal(config, dealInput, fetchImpl),
      expected,
    );
  } finally {
    console.error = originalError;
  }
  return logs;
}

function assertSafeProviderLog(logs: ProviderLog[], reason: string, httpStatus: number) {
  assert.equal(logs.length, 1);
  assert.equal(logs[0].label, "author_appreciation_getcourse_deal_failed");
  assert.equal(logs[0].details.reason, reason);
  assert.equal(logs[0].details.http_status, httpStatus);
  const serialized = JSON.stringify(logs);
  assert.doesNotMatch(serialized, /secret-not-logged/);
  assert.doesNotMatch(serialized, /listener@example\.test/);
  assert.doesNotMatch(serialized, /https:\/\/pay\.example\.test/);
  assert.equal(Object.prototype.hasOwnProperty.call(logs[0].details, "params"), false);
}

{
  const logs = await captureProviderFailure(
    async () => new Response(JSON.stringify({
      success: false,
      result: { error_message: "upstream denied" },
    }), { status: 503, headers: { "content-type": "application/json" } }),
    /request_failed/,
  );
  assertSafeProviderLog(logs, "http_error", 503);
  assert.equal(logs[0].details.error_message, "upstream denied");
}

{
  const logs = await captureProviderFailure(
    async () => new Response(JSON.stringify({
      success: true,
      result: {
        success: false,
        error: true,
        error_message: "Offer missing for listener@example.test see https://pay.example.test/hidden",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
    /logical_error/,
  );
  assertSafeProviderLog(logs, "logical_error", 200);
  assert.equal(logs[0].details.top_success, true);
  assert.equal(logs[0].details.result_success, false);
  assert.equal(logs[0].details.error_flag, true);
  assert.equal(
    logs[0].details.error_message,
    "Offer missing for [redacted-email] see [redacted-url]",
  );
  assert.equal(logs[0].details.payment_link_present, false);
}

{
  const logs = await captureProviderFailure(
    async () => new Response(JSON.stringify({
      success: true,
      result: {
        success: false,
        error: true,
        error_message: "№ должен быть целым числом.",
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
    /logical_error/,
  );
  assertSafeProviderLog(logs, "logical_error", 200);
  assert.equal(logs[0].details.top_success, true);
  assert.equal(logs[0].details.result_success, false);
  assert.equal(logs[0].details.error_flag, true);
  assert.equal(logs[0].details.error_message, "№ должен быть целым числом.");
  assert.equal(logs[0].details.deal_id_present, false);
  assert.equal(logs[0].details.payment_link_present, false);
}

{
  const logs = await captureProviderFailure(
    async () => new Response(JSON.stringify({
      result: { deal_id: "deal-1" },
    }), { status: 200, headers: { "content-type": "application/json" } }),
    /response_incomplete/,
  );
  assertSafeProviderLog(logs, "response_incomplete", 200);
  assert.equal(logs[0].details.deal_id_present, true);
  assert.equal(logs[0].details.payment_link_present, false);
}

{
  const logs = await captureProviderFailure(
    async () => new Response("not-json", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
    /response_invalid/,
  );
  assertSafeProviderLog(logs, "response_invalid", 200);
}

assert.deepEqual(
  parseGetCourseCallback({
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
  }),
  {
    dealId: "42",
    dealNumber: "1001",
    offerId: "offer-1",
    offerIds: ["offer-1"],
    amountMinor: 50_000,
    status: "payed",
    payedMoneyMinor: 50_000,
    leftCostMoneyMinor: 0,
  },
);
assert.equal(parseGetCourseCallback({ deal_id: "x", amount: "500.50" }).amountMinor, null);
assert.equal(
  parseGetCourseCallback({ deal: { id: 99, number: "aa-11111111-1111-4111-8111-111111111111" } }).dealNumber,
  "aa-11111111-1111-4111-8111-111111111111",
);
assert.notEqual(
  parseGetCourseCallback({ deal: { id: 99, number: 1001 } }).dealNumber,
  "aa-11111111-1111-4111-8111-111111111111",
);

process.env.AUTHOR_APPRECIATION_GETCOURSE_ROLLOUT_ENABLED = "1";
process.env.AUTHOR_APPRECIATION_GETCOURSE_AUTHOR_ALLOWLIST = "11111111-1111-4111-8111-111111111111";
const rollout = getAuthorAppreciationRolloutConfig();
assert.equal(isAuthorAppreciationRolloutEnabled(rollout), true);
assert.equal(
  isAuthorAppreciationRolloutEnabled({ ...rollout, enabled: false }),
  false,
);
assert.ok(
  rollout.allowedAuthorIds.has("11111111-1111-4111-8111-111111111111"),
  "allowlist is still parsed",
);
assert.equal(
  isAuthorAppreciationRolloutEnabled(rollout),
  true,
  "UUID absent from the old allowlist is still enabled when the kill switch is on",
);

const migration = read("supabase/migrations/20260916120000_author_appreciation_getcourse_intents.sql");
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.author_appreciation_payment_intents/);
assert.match(migration, /author_id uuid NOT NULL REFERENCES public\.authors/);
assert.match(migration, /user_id uuid NULL REFERENCES auth\.users/);
assert.match(migration, /CHECK \(status IN \('pending', 'paid', 'needs_review', 'failed'\)\)/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /GRANT ALL ON TABLE public\.author_appreciation_payment_intents TO service_role/);
assert.match(migration, /apply_author_appreciation_getcourse_callback/);
assert.match(migration, /local_deal_number text NOT NULL UNIQUE/);
assert.match(migration, /provider_deal_id = p_provider_deal_id/);
assert.match(migration, /provider_deal_number = p_provider_deal_number/);
assert.match(migration, /IF v_count = 0 THEN[\s\S]*?RETURN QUERY SELECT 'unknown'::text, NULL::uuid;/);
assert.match(migration, /IF v_intent\.status = 'paid' THEN[\s\S]*?RETURN QUERY SELECT 'already_paid'::text, v_intent\.id;/);
assert.doesNotMatch(
  migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_author_appreciation_getcourse_callback")),
  /INSERT INTO public\.author_appreciation_payment_intents/,
);
assert.doesNotMatch(migration, /\b(?:INSERT INTO|UPDATE|ALTER TABLE)\s+public\.(?:orders|payments|user_practices|finance_)/i);

const checkout = read("src/app/api/author-appreciation/checkout/route.ts");
assert.match(checkout, /isAllowedSupportRequestOrigin/);
assert.match(checkout, /idempotency_key_required/);
assert.match(checkout, /from\("author_appreciation_payment_intents"\)[\s\S]{0,80}\.insert/);
assert.ok(
  checkout.indexOf("const { error: insertError }") <
    checkout.indexOf("deal = await createGetCourseAppreciationDeal"),
);
assert.ok(
  checkout.indexOf("deal = await createGetCourseAppreciationDeal") <
    checkout.indexOf("provider_deal_id: deal.dealId"),
);
assert.ok(
  checkout.indexOf("provider_deal_id: deal.dealId") <
    checkout.indexOf("payment_link: deal.paymentLink"),
);
assert.ok(
  checkout.indexOf("provider_deal_number: deal.dealNumber") <
    checkout.indexOf("payment_link: deal.paymentLink"),
);
assert.match(checkout, /author_appreciation_checkout_provider_failed/);
assert.match(checkout, /if \(user\?\.email\)/);
assert.match(checkout, /email = user\.email/);
assert.match(checkout, /localDealNumber = `aa-\$\{intentId\}`/);
assert.match(checkout, /local_deal_number: localDealNumber/);
assert.match(checkout, /return error\("checkout_unavailable", 502\)/);
{
  const providerCallStart = checkout.indexOf("createGetCourseAppreciationDeal(getCourseConfig");
  const providerCallEnd = checkout.indexOf("});", providerCallStart);
  const providerCall = checkout.slice(providerCallStart, providerCallEnd);
  assert.match(providerCall, /email/);
  assert.match(providerCall, /amountMinor/);
  assert.doesNotMatch(providerCall, /localDealNumber/);
  assert.doesNotMatch(providerCall, /local_deal_number/);
  assert.doesNotMatch(providerCall, /deal_number/);
}
assert.doesNotMatch(checkout, /@\/lib\/payments|@\/lib\/author-finance|from\("(?:orders|payments|user_practices)"\)/);
assert.match(checkout, /hasAcceptedCurrentAppreciationTerms/);
assert.match(checkout, /isAuthorAppreciationRolloutEnabled\(rollout\)/);
assert.doesNotMatch(checkout, /allowedAuthorIds|AUTHOR_ALLOWLIST/);

const webhook = read("src/app/api/webhooks/getcourse/author-appreciation/route.ts");
assert.match(webhook, /timingSafeEqual/);
assert.match(webhook, /callback\.status !== "payed"/);
assert.match(webhook, /x-audiolad-getcourse-secret/);
assert.match(webhook, /apply_author_appreciation_getcourse_callback/);
assert.match(webhook, /p_provider_deal_id: callback\.dealId/);
assert.match(webhook, /p_provider_deal_number: callback\.dealNumber/);
assert.doesNotMatch(webhook, /local_deal_number|localDealNumber|aa-\$/);
assert.doesNotMatch(webhook, /@\/lib\/payments|@\/lib\/author-finance/);

const provider = read("src/lib/author-appreciation/getcourse/provider.ts");
assert.match(provider, /return_deal_number: 1/);
assert.match(provider, /return_payment_link: 1/);
assert.doesNotMatch(provider, /deal_number:\s*input\./);
assert.doesNotMatch(provider, /localDealNumber/);

for (const page of [
  "src/app/(platform)/(listener)/authors/[slug]/page.tsx",
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
]) {
  const source = read(page);
  assert.match(source, /author_appreciation_preview/);
  assert.match(source, /getAuthorAppreciationRolloutConfig/);
  assert.match(source, /isAuthorAppreciationRolloutEnabled\(rollout\)/);
  assert.match(source, /resolveAuthorAppreciationVisibility/);
  assert.match(source, /hasAcceptedCurrentAppreciationTerms/);
  assert.match(source, /currentTermsAccepted/);
  assert.doesNotMatch(source, /isAuthorAppreciationPreviewActive/);
  assert.doesNotMatch(source, /allowedAuthorIds|isAuthorAppreciationRolloutEnabled\(rollout,/);
}

const financeMigration = read(
  "supabase/migrations/20260917120000_author_appreciation_finance_projection.sql",
);
assert.match(financeMigration, /ensure_author_appreciation_sale_accrual/);
assert.match(financeMigration, /author_appreciation_intent_id/);
assert.match(financeMigration, /author_share_minor\(v_intent\.amount_minor/);
assert.match(financeMigration, /resolve_author_commercial_terms/);
assert.doesNotMatch(financeMigration, /\b(?:INSERT INTO|UPDATE)\s+public\.(?:orders|payments|user_practices)\b/i);

console.log("author-appreciation-getcourse-unit: ok");
