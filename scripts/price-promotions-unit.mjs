#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  KOPECKS_PER_RUBLE,
  MAX_PAID_PRICE_RUB,
  MIN_PAID_PRICE_RUB,
  parseIntegerRubles,
  rublesToMinor,
  validatePaidPriceRubles,
  validateSalePriceRubles,
} from "../src/lib/pricing/money.ts";
import {
  PRICE_CHANGED_MESSAGE,
  resolvePracticePrice,
} from "../src/lib/pricing/resolve.ts";
import { PRICE_PROMOTION_TYPES, PRICE_SURFACES } from "../src/lib/pricing/types.ts";
import {
  extractExpectedAmountMinor,
  mapRpcErrorMessage,
  parsePriceChangedDetail,
} from "../src/lib/orders/create-order-api.ts";
import { parsePromotionWriteBody } from "../src/lib/pricing/author-promotions.ts";
import { validatePaidPriceRubles as validatePaidAgain } from "../src/lib/pricing/money.ts";
import {
  bindPersonalStarts,
  mergeParallelPersonalStarts,
  startPersonalCountdown,
  startsForSubject,
} from "../src/lib/pricing/personal-start.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function promotion(overrides) {
  return {
    id: "promo-1",
    practiceId: "practice-1",
    name: "Funnel 499",
    promotionType: PRICE_PROMOTION_TYPES.PERSONAL_COUNTDOWN,
    salePrice: 499,
    startsAt: null,
    endsAt: null,
    durationSeconds: 20 * 60,
    isActive: true,
    startToken: "token-1",
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  };
}

function start(overrides) {
  return {
    id: "start-1",
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    startedAt: "2026-08-23T10:00:00.000Z",
    expiresAt: "2026-08-23T10:20:00.000Z",
    ...overrides,
  };
}

function testMoneyNeverFloat() {
  assertEqual(KOPECKS_PER_RUBLE, 100, "kopecks");
  assertEqual(rublesToMinor(4999), 499900, "base to minor");
  assertEqual(rublesToMinor(499), 49900, "sale to minor");
  assertEqual(parseIntegerRubles("4999"), 4999, "parse string");
  assertEqual(parseIntegerRubles("49.9"), null, "reject decimal string");
  assertEqual(parseIntegerRubles(49.9), null, "reject float");
  assert(validatePaidPriceRubles(49).ok, "min paid ok");
  assert(validatePaidPriceRubles(100_000).ok, "max paid ok");
  assert(!validatePaidPriceRubles(10).ok, "below min rejected");
  assert(!validatePaidPriceRubles(100_001).ok, "above max rejected");
  assert(!validatePaidPriceRubles(99.5).ok, "float rejected");
  assert(validateSalePriceRubles(499, 4999).ok, "sale below base");
  assert(!validateSalePriceRubles(4999, 4999).ok, "sale equal base rejected");
  assert(!validateSalePriceRubles(5000, 4999).ok, "sale above base rejected");
  assertEqual(MIN_PAID_PRICE_RUB, 49, "min");
  assertEqual(MAX_PAID_PRICE_RUB, 100_000, "max");
  assert(validatePaidAgain(12345).ok, "any integer in range accepted");
}

function testBasePriceOnly() {
  const resolved = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [],
    starts: [],
    surface: PRICE_SURFACES.PRODUCT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });

  assertEqual(resolved.finalPrice, 4999, "final is base");
  assertEqual(resolved.salePrice, null, "no sale");
  assertEqual(resolved.promotion, null, "no promo");
  assertEqual(resolved.finalPriceMinor, 499900, "minor");
}

function testCalendarPromo() {
  const promo = promotion({
    promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
    startsAt: "2026-08-23T09:00:00.000Z",
    endsAt: "2026-08-23T18:00:00.000Z",
    durationSeconds: null,
  });

  const during = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [],
    surface: PRICE_SURFACES.CATALOG,
    now: new Date("2026-08-23T12:00:00.000Z"),
  });
  assertEqual(during.finalPrice, 499, "catalog sees calendar sale");
  assertEqual(during.basePrice, 4999, "base preserved");
  assertEqual(during.promotion?.promotionType, "calendar", "type");

  const after = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [],
    surface: PRICE_SURFACES.CATALOG,
    now: new Date("2026-08-23T19:00:00.000Z"),
  });
  assertEqual(after.finalPrice, 4999, "after window base");
  assertEqual(after.promotion, null, "no promo after");
}

