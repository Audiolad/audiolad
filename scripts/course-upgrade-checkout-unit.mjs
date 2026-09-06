#!/usr/bin/env node
/**
 * Phase 4 native course upgrade checkout — fixtures, eligibility, UI,
 * money, API parsing, regressions. No live database / Tochka.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COURSE_ACCESS_LEVELS_TEST_BASE_PRICE,
  COURSE_ACCESS_LEVELS_TEST_L2_UPGRADE_PRICE,
  COURSE_ACCESS_LEVELS_TEST_L3_UPGRADE_PRICE,
  createCourseAccessLevelsTestCatalog,
  createCourseAccessLevelsThreeLevelTestCatalog,
} from "../src/lib/author-products/course-access-levels-fixture.ts";
import {
  attachNativeUpgradeAction,
  nextNativeUpgradeLevel,
} from "../src/lib/course-content/attach-upgrade-action.ts";
import {
  coerceCourseUpgradeOrderRow,
  mapCourseUpgradeRpcError,
  parseCourseUpgradeRequest,
  parseJsonObject,
  toCourseUpgradeSuccessBody,
} from "../src/lib/course-content/course-upgrade-order-api.ts";
import { groupLearnerCourse } from "../src/lib/course-content/learner-groups.ts";
import { toCheckoutStatusBody } from "../src/lib/payments/checkout-status-api.ts";
import { rublesToMinor } from "../src/lib/pricing/money.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return readFileSync(join(root, relative), "utf8");
}

const catalog = createCourseAccessLevelsTestCatalog();
assert.equal(COURSE_ACCESS_LEVELS_TEST_BASE_PRICE, 3333);
assert.equal(COURSE_ACCESS_LEVELS_TEST_L2_UPGRADE_PRICE, 2222);
assert.equal(COURSE_ACCESS_LEVELS_TEST_L3_UPGRADE_PRICE, 1500);
assert.equal(catalog.basePrice, 3333);
assert.equal(catalog.access_levels[1].upgrade_price, 2222);
assert.equal(createCourseAccessLevelsThreeLevelTestCatalog().access_levels[2].upgrade_price, 1500);

// A — eligibility / payload
assert.deepEqual(
  parseCourseUpgradeRequest({ practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
  {
    ok: true,
    value: { practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  },
);
assert.equal(
  parseCourseUpgradeRequest({
    practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    targetAccessLevel: 2,
  }).ok,
  true,
);
assert.equal(
  parseCourseUpgradeRequest({
    practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    targetAccessLevel: 3,
  }).value.targetAccessLevel,
  3,
);
assert.equal(
  parseCourseUpgradeRequest({
    practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    targetAccessLevel: 1,
  }).error,
  "invalid_target_access_level",
);
assert.equal(
  parseCourseUpgradeRequest({
    practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: "attacker",
  }).error,
  "invalid_request",
);
assert.equal(
  parseCourseUpgradeRequest({
    practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    amount: 2222,
  }).error,
  "invalid_request",
);
assert.equal(
  parseCourseUpgradeRequest({
    practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "x@y.z",
  }).error,
  "invalid_request",
);
assert.equal(parseJsonObject(null), null);
assert.equal(nextNativeUpgradeLevel(1), 2);
assert.equal(nextNativeUpgradeLevel(2), 3);
assert.equal(nextNativeUpgradeLevel(null), null);

assert.equal(mapCourseUpgradeRpcError("already_owned").error, "internal_error");
assert.equal(mapCourseUpgradeRpcError("not_entitled").error, "not_entitled");
assert.equal(mapCourseUpgradeRpcError("not_course").error, "not_course");
assert.equal(mapCourseUpgradeRpcError("upgrade_not_configured").error, "upgrade_not_configured");
assert.equal(mapCourseUpgradeRpcError("invalid_target_access_level").error, "invalid_target_access_level");

// B — order / money (server-side integer RUB helpers)
assert.equal(rublesToMinor(2222), 222200);
assert.equal(rublesToMinor(1500), 150000);
assert.equal(rublesToMinor(3333), 333300);
assert.notEqual(rublesToMinor(2222), 3333);
assert.notEqual(rublesToMinor(2222), 5555);

const success = toCourseUpgradeSuccessBody({
  order: {
    order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    practice_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    practice_slug: "course",
    status: "pending",
    amount_minor: 222200,
    currency: "RUB",
    order_kind: "course_upgrade",
    target_access_level: 2,
    created_at: "2026-09-06T12:00:00.000Z",
  },
  paymentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  paymentUrl: "https://pay.example/u",
});
assert.equal(success.order.amount_minor, 222200);
assert.equal(success.order.order_kind, "course_upgrade");
assert.equal(success.order.target_access_level, 2);
assert.equal(success.payment.payment_url, "https://pay.example/u");

assert.equal(
  coerceCourseUpgradeOrderRow({
    order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    practice_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    practice_slug: "course",
    status: "pending",
    amount_minor: "222200",
    currency: "RUB",
    order_kind: "course_upgrade",
    target_access_level: "2",
    created_at: "2026-09-06T12:00:00.000Z",
  })?.amount_minor,
  222200,
);

// C — concurrency / endpoint contracts
const route = read("src/app/api/checkout/course-upgrade/route.ts");
assert.match(route, /create_course_upgrade_order/);
assert.match(route, /startTochkaCheckoutForPendingOrder/);
assert.match(route, /Idempotency-Key/);
assert.doesNotMatch(route, /p_expected_amount/);
assert.doesNotMatch(route, /already_owned/);
assert.ok(
  route.indexOf("customerEmail") < route.indexOf("create_course_upgrade_order"),
  "usable Tochka email must be checked before creating a pending upgrade order",
);

const button = read(
  "src/components/products/course-learner/CourseLevelUpgradeButton.tsx",
);
assert.match(button, /disabled=\{isLoading\}/);
assert.match(button, /\/api\/checkout\/course-upgrade/);
assert.match(button, /Idempotency-Key/);

// D / E — grant + fulfill contracts (latest function, not the 20260725 original only)
const fulfill = read(
  "supabase/migrations/20260925120200_fulfill_tochka_course_upgrade.sql",
);
assert.match(fulfill, /CREATE OR REPLACE FUNCTION public\.fulfill_tochka_payment_transactional/);
assert.match(fulfill, /grant_practice_purchase_access\(v_order\.id\)/);
assert.match(fulfill, /granted_via', 'course_upgrade'/);
assert.match(fulfill, /grant_practice_access\(/);
assert.match(fulfill, /v_order_kind = 'course_upgrade'/);
assert.match(fulfill, /Do not re-read live upgrade_price/);
assert.match(fulfill, /access_grant_below_target/);
assert.doesNotMatch(fulfill, /DROP FUNCTION public\.fulfill_tochka_payment_transactional/);

const originalFulfill = read(
  "supabase/migrations/20260725190000_payments_p30_transactional_fulfill.sql",
);
assert.match(originalFulfill, /grant_practice_purchase_access\(v_order\.id\)/);

const rpc = read(
  "supabase/migrations/20260925120100_create_course_upgrade_order.sql",
);
assert.match(rpc, /RAISE EXCEPTION 'not_entitled'/);
assert.match(rpc, /RAISE EXCEPTION 'not_course'/);
assert.match(rpc, /v_target := v_current \+ 1/);
assert.match(rpc, /upgrade_price::bigint\) \* 100/);
assert.doesNotMatch(rpc, /RAISE EXCEPTION 'already_owned'/);
assert.match(rpc, /viewer_can_commercially_access_practice/);

const idempotency = read(
  "supabase/migrations/20260925120300_create_course_upgrade_order_idempotency.sql",
);
assert.ok(
  idempotency.indexOf("idempotency_key = v_idempotency_key") <
    idempotency.indexOf("v_target := v_current + 1"),
  "replay must look up the original key before recomputing current+1",
);
assert.match(idempotency, /True idempotency/);
assert.doesNotMatch(idempotency, /RAISE EXCEPTION 'already_owned'/);

const canonical = read(
  "supabase/migrations/20260925120400_course_upgrade_canonical_sale.sql",
);
assert.match(canonical, /canonical_sale_has_paid_access/);
assert.match(canonical, /canonical_sale_qualifies/);
assert.match(canonical, /course_upgrade' THEN/);
assert.match(canonical, /access_source = 'purchase'/);

const projection = read(
  "supabase/migrations/20260925120500_course_upgrade_canonical_sales_projection.sql",
);
assert.match(projection, /canonical_sale_has_paid_access\(/);
assert.match(projection, /canonical_sale_qualifies/);
assert.doesNotMatch(projection, /SET access_source/);

const createOrder = read(
  "supabase/migrations/20260901120200_create_practice_order_visibility.sql",
);
assert.match(createOrder, /RAISE EXCEPTION 'already_owned'/);

// F — pending + meanwhile grant: first upgrade is completed, not review
assert.match(fulfill, /must not classify a first upgrade as repaired\/review/);
assert.match(fulfill, /v_order_kind = 'course_upgrade'/);
assert.match(fulfill, /v_outcome := 'completed'/);

// G — finance not gated on access_inserted
const fulfillTs = read("src/lib/payments/fulfill-payment.ts");
assert.match(fulfillTs, /paymentStatus === "succeeded"/);
assert.match(fulfillTs, /notifyAuthorOfCanonicalSale/);
assert.doesNotMatch(
  fulfillTs,
  /if \(result\.accessInserted\)/,
);

const startPay = read("src/lib/payments/start-tochka-checkout.ts");
assert.match(startPay, /createTochkaPaymentOperation/);
assert.match(startPay, /getOrderSaleAccrualReady/);
assert.match(startPay, /amount_minor !== input\.orderRow\.price_minor_snapshot/);

// H — UI: one CTA on next locked level
const levels = attachNativeUpgradeAction({
  levels: [
    { level: 1, title: "L1", description: null, upgradePrice: null, currency: "RUB" },
    { level: 2, title: "L2", description: null, upgradePrice: 2222, currency: "RUB" },
    { level: 3, title: "L3", description: null, upgradePrice: 1500, currency: "RUB" },
  ],
  accessLevel: 1,
  practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  privileged: false,
});
assert.equal(levels[1].upgradeAction?.kind, "course_upgrade");
assert.equal(levels[2].upgradeAction, undefined);

const grouped = groupLearnerCourse({
  publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  accessLevel: 1,
  privileged: false,
  levels,
  lessons: [
    {
      id: "a",
      title: "L1",
      position: 0,
      requiredAccessLevel: 1,
      locked: false,
      blocks: [],
    },
    { id: "b", title: "L2", position: 1, requiredAccessLevel: 2, locked: true },
    { id: "c", title: "L3", position: 2, requiredAccessLevel: 3, locked: true },
  ],
});
assert.equal(grouped.kind, "grouped");
assert.equal(grouped.groups[1].chrome?.upgradeAction?.kind, "course_upgrade");
assert.equal(grouped.groups[2].chrome?.upgradeAction, null);
assert.match(grouped.groups[1].chrome?.upgradePriceLabel ?? "", /Доплата/);

const ui = read("src/components/products/course-learner/CourseLearnerContent.tsx");
assert.match(ui, /CourseLevelUpgradeButton/);
assert.match(ui, /kind === "course_upgrade"/);

const status = toCheckoutStatusBody({
  status: "pending",
  practiceSlug: "course",
  practiceTitle: "Курс",
  authorSlug: "anna",
  authenticated: true,
  orderKind: "course_upgrade",
  targetAccessLevel: 2,
});
assert.equal(status.orderKind, "course_upgrade");
assert.equal(status.targetAccessLevel, 2);
assert.equal(status.status, "pending");

// I — regressions: one catalog product, no second entitlement system
const schema = read(
  "supabase/migrations/20260925120000_course_upgrade_order_kind.sql",
);
assert.match(schema, /DEFAULT 'product_purchase'/);
assert.match(schema, /target_access_level integer NULL/);
assert.match(schema, /level_has_live_upgrade_orders/);
assert.doesNotMatch(schema, /UPDATE public\.orders/);
assert.doesNotMatch(schema, /DROP TABLE/);

assert.doesNotMatch(read("src/lib/catalog/dto.ts"), /course_upgrade/);
assert.doesNotMatch(
  read("src/lib/seo/json-ld/builders.ts"),
  /upgrade_price/,
);

const grant = read("src/lib/products/grant-access.ts");
assert.match(grant, /GRANT_PRACTICE_ACCESS_RPC/);

// J — config drift documented
assert.match(schema, /Failed\/cancelled\/refunded orders do not block/);
assert.match(rpc, /Amount stays \(config drift\)/);

console.log("course-upgrade-checkout-unit: ok");
