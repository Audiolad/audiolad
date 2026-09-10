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
import {
  COURSE_UPGRADE_AUTH_UNAVAILABLE_ERROR,
  COURSE_UPGRADE_GENERIC_ERROR,
  COURSE_UPGRADE_NETWORK_ERROR,
  COURSE_UPGRADE_UNEXPECTED_RESPONSE_ERROR,
  interpretCourseUpgradeCheckoutResponse,
  mapCourseUpgradeClientError,
  resolveCourseUpgradeUiError,
} from "../src/lib/course-content/course-upgrade-client-errors.ts";
import {
  COURSE_UPGRADE_CHECKOUT_PATH,
  COURSE_UPGRADE_CHECKOUT_STAGES,
  createCourseUpgradeRequestClient,
  logCourseUpgradeFailure,
  readCourseUpgradeRequestUser,
  runCourseUpgradeProtectedUpdateSession,
} from "../src/lib/course-content/course-upgrade-stages.ts";
import { decidePendingTochkaPayment } from "../src/lib/payments/pending-tochka-payment.ts";
import { extractSafeTochkaErrorCode } from "../src/lib/payments/tochka-error.ts";
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
assert.match(button, /credentials: "same-origin"/);
assert.match(button, /interpretCourseUpgradeCheckoutResponse/);
assert.match(button, /window\.location\.assign\(outcome\.paymentUrl\)/);
assert.match(button, /unexpectedResponse/);
assert.match(button, /networkFailed: true/);

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

const amountMatch = read(
  "supabase/migrations/20260925120600_course_upgrade_canonical_sales_amount_match.sql",
);
assert.match(amountMatch, /p\.amount_minor = o\.amount_minor/);
assert.match(amountMatch, /p\.currency = o\.currency/);
assert.match(amountMatch, /p\.currency = 'RUB'/);
assert.doesNotMatch(amountMatch, /SET access_source/);

const entitledUnpublished = read(
  "supabase/migrations/20261001120000_course_upgrade_entitled_unpublished.sql",
);
assert.match(entitledUnpublished, /CREATE OR REPLACE FUNCTION public\.create_course_upgrade_order/);
assert.match(entitledUnpublished, /v_entitled/);
assert.match(entitledUnpublished, /already-entitled learner/);
assert.ok(
  entitledUnpublished.indexOf("v_entitled") <
    entitledUnpublished.indexOf("RAISE EXCEPTION 'practice_not_published'"),
  "published gate must run only after entitlement is known",
);
assert.match(entitledUnpublished, /viewer_can_commercially_access_practice/);
assert.match(entitledUnpublished, /RAISE EXCEPTION 'not_entitled'/);
assert.doesNotMatch(entitledUnpublished, /DROP TABLE|TRUNCATE/);
assert.match(
  read("supabase/tests/course_upgrade_checkout_smoke.sql"),
  /unpublished entitled upgrade mismatch/,
);

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
assert.match(startPay, /amountMinor !== priceMinor/);

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

assert.equal(
  mapCourseUpgradeClientError("provider_checkout_failed"),
  "Платёжная система не создала ссылку. Попробуйте ещё раз через минуту.",
);
assert.equal(
  mapCourseUpgradeClientError("order_already_paid"),
  "Этот платёж уже завершён. Обновите страницу.",
);
assert.equal(
  mapCourseUpgradeClientError("practice_not_found"),
  "Курс не найден или временно недоступен.",
);
assert.equal(
  mapCourseUpgradeClientError("unknown_code"),
  COURSE_UPGRADE_GENERIC_ERROR,
);
assert.equal(
  mapCourseUpgradeClientError("internal_error"),
  COURSE_UPGRADE_GENERIC_ERROR,
);
assert.notEqual(
  mapCourseUpgradeClientError("provider_checkout_failed"),
  COURSE_UPGRADE_GENERIC_ERROR,
);
assert.equal(
  mapCourseUpgradeRpcError("idempotency_key_conflict").error,
  "invalid_request",
);

assert.match(route, /logCourseUpgradeFailure/);
assert.match(route, /order_kind, target_access_level/);
assert.match(route, /COURSE_UPGRADE_CHECKOUT_STAGES\.PAYMENT_URL/);
assert.match(route, /targetAccessLevel: orderRow\.target_access_level/);
assert.match(
  read("src/lib/course-content/course-upgrade-stages.ts"),
  /FAILED_STAGE/,
);
assert.match(button, /resolveCourseUpgradeUiError/);
assert.match(button, /interpretCourseUpgradeCheckoutResponse/);
assert.match(startPay, /decidePendingTochkaPayment/);
assert.match(startPay, /provider_checkout_failed/);
assert.doesNotMatch(startPay, /tochka_recreate_failed/);
assert.doesNotMatch(startPay, /paymentLinkId:\s*paymentRow\.id/);
assert.doesNotMatch(startPay, /paymentLinkId:\s*input\.paymentLinkId/);
assert.match(
  read("src/lib/payments/tochka-client.ts"),
  /paymentLinkId:\s*input\.orderId/,
);

