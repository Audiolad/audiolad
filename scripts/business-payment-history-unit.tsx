// Owner «История оплат» (Sergey t1342u): rows only from the owner's own organization,
// test payments hidden, newest first, Moscow time, partner price struck through.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import BusinessPaymentHistoryList from "../src/components/business-app/profile/BusinessPaymentHistoryList";
import { resolveBusinessInternalPath } from "../src/lib/business-app/host";
import { isBusinessOwnerOnlyPath } from "../src/lib/business-app/cabinet-mode";
import {
  BUSINESS_PAYMENT_HISTORY_EMPTY,
  BUSINESS_PAYMENT_HISTORY_HREF,
  collectBusinessPaymentHistoryRows,
  formatBusinessPaidPeriod,
  presentBusinessPaymentHistory,
  ruVenuesWord,
  type PaymentHistoryOrderRow,
  type PaymentHistoryPeriodRow,
  type PaymentHistoryReader,
  type PaymentHistoryScopeRow,
} from "../src/lib/business-app/payment-history";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ORG = "10000000-0000-4000-8000-000000000001";
const ORG2 = "10000000-0000-4000-8000-000000000002";
const L1 = "20000000-0000-4000-8000-000000000001";
const L2 = "20000000-0000-4000-8000-000000000002";

const scopes: PaymentHistoryScopeRow[] = [
  { order_id: "o-standard", organization_id: ORG, location_ids: [L1], unit_price_minor: 79900, partner_code_id: null },
  { order_id: "o-partner", organization_id: ORG, location_ids: [L1, L2], unit_price_minor: 39900, partner_code_id: "c1" },
  { order_id: "o-test", organization_id: ORG, location_ids: [L1], unit_price_minor: 79900, partner_code_id: null },
  { order_id: "o-refund", organization_id: ORG, location_ids: [L1], unit_price_minor: 79900, partner_code_id: null },
  // The same owner also owns another organization: never mixed in.
  { order_id: "o-other-org", organization_id: ORG2, location_ids: [L1], unit_price_minor: 79900, partner_code_id: null },
  // Another account's organization.
  { order_id: "o-foreign", organization_id: ORG2, location_ids: [L1], unit_price_minor: 79900, partner_code_id: null },
];
const period = (order_id: string, user_id: string, applied_at: string, amount_minor: number, opens_access = true): PaymentHistoryPeriodRow => ({
  order_id, user_id, applied_at, amount_minor, opens_access,
  period_start: applied_at, period_end: new Date(Date.parse(applied_at) + 30 * 86_400_000).toISOString(),
});
const periods: PaymentHistoryPeriodRow[] = [
  period("o-legacy", OWNER, "2026-10-01T09:00:00Z", 79900),
  period("o-standard", OWNER, "2026-11-10T05:03:00Z", 79900),
  period("o-partner", OWNER, "2026-11-05T20:30:00Z", 79800),
  period("o-test", OWNER, "2026-11-06T10:00:00Z", 79900, false),
  period("o-refund", OWNER, "2026-10-20T10:00:00Z", 79900),
  period("o-other-org", OWNER, "2026-10-25T10:00:00Z", 79900),
  period("o-foreign", OTHER, "2026-10-26T10:00:00Z", 79900),
  period("o-foreign-legacy", OTHER, "2026-10-27T10:00:00Z", 79900),
];
const orders: PaymentHistoryOrderRow[] = [
  ...periods.map((p) => ({ id: p.order_id, user_id: p.user_id, status: "paid", order_kind: "business_subscription", paid_at: p.applied_at })),
].map((o) => (o.id === "o-refund" ? { ...o, status: "refunded" } : o));

const calls: string[] = [];
const reader: PaymentHistoryReader = {
  async scopesForOrganization(org) { calls.push(`scopesForOrganization:${org}`); return scopes.filter((s) => s.organization_id === org); },
  async scopesForOrders(ids) { return scopes.filter((s) => ids.includes(s.order_id)); },
  async realPeriodsForOrders(ids) { return periods.filter((p) => ids.includes(p.order_id) && p.opens_access); },
  async realPeriodsForUser(user) { calls.push(`realPeriodsForUser:${user}`); return periods.filter((p) => p.user_id === user && p.opens_access); },
  async ordersByIds(ids) { return orders.filter((o) => ids.includes(o.id)); },
};