function testPersonalCountdownAndCatalogIsolation() {
  const promo = promotion();
  const visitorStart = start();
  const now = new Date("2026-08-23T10:10:00.000Z");

  const product = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [visitorStart],
    surface: PRICE_SURFACES.PRODUCT,
    now,
  });
  assertEqual(product.finalPrice, 499, "started visitor sees sale");
  assertEqual(product.promotion?.expiresAt, visitorStart.expiresAt, "expires");

  const catalog = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [visitorStart],
    surface: PRICE_SURFACES.CATALOG,
    now,
  });
  assertEqual(catalog.finalPrice, 4999, "catalog stays at base");
  assertEqual(catalog.promotion, null, "catalog ignores personal");

  const otherVisitor = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [],
    surface: PRICE_SURFACES.PRODUCT,
    now,
  });
  assertEqual(otherVisitor.finalPrice, 4999, "other visitor sees base");
}

function testOneShotPersonalCountdown() {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const later = new Date("2026-08-23T10:10:00.000Z");
  const afterExpiry = new Date("2026-08-23T10:25:00.000Z");
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const otherVisitor = "22222222-2222-4222-8222-222222222222";
  const promo = promotion();

  const first = startPersonalCountdown({
    store: [],
    promotionId: promo.id,
    visitorId,
    userId: null,
    now,
    durationSeconds: 20 * 60,
    id: "start-1",
  });
  assert(first.created, "first visit creates start");
  assertEqual(first.start.startedAt, now.toISOString(), "started 10:00");
  assertEqual(first.start.expiresAt, "2026-08-23T10:20:00.000Z", "expires 10:20");

  const repeat = startPersonalCountdown({
    store: first.store,
    promotionId: promo.id,
    visitorId,
    userId: null,
    now: later,
    durationSeconds: 20 * 60,
    id: "start-repeat",
  });
  assert(!repeat.created, "repeat before expiry reuses");
  assertEqual(repeat.start.startedAt, first.start.startedAt, "same started_at");
  assertEqual(repeat.start.expiresAt, first.start.expiresAt, "same expires_at");
  assertEqual(repeat.store.length, 1, "no second row");

  const after = startPersonalCountdown({
    store: first.store,
    promotionId: promo.id,
    visitorId,
    userId: null,
    now: afterExpiry,
    durationSeconds: 20 * 60,
    id: "start-after",
  });
  assert(!after.created, "repeat after expiry does not restart");
  assertEqual(after.start.startedAt, first.start.startedAt, "original started_at kept");
  assertEqual(after.start.expiresAt, first.start.expiresAt, "original expires_at kept");
  assertEqual(after.store.length, 1, "still one row");

  const expiredPrice = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: startsForSubject(after.store, visitorId, null),
    surface: PRICE_SURFACES.PRODUCT,
    now: afterExpiry,
  });
  assertEqual(expiredPrice.finalPrice, 4999, "after expiry price is base");
  assertEqual(expiredPrice.promotion, null, "no sale after expiry");

  const other = startPersonalCountdown({
    store: first.store,
    promotionId: promo.id,
    visitorId: otherVisitor,
    userId: null,
    now: afterExpiry,
    durationSeconds: 20 * 60,
    id: "start-other",
  });
  assert(other.created, "new visitor gets their own window");
  assertEqual(other.start.visitorId, otherVisitor, "other visitor id");
  assertEqual(other.store.length, 2, "two visitors two rows");
  assertEqual(
    other.start.expiresAt,
    "2026-08-23T10:45:00.000Z",
    "other visitor 20 minutes from their start",
  );
}

