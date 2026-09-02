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
let requestUrl = "";
let requestMethod = "";
let requestBody = "";
const deal = await createGetCourseAppreciationDeal(
  config,
  { email: "listener@example.test", amountMinor: 50_000, localDealNumber: "aa-test" },
  async (input, init) => {
    requestUrl = String(input);
    requestMethod = init?.method ?? "";
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      result: { deal_id: "deal-1", deal_number: "provider-1", payment_link: "https://pay.example.test/1" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  },
);
assert.equal(deal.dealId, "deal-1");
assert.equal(deal.dealNumber, "provider-1");
assert.equal(deal.paymentLink, "https://pay.example.test/1");
assert.equal(requestMethod, "POST");
assert.match(requestUrl, /^https:\/\/example\.getcourse\.ru\/pl\/api\/deals$/);
const form = new URLSearchParams(requestBody);
assert.equal(form.get("action"), "add");
assert.equal(form.get("key"), config.apiKey);
const params = JSON.parse(Buffer.from(form.get("params")!, "base64").toString("utf8"));
assert.deepEqual(params.user, { email: "listener@example.test" });
assert.equal(params.system.return_payment_link, 1);
assert.equal(params.system.return_deal_number, 1);
assert.equal(params.deal.deal_cost, 500);
await assert.rejects(
  () => createGetCourseAppreciationDeal(config, { email: "x@y.z", amountMinor: 101, localDealNumber: "x" }),
  /whole_rubles/,
);

assert.deepEqual(
  parseGetCourseCallback({ data: { deal: { id: 42, number: "aa-test", offer_ids: ["offer-1"], deal_cost: "500", status: "payed", payed_money: "500", left_cost_money: "0" } } }),
  { dealId: "42", dealNumber: "aa-test", offerId: "offer-1", offerIds: ["offer-1"], amountMinor: 50_000, status: "payed", payedMoneyMinor: 50_000, leftCostMoneyMinor: 0 },
);
assert.equal(parseGetCourseCallback({ deal_id: "x", amount: "500.50" }).amountMinor, null);

process.env.AUTHOR_APPRECIATION_GETCOURSE_ROLLOUT_ENABLED = "1";
process.env.AUTHOR_APPRECIATION_GETCOURSE_AUTHOR_ALLOWLIST = "11111111-1111-4111-8111-111111111111";
const rollout = getAuthorAppreciationRolloutConfig();
assert.equal(isAuthorAppreciationRolloutEnabled(rollout, "11111111-1111-4111-8111-111111111111"), true);
assert.equal(isAuthorAppreciationRolloutEnabled(rollout, "22222222-2222-4222-8222-222222222222"), false);
assert.equal(
  isAuthorAppreciationRolloutEnabled(
    { ...rollout, enabled: false },
    "11111111-1111-4111-8111-111111111111",
  ),
  false,
);

const migration = read("supabase/migrations/20260916120000_author_appreciation_getcourse_intents.sql");
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.author_appreciation_payment_intents/);
assert.match(migration, /author_id uuid NOT NULL REFERENCES public\.authors/);
assert.match(migration, /user_id uuid NULL REFERENCES auth\.users/);
assert.match(migration, /CHECK \(status IN \('pending', 'paid', 'needs_review', 'failed'\)\)/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /GRANT ALL ON TABLE public\.author_appreciation_payment_intents TO service_role/);
assert.match(migration, /apply_author_appreciation_getcourse_callback/);
assert.doesNotMatch(migration, /\b(?:INSERT INTO|UPDATE|ALTER TABLE)\s+public\.(?:orders|payments|user_practices|finance_)/i);

const checkout = read("src/app/api/author-appreciation/checkout/route.ts");
assert.match(checkout, /isAllowedSupportRequestOrigin/);
assert.match(checkout, /idempotency_key_required/);
assert.match(checkout, /from\("author_appreciation_payment_intents"\)[\s\S]{0,80}\.insert/);
assert.ok(
  checkout.indexOf("const { error: insertError }") <
    checkout.indexOf("deal = await createGetCourseAppreciationDeal"),
);
assert.doesNotMatch(checkout, /@\/lib\/payments|@\/lib\/author-finance|from\("(?:orders|payments|user_practices)"\)/);

const webhook = read("src/app/api/webhooks/getcourse/author-appreciation/route.ts");
assert.match(webhook, /timingSafeEqual/);
assert.match(webhook, /callback\.status !== "payed"/);
assert.match(webhook, /x-audiolad-getcourse-secret/);
assert.match(webhook, /apply_author_appreciation_getcourse_callback/);
assert.doesNotMatch(webhook, /@\/lib\/payments|@\/lib\/author-finance/);

for (const page of [
  "src/app/(platform)/(listener)/authors/[slug]/page.tsx",
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
]) {
  const source = read(page);
  assert.match(source, /author_appreciation_preview/);
  assert.match(source, /getAuthorAppreciationRolloutConfig/);
  assert.match(source, /isAuthorAppreciationRolloutEnabled/);
  assert.match(source, /resolveAuthorAppreciationVisibility/);
}

console.log("author-appreciation-getcourse-unit: ok");