async function main() {
const rows = await collectBusinessPaymentHistoryRows(reader, { userId: OWNER, organizationId: ORG });
assert.deepEqual(rows.map((r) => r.orderId).sort(), ["o-legacy", "o-partner", "o-refund", "o-standard"],
  "own organization + own legacy only; no test payment, other organization or other account");
assert.deepEqual(calls.sort(), [`realPeriodsForUser:${OWNER}`, `scopesForOrganization:${ORG}`], "queries are scoped to the caller");
assert.deepEqual(await collectBusinessPaymentHistoryRows(reader, { userId: "", organizationId: ORG }), []);
assert.deepEqual(await collectBusinessPaymentHistoryRows(reader, { userId: OWNER, organizationId: "" }), []);

// A reader that leaks rows still never shows another organization or account.
const leaky: PaymentHistoryReader = {
  ...reader,
  async realPeriodsForUser() { return periods; },
  async realPeriodsForOrders() { return periods; },
};
assert.deepEqual((await collectBusinessPaymentHistoryRows(leaky, { userId: OWNER, organizationId: ORG })).map((r) => r.orderId).sort(),
  ["o-legacy", "o-partner", "o-refund", "o-standard"], "defence in depth against a wide read");

// A pending/failed order with a period row (should not exist) is not shown.
const pendingReader: PaymentHistoryReader = {
  ...reader,
  async ordersByIds(ids) { return orders.filter((o) => ids.includes(o.id)).map((o) => (o.id === "o-standard" ? { ...o, status: "pending" } : o)); },
};
assert.ok(!(await collectBusinessPaymentHistoryRows(pendingReader, { userId: OWNER, organizationId: ORG })).some((r) => r.orderId === "o-standard"));

const view = presentBusinessPaymentHistory(rows);
assert.deepEqual(view.items.map((i) => i.orderId), ["o-standard", "o-partner", "o-refund", "o-legacy"], "newest first");
const [standard, partner, refund, legacy] = view.items;
assert.equal(standard.dateLabel, "10 ноября 2026");
assert.equal(standard.timeLabel, "08:03 МСК");
assert.equal(standard.amountRub, 799);
assert.equal(standard.standardAmountRub, null);
assert.equal(standard.venuesLabel, "1 точка");
assert.equal(standard.periodLabel, "10 ноября – 10 декабря 2026");
assert.equal(partner.dateLabel, "5 ноября 2026");
assert.equal(partner.timeLabel, "23:30 МСК");
assert.equal(partner.amountRub, 798);
assert.equal(partner.standardAmountRub, 1598, "two venues at 399 instead of 799");
assert.equal(partner.venuesLabel, "2 точки");
assert.equal(refund.refunded, true);
assert.equal(legacy.venuesLabel, "1 точка");
assert.equal(view.totalRub, 799 + 798 + 799, "refunded payment is not counted");

assert.equal(formatBusinessPaidPeriod("2026-12-20T10:00:00Z", "2027-01-19T10:00:00Z"), "20 декабря 2026 – 19 января 2027");
assert.equal(formatBusinessPaidPeriod("bad", "2027-01-19T10:00:00Z"), "");
assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(ruVenuesWord), ["точка", "точки", "точек", "точек", "точка", "точки", "точек"]);

const html = renderToStaticMarkup(<BusinessPaymentHistoryList view={view} />);
assert.ok(html.includes("10 ноября 2026"));
assert.ok(html.includes("08:03 МСК"));
assert.ok(html.includes("<s"), "partner price shows the usual price struck through");
assert.ok(html.includes("1\u00a0598\u00a0₽") && html.includes("798\u00a0₽"));
assert.ok(html.includes("Персональная цена по коду партнёра"));
assert.ok(html.includes("Деньги возвращены"));
assert.ok(html.includes("Всего оплачено"));
assert.ok(!/ - /.test(html.replace(/<[^>]+>/g, " ")), "en dash only, no hyphen as a dash");
const empty = renderToStaticMarkup(<BusinessPaymentHistoryList view={{ items: [], totalRub: 0 }} />);
assert.ok(empty.includes(BUSINESS_PAYMENT_HISTORY_EMPTY));
assert.ok(!empty.includes("Всего оплачено"));

// Routing: the business host serves /profile/payments, owner side only.
assert.equal(BUSINESS_PAYMENT_HISTORY_HREF, "/profile/payments");
assert.equal(resolveBusinessInternalPath("/profile/payments"), "/business-app/profile/payments");
assert.equal(isBusinessOwnerOnlyPath("/profile/payments"), true);

// The page checks the owner role with the caller's session before the service-role read.
const page = readFileSync("src/app/business-app/profile/payments/page.tsx", "utf8");
assert.ok(page.includes('requireBusinessCabinetPermission("sectionProfile")'));
assert.ok(/membership\?\.role === "owner"/.test(page));
assert.ok(page.indexOf('membership?.role === "owner"') < page.indexOf("loadBusinessPaymentHistory({"));
const server = readFileSync("src/lib/business-app/payment-history.server.ts", "utf8");
assert.ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(server), "read-only");
const subscription = readFileSync("src/components/business-app/profile/BusinessProfileSubscription.tsx", "utf8");
assert.ok(subscription.indexOf("<BusinessPayControls") < subscription.indexOf("biz-profile-payment-history-link"), "link right under the pay button");

console.log("business payment history unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