function testGuestLoginKeepsOriginalWindow() {
  const guestStart = startPersonalCountdown({
    store: [],
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    now: new Date("2026-08-23T10:00:00.000Z"),
    durationSeconds: 20 * 60,
    id: "guest-1",
  });
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const bound = bindPersonalStarts(
    guestStart.store,
    "11111111-1111-4111-8111-111111111111",
    userId,
  );
  assertEqual(bound.length, 1, "bind does not add a row");
  assertEqual(bound[0].userId, userId, "user attached to guest row");
  assertEqual(bound[0].startedAt, guestStart.start.startedAt, "started_at kept");
  assertEqual(bound[0].expiresAt, guestStart.start.expiresAt, "expires_at kept");

  const duringLogin = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: startsForSubject(
      bound,
      "11111111-1111-4111-8111-111111111111",
      userId,
    ),
    surface: PRICE_SURFACES.CHECKOUT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });
  assertEqual(duringLogin.finalPrice, 499, "login keeps sale");
  assertEqual(
    duringLogin.promotion?.expiresAt,
    guestStart.start.expiresAt,
    "checkout uses original expiry",
  );

  const startAfterLogin = startPersonalCountdown({
    store: bound,
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId,
    now: new Date("2026-08-23T10:12:00.000Z"),
    durationSeconds: 20 * 60,
    id: "should-not-create",
  });
  assert(!startAfterLogin.created, "login does not create a second countdown");
  assertEqual(startAfterLogin.store.length, 1, "still one start");
  assertEqual(
    startAfterLogin.start.expiresAt,
    guestStart.start.expiresAt,
    "token after login does not extend",
  );
}

function testGuestExpiryThenLoginDoesNotRevive() {
  const guestStart = startPersonalCountdown({
    store: [],
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    now: new Date("2026-08-23T10:00:00.000Z"),
    durationSeconds: 20 * 60,
    id: "guest-expired",
  });
  const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const afterExpiry = new Date("2026-08-23T10:30:00.000Z");

  const bound = bindPersonalStarts(
    guestStart.store,
    "11111111-1111-4111-8111-111111111111",
    userId,
  );
  const started = startPersonalCountdown({
    store: bound,
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId,
    now: afterExpiry,
    durationSeconds: 20 * 60,
    id: "revive",
  });
  assert(!started.created, "expired guest start is not recreated after login");
  assertEqual(started.store.length, 1, "no new row after login");

  const resolved = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: startsForSubject(
      started.store,
      "11111111-1111-4111-8111-111111111111",
      userId,
    ),
    surface: PRICE_SURFACES.CHECKOUT,
    now: afterExpiry,
  });
  assertEqual(resolved.finalPrice, 4999, "expired offer does not revive");
  assertEqual(resolved.promotion, null, "no promotion after expiry+login");
}

function testParallelStartsShareOneWindow() {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const input = {
    store: [],
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    now,
    durationSeconds: 20 * 60,
  };

  const first = startPersonalCountdown({ ...input, id: "parallel-a" });
  const second = startPersonalCountdown({ ...input, id: "parallel-b" });
  assert(first.created && second.created, "both racers attempt insert");

  const merged = mergeParallelPersonalStarts(first.start, second.start);
  assertEqual(merged.length, 1, "unique constraint keeps one window");
  assertEqual(merged[0].startedAt, now.toISOString(), "original start kept");
  assertEqual(merged[0].expiresAt, "2026-08-23T10:20:00.000Z", "original expiry kept");
}

function testCanonicalStartIgnoresLaterStrayWindow() {
  const original = start({
    id: "original",
    startedAt: "2026-08-23T10:00:00.000Z",
    expiresAt: "2026-08-23T10:20:00.000Z",
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  const stray = start({
    id: "stray",
    visitorId: "33333333-3333-4333-8333-333333333333",
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    startedAt: "2026-08-23T10:21:00.000Z",
    expiresAt: "2026-08-23T10:41:00.000Z",
  });

  const afterOriginal = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: [original, stray],
    surface: PRICE_SURFACES.CHECKOUT,
    now: new Date("2026-08-23T10:30:00.000Z"),
  });
  assertEqual(afterOriginal.finalPrice, 4999, "later stray window does not apply");
}

