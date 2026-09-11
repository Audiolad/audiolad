#!/usr/bin/env node
/**
 * PR3 Studio music free acquire + paid checkout.
 * No live database / Tochka. Covers acquire/checkout contracts,
 * listen isolation, and ordinary/course-upgrade regressions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STUDIO_MUSIC_ORDER_KIND } from "../src/lib/studio-music/access";
import {
  coerceStudioMusicAcquireRow,
  mapStudioMusicAcquireRpcError,
  parseStudioMusicAcquireRequest,
  toStudioMusicAcquireSuccessBody,
} from "../src/lib/studio-music/acquire-api";
import {
  formatStudioMusicBuyLabel,
  markStudioMusicCatalogItemAvailable,
  resolveStudioMusicCatalogAction,
  resolveStudioMusicEntitlementAfterCheckout,
  STUDIO_MUSIC_FREE_ACQUIRE_LABEL,
  STUDIO_MUSIC_LOADING_LABEL,
  studioCheckoutUsesServerOrderAmount,
} from "../src/lib/studio-music/catalog-actions";
import {
  coerceStudioMusicOrderRow,
  mapStudioMusicCheckoutRpcError,
  parseJsonObject,
  parseStudioMusicCheckoutRequest,
  parseStudioMusicPriceChangedDetail,
  STUDIO_MUSIC_CHECKOUT_STAGES,
  toStudioMusicCheckoutSuccessBody,
} from "../src/lib/studio-music/checkout-api";
import {
  mapStudioMusicAcquireClientError,
  mapStudioMusicCheckoutClientError,
  resolveStudioMusicCheckoutUiError,
} from "../src/lib/studio-music/client-errors";
import {
  resolveStudioMusicDisplayLabel,
  resolveStudioMusicOwnership,
  type StudioMusicCatalogItem,
} from "../src/lib/studio-music/catalog";
import {
  buildPaidAuthenticatedPrimaryHref,
  buildStudioMusicPaidHref,
  isStudioMusicLicenseCheckout,
} from "../src/lib/payments/checkout-result-cta";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const PRACTICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAYMENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ENTITLEMENT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function catalogItem(
  overrides: Partial<StudioMusicCatalogItem> = {},
): StudioMusicCatalogItem {
  const ownership = overrides.ownership ?? {
    can_acquire: true,
    can_use: false,
    is_owned: false,
    is_author_member: false,
    grant_source: null,
  };
  const isFree = overrides.is_free ?? false;
  const studioEffectiveMinor = overrides.studio_effective_minor ?? 100000;
  return {
    publication_id: PRACTICE_ID,
    kind: "single",
    title: "Рассвет",
    author: { name: "Анна", slug: "anna" },
    cover: { url: null },
    duration_seconds: 120,
    items_count: 1,
    tracks: [{ id: "track-1", title: "Рассвет", duration_seconds: 120 }],
    is_free: isFree,
    listener_is_free: isFree,
    listener_effective_minor: isFree ? null : 50000,
    studio_pricing_mode: isFree ? "free" : "auto_2x_listener",
    studio_is_free: isFree,
    studio_effective_minor: isFree ? null : studioEffectiveMinor,
    ownership,
    display_label: resolveStudioMusicDisplayLabel({
      ownership,
      isFree,
      studioEffectiveMinor: isFree ? null : studioEffectiveMinor,
    }),
    listener_price_label: isFree
      ? "Прослушивание: бесплатно"
      : "Прослушивание: 500\u00a0₽",
    studio_price_label: isFree
      ? "Для Студии: бесплатно"
      : "Для Студии: 1\u00a0000\u00a0₽",
    kind_label: "Трек",
    subtitle: null,
    ...overrides,
  };
}

// 1. free acquire success
assert.equal(mapStudioMusicAcquireRpcError("practice_not_free").error, "practice_not_free");
assert.equal(mapStudioMusicAcquireRpcError("not_authenticated").status, 401);

const freeParsed = parseStudioMusicAcquireRequest({ practiceId: PRACTICE_ID });
assert.deepEqual(freeParsed, { ok: true, value: { practiceId: PRACTICE_ID } });
const freeRow = coerceStudioMusicAcquireRow({
  entitlement_id: ENTITLEMENT_ID,
  practice_id: PRACTICE_ID,
  grant_source: "free",
  order_id: null,
  inserted: true,
  granted_at: "2026-09-10T12:00:00.000Z",
});
assert.equal(freeRow?.inserted, true);
assert.equal(freeRow?.order_id, null);
assert.equal(freeRow?.grant_source, "free");
assert.equal(
  coerceStudioMusicAcquireRow({ ...freeRow, inserted: 1 })?.inserted,
  true,
  "numeric RPC true must not be turned into internal_error",
);
assert.equal(
  coerceStudioMusicAcquireRow({ ...freeRow, inserted: 0 })?.inserted,
  false,
  "numeric RPC false replay must remain idempotent",
);
const freeBody = toStudioMusicAcquireSuccessBody(freeRow!);
assert.equal(freeBody.entitlement.order_id, null);
assert.equal(freeBody.entitlement.inserted, true);
const freeAvailable = markStudioMusicCatalogItemAvailable(
  catalogItem({ is_free: true, studio_effective_minor: null }),
  { grantSource: "free" },
);
assert.equal(freeAvailable.ownership.can_use, true);
assert.equal(freeAvailable.ownership.can_acquire, false);
assert.equal(freeAvailable.display_label, "Доступно в Студии");
assert.equal(resolveStudioMusicCatalogAction(freeAvailable).kind, "available");

// 2. free acquire idempotent replay
const replayRow = coerceStudioMusicAcquireRow({
  entitlement_id: ENTITLEMENT_ID,
  practice_id: PRACTICE_ID,
  grant_source: "free",
  order_id: null,
  inserted: false,
  granted_at: "2026-09-10T12:00:00.000Z",
});
assert.equal(replayRow?.inserted, false);
assert.equal(toStudioMusicAcquireSuccessBody(replayRow!).entitlement.inserted, false);
const replayAvailable = markStudioMusicCatalogItemAvailable(freeAvailable, {
  grantSource: "free",
});
assert.equal(replayAvailable.ownership.can_use, true);
assert.equal(replayAvailable.ownership.can_acquire, false);

// 3. paid Studio order uses studio_music_license
assert.equal(STUDIO_MUSIC_ORDER_KIND, "studio_music_license");
const paidParsed = parseStudioMusicCheckoutRequest({
  practiceId: PRACTICE_ID,
  expectedAmountMinor: 100000,
});
assert.equal(paidParsed.ok, true);
if (paidParsed.ok) {
  assert.equal(paidParsed.value.expectedAmountMinor, 100000);
}
const orderRow = coerceStudioMusicOrderRow({
  order_id: ORDER_ID,
  practice_id: PRACTICE_ID,
  practice_slug: "dawn",
  status: "pending",
  amount_minor: 100000,
  currency: "RUB",
  order_kind: "studio_music_license",
  created_at: "2026-09-10T12:00:00.000Z",
});
assert.equal(orderRow?.order_kind, "studio_music_license");
assert.equal(orderRow?.amount_minor, 100000);
assert.equal(
  coerceStudioMusicOrderRow({
    ...orderRow,
    order_kind: "product_purchase",
  }),
  null,
);

// 4. checkout uses returned server order amount
assert.equal(studioCheckoutUsesServerOrderAmount(100000, 50000), 100000);
assert.equal(studioCheckoutUsesServerOrderAmount(179800, 89900), 179800);
assert.notEqual(studioCheckoutUsesServerOrderAmount(100000, 50000), 50000);
const success = toStudioMusicCheckoutSuccessBody({
  order: {
    ...orderRow!,
    amount_minor: 100000,
  },
  paymentId: PAYMENT_ID,
  paymentUrl: "https://pay.example/studio",
});
assert.equal(success.order.amount_minor, 100000);
assert.equal(success.order.order_kind, "studio_music_license");
assert.equal(success.payment.payment_url, "https://pay.example/studio");
assert.equal(success.payment.order_id, ORDER_ID);

// 5. payment URL via existing Tochka helper
const checkoutRoute = read("src/app/api/checkout/studio-music/route.ts");
assert.match(checkoutRoute, /create_studio_music_order/);
assert.match(checkoutRoute, /startTochkaCheckoutForPendingOrder/);
assert.match(checkoutRoute, /p_expected_amount_minor/);
assert.match(checkoutRoute, /STUDIO_MUSIC_CHECKOUT_STAGES/);
assert.doesNotMatch(checkoutRoute, /createTochkaPaymentOperation/);
assert.doesNotMatch(checkoutRoute, /paymentLinkId/);
assert.doesNotMatch(checkoutRoute, /from\(["']user_practices["']\)/);
assert.doesNotMatch(checkoutRoute, /create_practice_order/);
assert.doesNotMatch(checkoutRoute, /create_course_upgrade_order/);
assert.ok(
  checkoutRoute.indexOf("customerEmail") <
    checkoutRoute.indexOf("create_studio_music_order"),
  "usable Tochka email must be checked before creating a pending Studio order",
);
assert.equal(
  STUDIO_MUSIC_CHECKOUT_STAGES.START_TOCHKA,
  "startTochkaCheckoutForPendingOrder",
);

const startPay = read("src/lib/payments/start-tochka-checkout.ts");
assert.match(startPay, /createTochkaPaymentOperation/);
assert.match(startPay, /getOrderSaleAccrualReady/);

const acquireRoute = read("src/app/api/studio/music/acquire/route.ts");
assert.match(acquireRoute, /acquire_free_studio_music/);
assert.doesNotMatch(acquireRoute, /from\(["']orders["']\)/);
assert.doesNotMatch(acquireRoute, /from\(["']payments["']\)/);
assert.doesNotMatch(acquireRoute, /from\(["']user_practices["']\)/);
assert.doesNotMatch(acquireRoute, /startTochkaCheckoutForPendingOrder/);

// 6. already entitled → no second checkout
assert.equal(
  mapStudioMusicCheckoutRpcError("already_studio_entitled").error,
  "already_studio_entitled",
);
assert.equal(mapStudioMusicCheckoutRpcError("already_studio_entitled").status, 409);
assert.equal(mapStudioMusicCheckoutRpcError("already_owned").error, "internal_error");
const entitled = markStudioMusicCatalogItemAvailable(catalogItem(), {
  grantSource: "purchase",
});
assert.equal(resolveStudioMusicCatalogAction(entitled).kind, "available");
assert.equal(entitled.ownership.can_acquire, false);
const ownerItem = catalogItem({
  ownership: {
    can_acquire: false,
    can_use: true,
    is_owned: false,
    is_author_member: true,
    grant_source: "owner",
  },
});
assert.equal(resolveStudioMusicCatalogAction(ownerItem).kind, "own");
assert.equal(resolveStudioMusicCatalogAction(ownerItem).label, "Ваша музыка");

// 7. listener ownership ≠ Studio entitlement
const listenerOwnedButNoStudio = resolveStudioMusicOwnership({
  practice: {
    id: PRACTICE_ID,
    status: "published",
    deleted_at: null,
    product_kind: "music",
    publication_class: "release",
    music_usage_permission: "platform_reuse_allowed",
    is_free: false,
    price: 500,
  },
  entitlement: null,
  isAuthorMember: false,
});
assert.equal(listenerOwnedButNoStudio.can_use, false);
assert.equal(listenerOwnedButNoStudio.can_acquire, true);
assert.equal(listenerOwnedButNoStudio.is_owned, false);
assert.equal(
  resolveStudioMusicCatalogAction(
    catalogItem({ ownership: listenerOwnedButNoStudio }),
  ).kind,
  "paid",
);

const catalogSource = read("src/lib/studio-music/catalog.ts");
assert.doesNotMatch(catalogSource, /from\(["']user_practices["']\)/);
assert.doesNotMatch(read("src/lib/studio-music/access.ts"), /from\(["']user_practices["']\)/);
assert.match(read("src/lib/studio-music/checkout-api.ts"), /already_studio_entitled/);
assert.equal(
  mapStudioMusicCheckoutRpcError("already_owned").error,
  "internal_error",
  "listener already_owned must not become a Studio checkout client error",
);

// 8. Studio entitlement ≠ listener ownership
const acquireApi = read("src/lib/studio-music/acquire-api.ts");
assert.doesNotMatch(acquireApi, /user_practices/);
assert.doesNotMatch(checkoutRoute, /grant_practice_purchase_access/);
assert.doesNotMatch(acquireRoute, /grant_practice_purchase_access/);
const fulfill = read(
  "supabase/migrations/20261003120400_fulfill_tochka_studio_music_license.sql",
);
assert.match(fulfill, /studio_music_license/);
assert.match(fulfill, /studio_music_entitlements/);
assert.match(fulfill, /never user_practices/);

// 9. ordinary product checkout regression
const ordersRoute = read("src/app/api/orders/route.ts");
assert.match(ordersRoute, /create_practice_order/);
assert.doesNotMatch(ordersRoute, /create_studio_music_order/);
assert.doesNotMatch(ordersRoute, /acquire_free_studio_music/);
const paymentsRoute = read("src/app/api/payments/route.ts");
assert.match(paymentsRoute, /createTochkaPaymentOperation/);
assert.doesNotMatch(paymentsRoute, /create_studio_music_order/);
assert.doesNotMatch(read("src/components/BuyPracticeButton.tsx"), /studio-music/);

// 10. course upgrade checkout regression
const courseRoute = read("src/app/api/checkout/course-upgrade/route.ts");
assert.match(courseRoute, /create_course_upgrade_order/);
assert.match(courseRoute, /startTochkaCheckoutForPendingOrder/);
assert.doesNotMatch(courseRoute, /create_studio_music_order/);
assert.doesNotMatch(courseRoute, /acquire_free_studio_music/);
assert.doesNotMatch(
  read("src/lib/course-content/course-upgrade-order-api.ts"),
  /studio_music/,
);

// 11. price_changed handled
assert.equal(mapStudioMusicCheckoutRpcError("price_changed").error, "price_changed");
const detail = parseStudioMusicPriceChangedDetail(
  "current_amount_minor=120000;listener_amount_minor=60000;base_price_minor=50000;promotion_price_minor=60000;promotion_id=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee;promotion_type=sale",
);
assert.equal(detail?.current_amount_minor, 120000);
assert.equal(detail?.listener_amount_minor, 60000);
assert.notEqual(detail?.current_amount_minor, detail?.listener_amount_minor);
assert.match(checkoutRoute, /price_changed/);
assert.match(checkoutRoute, /current_amount_minor/);
assert.equal(
  parseStudioMusicCheckoutRequest({
    practiceId: PRACTICE_ID,
    amount: 100000,
  }).ok,
  false,
);
assert.equal(
  parseStudioMusicCheckoutRequest({
    practiceId: PRACTICE_ID,
    userId: "attacker",
  }).ok,
  false,
);
assert.equal(
  parseStudioMusicCheckoutRequest({
    practiceId: PRACTICE_ID,
    paymentLinkId: "forged",
  }).ok,
  false,
);
assert.equal(parseJsonObject(null), null);

// 12. payment/entitlement refresh after success
assert.equal(
  resolveStudioMusicEntitlementAfterCheckout({
    redirectedBack: true,
    checkoutStatus: null,
    catalogCanUse: false,
  }),
  false,
);
assert.equal(
  resolveStudioMusicEntitlementAfterCheckout({
    redirectedBack: true,
    checkoutStatus: "pending",
    catalogCanUse: false,
  }),
  false,
);
assert.equal(
  resolveStudioMusicEntitlementAfterCheckout({
    redirectedBack: true,
    checkoutStatus: "paid",
    catalogCanUse: false,
  }),
  true,
);
assert.equal(
  resolveStudioMusicEntitlementAfterCheckout({
    redirectedBack: false,
    checkoutStatus: null,
    catalogCanUse: true,
  }),
  true,
);

const resultClient = read(
  "src/app/(platform)/checkout/result/CheckoutResultClient.tsx",
);
assert.match(resultClient, /\/api\/checkout\/status/);
assert.match(resultClient, /isStudioMusicLicenseCheckout/);
assert.match(resultClient, /Музыка доступна в Студии/);
assert.match(resultClient, /Открыть Студию/);
assert.match(resultClient, /Слушать сейчас/);
assert.doesNotMatch(resultClient, /window\.location\.assign/);
assert.equal(isStudioMusicLicenseCheckout("studio_music_license"), true);
assert.equal(isStudioMusicLicenseCheckout("product_purchase"), false);
assert.equal(buildStudioMusicPaidHref(), "/studio");
assert.equal(
  buildPaidAuthenticatedPrimaryHref({
    authorSlug: "anna",
    practiceSlug: "dawn",
    orderKind: "studio_music_license",
  }),
  "/studio",
);
assert.equal(
  buildPaidAuthenticatedPrimaryHref({
    authorSlug: "anna",
    practiceSlug: "dawn",
  }),
  "/practice/anna/dawn",
);

// UX labels: Studio price is ×2, never listener price as Studio price
assert.equal(
  formatStudioMusicBuyLabel(100000),
  "Купить для Студии за 1\u00a0000\u00a0₽",
);
assert.notEqual(formatStudioMusicBuyLabel(100000), "Купить для Студии за 500\u00a0₽");
assert.equal(
  resolveStudioMusicCatalogAction(catalogItem({ is_free: true })).label,
  STUDIO_MUSIC_FREE_ACQUIRE_LABEL,
);
assert.equal(STUDIO_MUSIC_LOADING_LABEL, "Загрузка…");

const overlay = read("src/components/studio/StudioMusicCatalogOverlay.tsx");
assert.match(overlay, /\/api\/studio\/music\/acquire/);
assert.match(overlay, /\/api\/checkout\/studio-music/);
assert.match(overlay, /refreshPublication/);
assert.match(overlay, /already_studio_entitled/);
assert.match(overlay, /price_changed/);
assert.doesNotMatch(overlay, /useRouter/);
assert.doesNotMatch(overlay, /from\(["']user_practices["']\)/);
assert.doesNotMatch(overlay, /listener_effective_minor/);

const card = read("src/components/studio/StudioMusicCatalogCard.tsx");
assert.match(card, /resolveStudioMusicCatalogAction/);
assert.match(card, /STUDIO_MUSIC_LOADING_LABEL/);
assert.doesNotMatch(card, /listener_effective_minor/);

const shell = read("src/components/studio/StudioEditorShell.tsx");
assert.doesNotMatch(shell, /create_studio_music_order/);
assert.doesNotMatch(shell, /acquire_free_studio_music/);

const authorForm = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.doesNotMatch(authorForm, /create_studio_music_order/);
assert.doesNotMatch(authorForm, /acquire_free_studio_music/);

assert.equal(
  mapStudioMusicCheckoutClientError("already_studio_entitled"),
  "Эта музыка уже доступна в Студии.",
);
assert.equal(
  mapStudioMusicAcquireClientError("practice_not_free"),
  "Эта музыка не бесплатная.",
);
assert.equal(
  mapStudioMusicAcquireClientError("support_mutation_blocked"),
  "В режиме поддержки нельзя получать музыку для Студии.",
);
assert.equal(
  resolveStudioMusicCheckoutUiError({
    httpStatus: 201,
    paymentUrl: "https://pay.example/studio",
  }),
  "",
);
assert.equal(
  resolveStudioMusicCheckoutUiError({
    httpStatus: 201,
    paymentUrl: "",
  }).length > 0,
  true,
);

console.log("studio-music-checkout-unit: ok");