const stuckPending = decidePendingTochkaPayment({
  pendingPayment: {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    provider: "tochka",
    provider_payment_id: null,
    idempotency_key: "key",
    status: "pending",
    amount_minor: 222200,
    currency: "RUB",
    provider_metadata: {},
    created_at: "2026-09-09T12:00:00.000Z",
    confirmed_at: null,
  },
  orderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  orderAmountMinor: 222200,
});
assert.equal(stuckPending.kind, "recreate");

assert.equal(COURSE_UPGRADE_CHECKOUT_STAGES.CREATE_TOCHKA, "createTochkaPaymentOperation");
assert.equal(
  extractSafeTochkaErrorCode({
    Errors: [{ code: "duplicate_payment_link", message: "Bearer secret-token" }],
    jwt: "secret-token",
  }),
  "duplicate_payment_link",
);
assert.equal(
  extractSafeTochkaErrorCode({
    message: "Bearer secret-token",
    jwt: "secret-token",
  }),
  null,
);

assert.equal(
  resolveCourseUpgradeUiError({
    httpStatus: 200,
    paymentUrl: "",
  }),
  mapCourseUpgradeClientError("provider_checkout_failed"),
);
assert.equal(
  resolveCourseUpgradeUiError({
    httpStatus: 500,
    errorCode: "internal_error",
  }),
  COURSE_UPGRADE_GENERIC_ERROR,
);
assert.equal(
  resolveCourseUpgradeUiError({
    httpStatus: 409,
    errorCode: "author_finance_not_ready",
  }),
  mapCourseUpgradeClientError("author_finance_not_ready"),
);
assert.equal(
  resolveCourseUpgradeUiError({
    httpStatus: 0,
    networkFailed: true,
  }),
  COURSE_UPGRADE_NETWORK_ERROR,
);
assert.notEqual(COURSE_UPGRADE_NETWORK_ERROR, COURSE_UPGRADE_GENERIC_ERROR);
assert.equal(
  mapCourseUpgradeClientError("auth_unavailable"),
  COURSE_UPGRADE_AUTH_UNAVAILABLE_ERROR,
);
assert.notEqual(
  COURSE_UPGRADE_AUTH_UNAVAILABLE_ERROR,
  COURSE_UPGRADE_GENERIC_ERROR,
);
assert.notEqual(
  COURSE_UPGRADE_AUTH_UNAVAILABLE_ERROR,
  COURSE_UPGRADE_NETWORK_ERROR,
);
assert.equal(
  mapCourseUpgradeClientError("not_entitled"),
  "Сначала нужен доступ к текущему уровню.",
);
assert.equal(
  resolveCourseUpgradeUiError({
    httpStatus: 403,
    errorCode: "not_entitled",
  }),
  "Сначала нужен доступ к текущему уровню.",
);
assert.equal(
  resolveCourseUpgradeUiError({
    httpStatus: 503,
    errorCode: "auth_unavailable",
  }),
  COURSE_UPGRADE_AUTH_UNAVAILABLE_ERROR,
);
assert.equal(
  resolveCourseUpgradeUiError({
    httpStatus: 500,
    unexpectedResponse: true,
  }),
  COURSE_UPGRADE_UNEXPECTED_RESPONSE_ERROR,
);
assert.notEqual(
  COURSE_UPGRADE_UNEXPECTED_RESPONSE_ERROR,
  COURSE_UPGRADE_NETWORK_ERROR,
);
assert.notEqual(
  COURSE_UPGRADE_UNEXPECTED_RESPONSE_ERROR,
  COURSE_UPGRADE_GENERIC_ERROR,
);
assert.equal(
  interpretCourseUpgradeCheckoutResponse({
    httpStatus: 500,
    unexpectedResponse: true,
  }).kind,
  "error",
);
assert.equal(
  interpretCourseUpgradeCheckoutResponse({
    httpStatus: 500,
    unexpectedResponse: true,
  }).message,
  COURSE_UPGRADE_UNEXPECTED_RESPONSE_ERROR,
);
assert.equal(
  interpretCourseUpgradeCheckoutResponse({
    httpStatus: 0,
    networkFailed: true,
  }).message,
  COURSE_UPGRADE_NETWORK_ERROR,
);
assert.deepEqual(
  interpretCourseUpgradeCheckoutResponse({
    httpStatus: 201,
    body: {
      payment: { payment_url: "https://pay.example/ok" },
    },
  }),
  { kind: "redirect", paymentUrl: "https://pay.example/ok" },
);
assert.equal(
  interpretCourseUpgradeCheckoutResponse({
    httpStatus: 403,
    body: { error: "not_entitled" },
  }).message,
  "Сначала нужен доступ к текущему уровню.",
);