function testExpiredPersonalPromo() {
  const resolved = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: [start({ expiresAt: "2026-08-23T10:05:00.000Z" })],
    surface: PRICE_SURFACES.CHECKOUT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });

  assertEqual(resolved.finalPrice, 4999, "expired returns base");
  assertEqual(resolved.promotion, null, "no promo after expiry");
}

function testFrontendTamperRejected() {
  const expected = extractExpectedAmountMinor({ expected_amount_minor: 49900 });
  const resolvedMinor = 499900;
  assertEqual(expected, 49900, "client expected extracted");
  assert(expected !== resolvedMinor, "tampered expected differs from server");

  const mapped = mapRpcErrorMessage("price_changed");
  assertEqual(mapped.error, "price_changed", "rpc maps price_changed");
  assertEqual(mapped.status, 409, "conflict status");

  const parsed = parsePriceChangedDetail(
    "current_amount_minor=499900;base_price_minor=499900;promotion_price_minor=;promotion_id=;promotion_type=",
  );
  assert(parsed, "detail parsed");
  assertEqual(parsed.current_amount_minor, 499900, "current minor");
  assertEqual(parsed.promotion_id, null, "no promo id");
  assert(PRICE_CHANGED_MESSAGE.includes("акция"), "user-facing message");
}

function testOrderSnapshotShape() {
  const resolved = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: [start()],
    surface: PRICE_SURFACES.CHECKOUT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });

  const snapshot = {
    amount_minor: resolved.finalPriceMinor,
    price_minor_snapshot: resolved.finalPriceMinor,
    base_price_minor_snapshot: resolved.basePriceMinor,
    promotion_price_minor_snapshot: resolved.salePriceMinor,
    promotion_id: resolved.promotion?.id ?? null,
    promotion_type: resolved.promotion?.promotionType ?? null,
  };

  assertEqual(snapshot.amount_minor, 49900, "final charged");
  assertEqual(snapshot.base_price_minor_snapshot, 499900, "base snap");
  assertEqual(snapshot.promotion_price_minor_snapshot, 49900, "promo snap");
  assertEqual(snapshot.promotion_id, "promo-1", "promo id");
  assertEqual(snapshot.promotion_type, "personal_countdown", "promo type");
}

function testAuthorPromotionValidation() {
  const ok = parsePromotionWriteBody(
    {
      name: "20 минут",
      promotion_type: "personal_countdown",
      sale_price: 499,
      duration_amount: 20,
      duration_unit: "minutes",
    },
    4999,
  );
  assert(ok.ok, "valid personal");
  if (ok.ok) {
    assertEqual(ok.durationSeconds, 1200, "20 minutes");
  }

  const badPrice = parsePromotionWriteBody(
    {
      name: "too high",
      promotion_type: "personal_countdown",
      sale_price: 4999,
      duration_seconds: 1200,
    },
    4999,
  );
  assert(!badPrice.ok, "sale >= base rejected");

  const calendar = parsePromotionWriteBody(
    {
      name: "weekend",
      promotion_type: "calendar",
      sale_price: 888,
      starts_at: "2026-08-23T10:00:00.000Z",
      ends_at: "2026-08-24T10:00:00.000Z",
    },
    1888,
  );
  assert(calendar.ok, "valid calendar");
}

function testPurchaseRegressionStillUsesIntegerRubles() {
  assertEqual(rublesToMinor(199), 19900, "legacy 199");
  assertEqual(rublesToMinor(99), 9900, "legacy 99");
  assert(validatePaidPriceRubles(2888).ok, "old chip still valid");
}

function testMigrationContract() {
  const schema = readFileSync(
    join(ROOT, "supabase/migrations/20260823180000_practice_price_promotions.sql"),
    "utf8",
  );
  const oneshot = readFileSync(
    join(ROOT, "supabase/migrations/20260823183000_price_promotion_oneshot_bind.sql"),
    "utf8",
  );
  const orderFn = readFileSync(
    join(
      ROOT,
      "supabase/migrations/20260823181000_create_practice_order_price_promotions.sql",
    ),
    "utf8",
  );

  assert(schema.includes("CREATE TABLE public.practice_price_promotions"), "promotions table");
  assert(
    schema.includes("CREATE TABLE public.practice_price_promotion_starts"),
    "starts table",
  );
  assert(schema.includes("start_token"), "universal trigger token");
  assert(schema.includes("resolve_practice_effective_price"), "resolve fn");
  assert(schema.includes("start_practice_price_promotion"), "start fn");
  assert(schema.includes("base_price_minor_snapshot"), "order base snapshot");
  assert(!schema.includes("CREATE TABLE public.promotions"), "no generic promotions clash");
  assert(orderFn.includes("p_expected_amount_minor"), "expected amount");
  assert(orderFn.includes("price_changed"), "race error");
  assert(orderFn.includes("resolve_practice_effective_price"), "order uses resolve");
  assert(orderFn.includes("promotion_price_minor_snapshot"), "order promo snapshot");
  assert(oneshot.includes("bind_practice_price_promotion_starts"), "bind fn");
  assert(
    oneshot.includes("practice_price_promotion_starts_promo_user_uidx"),
    "unique user start",
  );
  assert(oneshot.includes("ON CONFLICT (promotion_id, visitor_id) DO NOTHING"), "upsert");
  assert(!oneshot.includes("started_at = v_now"), "no expiry restart");
  assert(oneshot.includes("ORDER BY s.started_at ASC"), "canonical earliest window");
}

function testSourceContracts() {
  const authorRoute = readFileSync(
    join(ROOT, "src/app/api/author/products/[id]/route.ts"),
    "utf8",
  );
  assert(authorRoute.includes("validatePaidPriceRubles"), "author API uses range");
  assert(!authorRoute.includes("PAID_PRICE_OPTIONS.includes"), "chips no longer constrain");

  const buyBtn = readFileSync(
    join(ROOT, "src/components/BuyPracticeButton.tsx"),
    "utf8",
  );
  assert(buyBtn.includes("expected_amount_minor"), "buy sends expected");
  assert(buyBtn.includes("price_changed"), "buy handles race");

  const form = readFileSync(
    join(ROOT, "src/components/author-dashboard/AuthorProductForm.tsx"),
    "utf8",
  );
  assert(form.includes("AuthorProductPromotions"), "promotions UI");
  assert(form.includes("type=\"number\""), "manual price input");

  const startRoute = readFileSync(
    join(ROOT, "src/app/api/price-promotions/start/route.ts"),
    "utf8",
  );
  assert(startRoute.includes("export async function GET"), "GET trigger");
  assert(startRoute.includes("export async function POST"), "POST trigger");
  assert(startRoute.includes("start_practice_price_promotion"), "start RPC");

  const callback = readFileSync(
    join(ROOT, "src/app/(platform)/auth/callback/route.ts"),
    "utf8",
  );
  assert(callback.includes("bindPracticePricePromotionStarts"), "login binds cookie");

  const ordersRoute = readFileSync(join(ROOT, "src/app/api/orders/route.ts"), "utf8");
  assert(ordersRoute.includes("bindPracticePricePromotionStarts"), "checkout binds");
}

function main() {
  testMoneyNeverFloat();
  testBasePriceOnly();
  testCalendarPromo();
  testPersonalCountdownAndCatalogIsolation();
  testOneShotPersonalCountdown();
  testGuestLoginKeepsOriginalWindow();
  testGuestExpiryThenLoginDoesNotRevive();
  testParallelStartsShareOneWindow();
  testCanonicalStartIgnoresLaterStrayWindow();
  testExpiredPersonalPromo();
  testFrontendTamperRejected();
  testOrderSnapshotShape();
  testAuthorPromotionValidation();
  testPurchaseRegressionStillUsesIntegerRubles();
  testMigrationContract();
  testSourceContracts();
  console.log("price-promotions-unit: ok");
}

main();