const accrualSql = read(
  "supabase/migrations/20260730160000_author_canonical_sales.sql",
);
const accrualFn = accrualSql.slice(
  accrualSql.indexOf("CREATE OR REPLACE FUNCTION public.order_sale_accrual_ready"),
  accrualSql.indexOf("REVOKE ALL ON FUNCTION public.order_sale_accrual_ready"),
);
assert.match(accrualFn, /author_sale_accrual_ready/);
assert.doesNotMatch(accrualFn, /course_upgrade/);
assert.match(
  read("deploy/scripts/audiolad-reconcile-diagnose.sh"),
  /GetCourse appreciation reconcile/,
);
assert.doesNotMatch(
  read("deploy/scripts/audiolad-reconcile-diagnose.sh"),
  /course_upgrade_failed|create_payment_tochka/,
);

assert.equal(COURSE_UPGRADE_CHECKOUT_PATH, "/api/checkout/course-upgrade");
assert.equal(COURSE_UPGRADE_CHECKOUT_STAGES.PROXY_AUTH, "proxy_auth");
assert.equal(
  COURSE_UPGRADE_CHECKOUT_STAGES.CREATE_REQUEST_CLIENT,
  "create_request_client",
);
assert.equal(
  COURSE_UPGRADE_CHECKOUT_STAGES.AUTHENTICATE_USER,
  "authenticate_user",
);
assert.equal(COURSE_UPGRADE_CHECKOUT_STAGES.AUTH, "auth");

const proxySource = read("src/proxy.ts");
assert.match(proxySource, /runCourseUpgradeProtectedUpdateSession/);
assert.match(proxySource, /auth_unavailable/);
assert.match(proxySource, /NextResponse\.json/);
assert.match(
  proxySource,
  /return updateSession\(request, \{ rewritePathname: SCHOOL_SITE_PATH \}\)/,
);
assert.match(
  proxySource,
  /return updateSession\(request, \{ rewritePathname: MAX_SITE_PATH \}\)/,
);
assert.doesNotMatch(
  route,
  /p_expected_amount|already_owned/,
);

assert.match(route, /createCourseUpgradeRequestClient/);
assert.match(route, /readCourseUpgradeRequestUser/);
assert.match(route, /CREATE_REQUEST_CLIENT|create_request_client/);
assert.match(route, /AUTHENTICATE_USER|authenticate_user/);
assert.match(route, /COURSE_UPGRADE_CHECKOUT_STAGES\.AUTH, "unauthorized"/);

async function captureConsoleErrorAsync(run) {
  const entries = [];
  const original = console.error;
  console.error = (...args) => {
    entries.push(args);
  };
  try {
    return { entries, result: await run() };
  } finally {
    console.error = original;
  }
}

function serializedLogs(entries) {
  return entries
    .map((args) =>
      args
        .map((value) => {
          if (typeof value === "string") {
            return value;
          }
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })
        .join(" "),
    )
    .join("\n");
}

const PROXY_THROWN_SECRET = "leak-cookie=SECRET_JWT_eyJhbGciOi.not.real";
let proxyNextCalled = false;
const proxyThrow = await captureConsoleErrorAsync(async () =>
  runCourseUpgradeProtectedUpdateSession({
    pathname: COURSE_UPGRADE_CHECKOUT_PATH,
    updateSession: async () => {
      throw new Error(PROXY_THROWN_SECRET);
    },
    failClosed: () => ({
      status: 503,
      body: { error: "auth_unavailable" },
    }),
  }),
);
assert.deepEqual(proxyThrow.result, {
  status: 503,
  body: { error: "auth_unavailable" },
});
assert.equal(proxyNextCalled, false);
assert.equal(proxyThrow.entries[0]?.[0], "course_upgrade_auth_error");
assert.deepEqual(proxyThrow.entries[0]?.[1], {
  FAILED_STAGE: "proxy_auth",
  ACTUAL_API_ERROR: "auth_unavailable",
  ACTUAL_HTTP_STATUS: 503,
});
assert.doesNotMatch(serializedLogs(proxyThrow.entries), /SECRET_JWT|leak-cookie/);

await assert.rejects(
  () =>
    runCourseUpgradeProtectedUpdateSession({
      pathname: "/api/checkout/studio-music",
      updateSession: async () => {
        throw new Error(PROXY_THROWN_SECRET);
      },
      failClosed: () => ({ shouldNot: true }),
    }),
  (error) => error instanceof Error && error.message === PROXY_THROWN_SECRET,
);

let otherPathNextCalled = false;
const otherPathOk = await runCourseUpgradeProtectedUpdateSession({
  pathname: "/catalog",
  updateSession: async () => {
    otherPathNextCalled = true;
    return { kind: "next" };
  },
  failClosed: () => ({ kind: "fail-closed" }),
});
assert.deepEqual(otherPathOk, { kind: "next" });
assert.equal(otherPathNextCalled, true);

const clientThrow = await captureConsoleErrorAsync(async () => {
  const created = await createCourseUpgradeRequestClient(async () => {
    throw new Error(PROXY_THROWN_SECRET);
  });
  if (!created.ok) {
    logCourseUpgradeFailure({
      stage: created.stage,
      error: created.error,
      status: created.status,
    });
  }
  return created;
});
assert.deepEqual(clientThrow.result, {
  ok: false,
  stage: "create_request_client",
  error: "auth_unavailable",
  status: 503,
});
assert.equal(clientThrow.entries[0]?.[0], "course_upgrade_failed");
assert.equal(clientThrow.entries[0]?.[1]?.FAILED_STAGE, "create_request_client");
assert.equal(clientThrow.entries[0]?.[1]?.ACTUAL_API_ERROR, "auth_unavailable");
assert.equal(clientThrow.entries[0]?.[1]?.ACTUAL_HTTP_STATUS, 503);
assert.doesNotMatch(serializedLogs(clientThrow.entries), /SECRET_JWT|leak-cookie/);

const getUserThrow = await captureConsoleErrorAsync(async () => {
  const authenticated = await readCourseUpgradeRequestUser(async () => {
    throw new Error(PROXY_THROWN_SECRET);
  });
  if (!authenticated.ok) {
    logCourseUpgradeFailure({
      stage: authenticated.stage,
      error: authenticated.error,
      status: authenticated.status,
    });
  }
  return authenticated;
});
assert.deepEqual(getUserThrow.result, {
  ok: false,
  stage: "authenticate_user",
  error: "auth_unavailable",
  status: 503,
});
assert.equal(getUserThrow.entries[0]?.[0], "course_upgrade_failed");
assert.equal(getUserThrow.entries[0]?.[1]?.FAILED_STAGE, "authenticate_user");
assert.equal(
  getUserThrow.entries[0]?.[1]?.ACTUAL_API_ERROR,
  "auth_unavailable",
);
assert.doesNotMatch(serializedLogs(getUserThrow.entries), /SECRET_JWT|leak-cookie/);

const unauthenticated = await readCourseUpgradeRequestUser(async () => ({
  data: { user: null },
  error: null,
}));
assert.deepEqual(unauthenticated, {
  ok: true,
  user: null,
  authError: null,
});

const { POST, setCourseUpgradeCreateClientForTests } = await import(
  "../src/app/api/checkout/course-upgrade/route.ts"
);

async function postUpgrade(createClient) {
  setCourseUpgradeCreateClientForTests(createClient);
  try {
    return await POST(
      new Request("https://audiolad.ru/api/checkout/course-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          targetAccessLevel: 2,
        }),
      }),
    );
  } finally {
    setCourseUpgradeCreateClientForTests(null);
  }
}

const routeClientThrow = await captureConsoleErrorAsync(() =>
  postUpgrade(async () => {
    throw new Error(PROXY_THROWN_SECRET);
  }),
);
assert.equal(routeClientThrow.result.status, 503);
assert.deepEqual(await routeClientThrow.result.json(), {
  error: "auth_unavailable",
});
assert.equal(routeClientThrow.entries[0]?.[0], "course_upgrade_failed");
assert.equal(
  routeClientThrow.entries[0]?.[1]?.FAILED_STAGE,
  "create_request_client",
);
assert.doesNotMatch(
  serializedLogs(routeClientThrow.entries),
  /SECRET_JWT|leak-cookie/,
);

const routeGetUserThrow = await captureConsoleErrorAsync(() =>
  postUpgrade(async () => ({
    auth: {
      getUser: async () => {
        throw new Error(PROXY_THROWN_SECRET);
      },
    },
  })),
);
assert.equal(routeGetUserThrow.result.status, 503);
assert.deepEqual(await routeGetUserThrow.result.json(), {
  error: "auth_unavailable",
});
assert.equal(
  routeGetUserThrow.entries[0]?.[1]?.FAILED_STAGE,
  "authenticate_user",
);

const routeUnauthorized = await captureConsoleErrorAsync(() =>
  postUpgrade(async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  })),
);
assert.equal(routeUnauthorized.result.status, 401);
assert.deepEqual(await routeUnauthorized.result.json(), {
  error: "unauthorized",
});
assert.equal(routeUnauthorized.entries[0]?.[1]?.FAILED_STAGE, "auth");
assert.equal(
  routeUnauthorized.entries[0]?.[1]?.ACTUAL_API_ERROR,
  "unauthorized",
);

console.log("course-upgrade-checkout-unit: ok");
