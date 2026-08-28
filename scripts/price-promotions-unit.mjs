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
import { buildCatalogListingPriceView } from "../src/lib/pricing/catalog-listing.ts";
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
import {
  EMPTY_AUTHOR_PROMOTION_FORM,
  buildPromotionPatchUpdates,
  buildPromotionWriteBody,
  durationSecondsToAmountUnit,
  parsePromotionWriteBody,
  promotionMatchesPractice,
  promotionToFormDraft,
  toDatetimeLocalValue,
} from "../src/lib/pricing/author-promotions.ts";
import { resolveAuthorPromoPreviewPrice } from "../src/lib/pricing/author-promo-preview.ts";
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
    aboveTimerText: null,
    belowButtonText: null,
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
    salePriceSnapshot: 499,
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
  assertEqual(catalog.promotion, null, "catalog ignores personal without teaser");

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

function testCatalogPersonalTeaserStates() {
  const promo = promotion();
  const now = new Date("2026-08-23T10:10:00.000Z");
  const neverStarted = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [],
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: true,
    now,
  });
  assertEqual(neverStarted.finalPrice, 499, "never-started catalog teases sale");
  assertEqual(neverStarted.basePrice, 4999, "never-started keeps base");
  assertEqual(neverStarted.promotion?.expiresAt ?? null, null, "never-started has no timer");

  const active = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [start()],
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: true,
    now,
  });
  assertEqual(active.finalPrice, 499, "active catalog teases sale");
  assertEqual(active.promotion?.expiresAt, start().expiresAt, "active keeps expires_at");

  const editedLive = promotion({ salePrice: 699 });
  const activeKeepsSnapshot = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [editedLive],
    starts: [start({ salePriceSnapshot: 499 })],
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: true,
    now,
  });
  assertEqual(
    activeKeepsSnapshot.finalPrice,
    499,
    "active catalog uses snapshot, not live 699",
  );

  const neverStartedSeesLive = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [editedLive],
    starts: [],
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: true,
    now,
  });
  assertEqual(
    neverStartedSeesLive.finalPrice,
    699,
    "never-started catalog teases live 699",
  );

  const expired = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promo],
    starts: [start({ expiresAt: "2026-08-23T10:05:00.000Z" })],
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: true,
    now,
  });
  assertEqual(expired.finalPrice, 4999, "expired catalog is base");
  assertEqual(expired.promotion, null, "expired catalog has no teaser");
}

function testCatalogPersonalTeaserVersusCalendar() {
  const personal = promotion({ salePrice: 499 });
  const calendar = promotion({
    id: "promo-cal",
    promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
    salePrice: 399,
    startsAt: "2026-08-23T09:00:00.000Z",
    endsAt: "2026-08-23T18:00:00.000Z",
    durationSeconds: null,
    startToken: "token-cal",
  });
  const now = new Date("2026-08-23T10:10:00.000Z");

  const calendarWins = buildCatalogListingPriceView({
    isFree: false,
    basePrice: 4999,
    promotions: [personal, calendar],
    starts: [],
    authorSlug: "anna",
    productSlug: "morning",
    now,
    personalTeaser: true,
  });
  assertEqual(calendarWins.resolved.finalPrice, 399, "lowest applicable calendar wins");
  assertEqual(calendarWins.resolved.promotion?.promotionType, "calendar", "calendar type");
  assertEqual(calendarWins.href, "/practice/anna/morning", "calendar winner has no promo query");

  const personalWins = buildCatalogListingPriceView({
    isFree: false,
    basePrice: 4999,
    promotions: [personal, { ...calendar, salePrice: 888 }],
    starts: [],
    authorSlug: "anna",
    productSlug: "morning",
    now,
    personalTeaser: true,
  });
  assertEqual(personalWins.resolved.finalPrice, 499, "cheaper never-started personal wins");
  assertEqual(
    personalWins.href,
    "/practice/anna/morning?promo=token-1",
    "never-started personal winner starts via existing query",
  );

  const expiredPersonal = buildCatalogListingPriceView({
    isFree: false,
    basePrice: 4999,
    promotions: [personal, calendar],
    starts: [start({ expiresAt: "2026-08-23T10:05:00.000Z" })],
    authorSlug: "anna",
    productSlug: "morning",
    now,
    personalTeaser: true,
  });
  assertEqual(expiredPersonal.resolved.finalPrice, 399, "expired personal leaves calendar");
  assertEqual(expiredPersonal.href, "/practice/anna/morning", "expired href is canonical");

  const activeSnapshotLosesToCalendar = buildCatalogListingPriceView({
    isFree: false,
    basePrice: 4999,
    promotions: [personal, calendar],
    starts: [start({ salePriceSnapshot: 499 })],
    authorSlug: "anna",
    productSlug: "morning",
    now,
    personalTeaser: true,
  });
  assertEqual(
    activeSnapshotLosesToCalendar.resolved.finalPrice,
    399,
    "C: calendar 399 beats ACTIVE snapshot 499",
  );
  assertEqual(
    activeSnapshotLosesToCalendar.resolved.promotion?.promotionType,
    "calendar",
    "C: calendar is the displayed winner",
  );
  assertEqual(
    activeSnapshotLosesToCalendar.href,
    "/practice/anna/morning",
    "C: calendar winner has no promo query",
  );
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
    salePriceSnapshot: 499,
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
    salePriceSnapshot: 699,
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
    salePriceSnapshot: 699,
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
    salePriceSnapshot: 499,
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

function testBindVisitorAndUserRowsKeepsEarliestWindow() {
  const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const visitorRow = start({
    id: "11111111-bbbb-4bbb-8bbb-111111111111",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    startedAt: "2026-08-23T10:00:00.000Z",
    expiresAt: "2026-08-23T10:20:00.000Z",
  });
  const userRow = start({
    id: "22222222-bbbb-4bbb-8bbb-222222222222",
    visitorId: "22222222-2222-4222-8222-222222222222",
    userId,
    startedAt: "2026-08-23T10:05:00.000Z",
    expiresAt: "2026-08-23T10:25:00.000Z",
  });

  const bound = bindPersonalStarts(
    [visitorRow, userRow],
    visitorRow.visitorId,
    userId,
  );

  assertEqual(bound.length, 2, "bind does not drop the later start row");
  const winners = bound.filter((row) => row.userId === userId);
  assertEqual(winners.length, 1, "partial unique (promotion, user) has one row");
  assertEqual(winners[0].id, visitorRow.id, "earliest window keeps user_id");
  assertEqual(winners[0].startedAt, visitorRow.startedAt, "started_at not reset");
  assertEqual(winners[0].expiresAt, visitorRow.expiresAt, "expires_at not reset");
  assertEqual(
    bound.find((row) => row.id === userRow.id)?.userId,
    null,
    "losing user-row detaches user_id before attach",
  );

  const checkout = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion()],
    starts: startsForSubject(bound, visitorRow.visitorId, userId),
    surface: PRICE_SURFACES.CHECKOUT,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });
  assertEqual(checkout.finalPrice, 499, "guest→login uses original sale");
  assertEqual(
    checkout.promotion?.expiresAt,
    visitorRow.expiresAt,
    "checkout uses original expiry",
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
    salePriceSnapshot: 499,
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
    salePriceSnapshot: 699,
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
    salePriceSnapshot: 499,
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
    salePriceSnapshot: 699,
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
    salePriceSnapshot: 499,
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

function applyPromotionUpdate(store, practiceId, promotionId, updates) {
  const index = store.findIndex((row) =>
    promotionMatchesPractice(row, practiceId, promotionId),
  );

  if (index === -1) {
    return { ok: false, store };
  }

  const current = store[index];
  const next = store.slice();
  next[index] = {
    ...current,
    ...updates,
    id: current.id,
    practice_id: current.practice_id,
    start_token: current.start_token,
  };
  return { ok: true, store: next };
}

function savedPromotionRow(overrides = {}) {
  return {
    id: "promo-1",
    practice_id: "practice-1",
    name: "Funnel 499",
    promotion_type: "personal_countdown",
    sale_price: 499,
    starts_at: null,
    ends_at: null,
    duration_seconds: 20 * 60,
    above_timer_text: "Предложение действует ещё: {time_left}",
    below_button_text:
      "Это предложение показывается вам один раз. После окончания таймера продукт останется доступен по полной цене {full_price}.",
    is_active: true,
    start_token: "token-1",
    ...overrides,
  };
}

function testAuthorPromotionEditPrefillAndPersist() {
  const row = savedPromotionRow({
    name: "Утро 20 минут",
    sale_price: 777,
    duration_seconds: 2 * 60 * 60,
    above_timer_text: "Над таймером: {time_left}",
    below_button_text: "Под кнопкой {full_price}",
    is_active: false,
  });

  const draft = promotionToFormDraft(row);
  assertEqual(draft.name, "Утро 20 минут", "prefill name");
  assertEqual(draft.salePrice, "777", "prefill sale");
  assertEqual(draft.promotionType, "personal_countdown", "prefill type");
  assertEqual(draft.durationAmount, "2", "prefill duration amount");
  assertEqual(draft.durationUnit, "hours", "prefill duration unit");
  assertEqual(draft.aboveTimerText, "Над таймером: {time_left}", "prefill above");
  assertEqual(draft.belowButtonText, "Под кнопкой {full_price}", "prefill below");

  const calendar = promotionToFormDraft(
    savedPromotionRow({
      promotion_type: "calendar",
      starts_at: "2026-08-23T10:00:00.000Z",
      ends_at: "2026-08-24T10:00:00.000Z",
      duration_seconds: null,
    }),
  );
  assertEqual(calendar.promotionType, "calendar", "calendar type");
  assertEqual(
    calendar.startsAt,
    toDatetimeLocalValue("2026-08-23T10:00:00.000Z"),
    "calendar start local",
  );
  assertEqual(
    calendar.endsAt,
    toDatetimeLocalValue("2026-08-24T10:00:00.000Z"),
    "calendar end local",
  );

  const duration = durationSecondsToAmountUnit(3 * 86_400);
  assertEqual(duration.amount, 3, "3 days amount");
  assertEqual(duration.unit, "days", "3 days unit");

  draft.name = "Ночное окно";
  draft.salePrice = "399";
  draft.durationAmount = "45";
  draft.durationUnit = "minutes";
  draft.aboveTimerText = "Новый текст над {time_left}";
  draft.belowButtonText = "Новый текст под {full_price}";

  const writeBody = buildPromotionWriteBody(draft, { isActive: row.is_active });
  assertEqual(writeBody.is_active, false, "edit keeps disabled");
  assertEqual(writeBody.name, "Ночное окно", "write name");
  assertEqual(writeBody.sale_price, 399, "write sale");
  assertEqual(writeBody.duration_seconds, 45 * 60, "write duration");
  assertEqual(writeBody.above_timer_text, "Новый текст над {time_left}", "write above");
  assertEqual(writeBody.below_button_text, "Новый текст под {full_price}", "write below");
  assert(!("start_token" in writeBody), "write body does not rotate token");
  assert(!("practice_id" in writeBody), "write body does not reassign product");

  const parsed = buildPromotionPatchUpdates(writeBody, 4999);
  assert(parsed.ok, "full edit validates");
  if (!parsed.ok) {
    return;
  }
  assertEqual(parsed.updates.is_active, false, "patch keeps disabled");
  assert(!("start_token" in parsed.updates), "patch omits start_token");
  assert(!("practice_id" in parsed.updates), "patch omits practice_id");
  assert(!("id" in parsed.updates), "patch omits id");

  const store = [row];
  const updated = applyPromotionUpdate(store, "practice-1", "promo-1", parsed.updates);
  assert(updated.ok, "same id updates");
  assertEqual(updated.store.length, 1, "no second row");
  assertEqual(updated.store[0].id, "promo-1", "same promotion id");
  assertEqual(updated.store[0].start_token, "token-1", "token unchanged");
  assertEqual(updated.store[0].practice_id, "practice-1", "product unchanged");
  assertEqual(updated.store[0].is_active, false, "status preserved");
  assertEqual(updated.store[0].name, "Ночное окно", "name persisted");
  assertEqual(updated.store[0].sale_price, 399, "sale persisted");
  assertEqual(updated.store[0].duration_seconds, 2700, "duration persisted");
  assertEqual(
    updated.store[0].above_timer_text,
    "Новый текст над {time_left}",
    "above persisted",
  );
  assertEqual(
    updated.store[0].below_button_text,
    "Новый текст под {full_price}",
    "below persisted",
  );

  const cancelled = applyPromotionUpdate(store, "practice-1", "promo-1", {});
  assertEqual(cancelled.store[0].name, row.name, "cancel leaves name");
  assertEqual(
    cancelled.store[0].above_timer_text,
    row.above_timer_text,
    "cancel leaves above",
  );
  assertEqual(EMPTY_AUTHOR_PROMOTION_FORM.name, "", "cancel returns empty create draft");
}

function testAuthorPromotionEditOwnershipGate() {
  const own = savedPromotionRow();
  const foreign = savedPromotionRow({
    id: "promo-other",
    practice_id: "practice-other",
    name: "Чужая акция",
  });
  const store = [own, foreign];

  const swapped = applyPromotionUpdate(store, "practice-1", "promo-other", {
    name: "hack",
  });
  assert(!swapped.ok, "id swap against another product is rejected");
  assertEqual(swapped.store[1].name, "Чужая акция", "foreign row unchanged");

  const otherPractice = applyPromotionUpdate(store, "practice-other", "promo-1", {
    name: "hack",
  });
  assert(!otherPractice.ok, "own id on another practice is rejected");
  assertEqual(otherPractice.store[0].name, "Funnel 499", "own row unchanged");

  assert(
    !promotionMatchesPractice(own, "practice-other", own.id),
    "owner/product mismatch",
  );
  assert(
    promotionMatchesPractice(own, "practice-1", "promo-1"),
    "matching practice and id",
  );

  const omittedActive = buildPromotionPatchUpdates(
    {
      name: "Только тексты",
      promotion_type: "personal_countdown",
      sale_price: 499,
      duration_seconds: 1200,
      above_timer_text: "x {time_left}",
      below_button_text: "y {full_price}",
    },
    4999,
  );
  assert(omittedActive.ok, "full write without is_active is valid");
  if (omittedActive.ok) {
    assert(
      !("is_active" in omittedActive.updates),
      "omitted is_active is not forced true",
    );
  }
}

function testAuthorPromotionEditKeepsExistingStartSnapshot() {
  const original = promotion({
    name: "Funnel 499",
    salePrice: 499,
    durationSeconds: 20 * 60,
    aboveTimerText: "Старый над {time_left}",
    belowButtonText: "Старый под {full_price}",
    isActive: true,
    startToken: "token-1",
  });
  const buyerNow = new Date("2026-08-23T10:00:00.000Z");
  const first = startPersonalCountdown({
    store: [],
    promotionId: original.id,
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    now: buyerNow,
    durationSeconds: original.durationSeconds,
    salePriceSnapshot: original.salePrice,
    id: "buyer-start-1",
  });
  assert(first.created, "buyer start inserts");
  assertEqual(first.start.salePriceSnapshot, 499, "buyer start snapshots 499");
  assertEqual(first.start.expiresAt, "2026-08-23T10:20:00.000Z", "buyer window 20 min");

  const draft = promotionToFormDraft({
    name: original.name,
    promotion_type: original.promotionType,
    sale_price: original.salePrice,
    starts_at: original.startsAt,
    ends_at: original.endsAt,
    duration_seconds: original.durationSeconds,
    above_timer_text: original.aboveTimerText,
    below_button_text: original.belowButtonText,
  });
  draft.name = "Funnel 699";
  draft.salePrice = "699";
  draft.durationAmount = "45";
  draft.durationUnit = "minutes";
  draft.aboveTimerText = "Новый над {time_left}";
  draft.belowButtonText = "Новый под {full_price}";

  const writeBody = buildPromotionWriteBody(draft, { isActive: true });
  const parsed = buildPromotionPatchUpdates(writeBody, 4999);
  assert(parsed.ok, "author edit validates");
  if (!parsed.ok) {
    return;
  }

  const promoStore = [
    savedPromotionRow({
      name: original.name,
      sale_price: 499,
      duration_seconds: 20 * 60,
      above_timer_text: original.aboveTimerText,
      below_button_text: original.belowButtonText,
      is_active: true,
      start_token: "token-1",
    }),
  ];
  const updated = applyPromotionUpdate(
    promoStore,
    "practice-1",
    "promo-1",
    parsed.updates,
  );
  assert(updated.ok, "edit updates same row");
  assertEqual(updated.store.length, 1, "edit does not insert a second promotion");
  assertEqual(updated.store[0].id, "promo-1", "promotion id unchanged");
  assertEqual(updated.store[0].start_token, "token-1", "start_token unchanged");
  assertEqual(updated.store[0].is_active, true, "enabled preserved");
  assertEqual(updated.store[0].sale_price, 699, "live sale_price is 699");
  assertEqual(updated.store[0].duration_seconds, 45 * 60, "live duration is 45 min");

  const editedPromo = promotion({
    name: "Funnel 699",
    salePrice: 699,
    durationSeconds: 45 * 60,
    aboveTimerText: "Новый над {time_left}",
    belowButtonText: "Новый под {full_price}",
    startToken: "token-1",
    isActive: true,
  });
  const during = new Date("2026-08-23T10:10:00.000Z");

  assertEqual(first.start.salePriceSnapshot, 499, "edit does not rewrite snapshot");
  assertEqual(
    first.start.expiresAt,
    "2026-08-23T10:20:00.000Z",
    "edit does not rewrite expires_at",
  );
  assertEqual(first.store.length, 1, "edit writes no start rows");

  const existingProduct = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [editedPromo],
    starts: first.store,
    surface: PRICE_SURFACES.PRODUCT,
    now: during,
  });
  assertEqual(existingProduct.finalPrice, 499, "existing buyer PDP=499");
  assertEqual(existingProduct.salePrice, 499, "existing buyer sale is snapshot");
  assertEqual(
    existingProduct.promotion?.name,
    "Funnel 699",
    "name edit is live immediately",
  );
  assertEqual(
    existingProduct.promotion?.aboveTimerText,
    "Новый над {time_left}",
    "text edits visible immediately",
  );
  assertEqual(
    existingProduct.promotion?.belowButtonText,
    "Новый под {full_price}",
    "below copy follows current row",
  );
  assertEqual(
    existingProduct.promotion?.expiresAt,
    first.start.expiresAt,
    "existing timer still uses original expires_at",
  );

  const existingCheckout = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [editedPromo],
    starts: first.store,
    surface: PRICE_SURFACES.CHECKOUT,
    now: during,
  });
  assertEqual(existingCheckout.finalPrice, 499, "existing buyer checkout=499");
  assertEqual(existingCheckout.salePrice, 499, "checkout uses snapshot, not live 699");

  const preview = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: editedPromo,
    now: during,
  });
  assert(preview, "promo_preview resolves from live promotion");
  assertEqual(preview.finalPrice, 699, "author promo_preview=699");
  assertEqual(preview.salePrice, 699, "preview uses live promotion.sale_price");
  assertEqual(
    preview.promotion?.expiresAt,
    new Date(during.getTime() + 45 * 60 * 1000).toISOString(),
    "preview synthesizes the newly saved duration",
  );
  assertEqual(first.store.length, 1, "promo_preview writes no starts");

  const reuse = startPersonalCountdown({
    store: first.store,
    promotionId: editedPromo.id,
    visitorId: first.start.visitorId,
    userId: null,
    now: during,
    durationSeconds: editedPromo.durationSeconds,
    salePriceSnapshot: editedPromo.salePrice,
    id: "must-not-create",
  });
  assert(!reuse.created, "duration/price edit does not create a second start");
  assertEqual(reuse.store.length, 1, "still one start row");
  assertEqual(reuse.start.salePriceSnapshot, 499, "reuse keeps snapshot 499");
  assertEqual(reuse.start.expiresAt, first.start.expiresAt, "reuse keeps expires_at");
  assertEqual(reuse.start.startedAt, first.start.startedAt, "started_at kept");

  const newer = startPersonalCountdown({
    store: first.store,
    promotionId: editedPromo.id,
    visitorId: "22222222-2222-4222-8222-222222222222",
    userId: null,
    now: during,
    durationSeconds: editedPromo.durationSeconds,
    salePriceSnapshot: editedPromo.salePrice,
    id: "buyer-start-2",
  });
  assert(newer.created, "new buyer start inserts");
  assertEqual(newer.start.salePriceSnapshot, 699, "new buyer start snapshot=699");
  assertEqual(
    newer.start.expiresAt,
    new Date(during.getTime() + 45 * 60 * 1000).toISOString(),
    "new start uses new duration",
  );

  const disabledStore = [
    savedPromotionRow({
      is_active: false,
      start_token: "token-1",
    }),
  ];
  const disabledWrite = buildPromotionWriteBody(draft, { isActive: false });
  const disabledParsed = buildPromotionPatchUpdates(disabledWrite, 4999);
  assert(disabledParsed.ok, "disabled edit validates");
  if (!disabledParsed.ok) {
    return;
  }
  const disabledUpdated = applyPromotionUpdate(
    disabledStore,
    "practice-1",
    "promo-1",
    disabledParsed.updates,
  );
  assertEqual(disabledUpdated.store.length, 1, "disabled edit still one row");
  assertEqual(disabledUpdated.store[0].id, "promo-1", "disabled edit keeps id");
  assertEqual(
    disabledUpdated.store[0].start_token,
    "token-1",
    "disabled edit keeps start_token",
  );
  assertEqual(disabledUpdated.store[0].is_active, false, "disabled preserved");
}

function testAuthorPromoPreviewUsesUpdatedRowById() {
  const updated = promotion({
    id: "promo-1",
    name: "После правки",
    salePrice: 333,
    durationSeconds: 45 * 60,
    aboveTimerText: "Превью {time_left}",
    belowButtonText: "Превью {full_price}",
    startToken: "token-must-not-be-used",
  });
  const now = new Date("2026-08-23T12:00:00.000Z");
  const preview = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: updated,
    now,
  });

  assert(preview, "preview resolves from promotion id row");
  assertEqual(preview.finalPrice, 333, "preview uses newly saved price");
  assertEqual(preview.promotion?.name, "После правки", "preview uses newly saved name");
  assertEqual(
    preview.promotion?.aboveTimerText,
    "Превью {time_left}",
    "preview uses newly saved above text",
  );
  assertEqual(
    preview.promotion?.belowButtonText,
    "Превью {full_price}",
    "preview uses newly saved below text",
  );
  assertEqual(
    preview.promotion?.expiresAt,
    new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
    "preview synthesizes duration from the current row",
  );
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
    assertEqual(ok.aboveTimerText, null, "missing copy stays null");
    assertEqual(ok.belowButtonText, null, "missing copy stays null");
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

function testPersonalStartKeepsSalePriceSnapshot() {
  const now = new Date("2026-08-23T10:00:00.000Z");
  const during = new Date("2026-08-23T10:10:00.000Z");
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const newVisitor = "22222222-2222-4222-8222-222222222222";

  const first = startPersonalCountdown({
    store: [],
    promotionId: "promo-1",
    visitorId,
    userId: null,
    now,
    durationSeconds: 20 * 60,
    salePriceSnapshot: 499,
    id: "snap-1",
  });
  assertEqual(first.start.salePriceSnapshot, 499, "A: first start freezes 499");

  const live699 = promotion({
    salePrice: 699,
    name: "Funnel 699",
    aboveTimerText: "New headline {time_left}",
    belowButtonText: "New note {full_price}",
    durationSeconds: 10 * 60,
  });

  const reuse = startPersonalCountdown({
    store: first.store,
    promotionId: "promo-1",
    visitorId,
    userId: null,
    now: during,
    durationSeconds: 10 * 60,
    salePriceSnapshot: 699,
    id: "snap-reuse",
  });
  assert(!reuse.created, "A/B: reuse does not insert");
  assertEqual(reuse.start.salePriceSnapshot, 499, "A: reuse keeps snapshot 499");
  assertEqual(reuse.start.expiresAt, first.start.expiresAt, "B: reuse keeps expires_at");

  const existingProduct = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [live699],
    starts: startsForSubject(reuse.store, visitorId, null),
    surface: PRICE_SURFACES.PRODUCT,
    now: during,
  });
  assertEqual(existingProduct.finalPrice, 499, "A: existing PDP stays 499");
  assertEqual(existingProduct.salePrice, 499, "A: existing salePrice is snapshot");
  assertEqual(existingProduct.promotion?.salePrice, 499, "A: resolved promo uses snapshot");
  assertEqual(existingProduct.promotion?.name, "Funnel 699", "C: live name is visible");
  assertEqual(
    existingProduct.promotion?.aboveTimerText,
    "New headline {time_left}",
    "C: live above copy is visible",
  );
  assertEqual(
    existingProduct.promotion?.belowButtonText,
    "New note {full_price}",
    "C: live below copy is visible",
  );

  const existingCheckout = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [live699],
    starts: startsForSubject(reuse.store, visitorId, null),
    surface: PRICE_SURFACES.CHECKOUT,
    now: during,
  });
  assertEqual(existingCheckout.finalPrice, 499, "A: existing checkout stays 499");
  assertEqual(existingCheckout.finalPriceMinor, 49900, "A: checkout minor is 49900");

  const newer = startPersonalCountdown({
    store: reuse.store,
    promotionId: "promo-1",
    visitorId: newVisitor,
    userId: null,
    now: during,
    durationSeconds: 10 * 60,
    salePriceSnapshot: 699,
    id: "snap-new",
  });
  assert(newer.created, "A: new visitor inserts");
  assertEqual(newer.start.salePriceSnapshot, 699, "A: new visitor snapshots 699");
  assertEqual(newer.start.expiresAt, "2026-08-23T10:20:00.000Z", "B: new start uses new duration");

  const newProduct = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [live699],
    starts: startsForSubject(newer.store, newVisitor, null),
    surface: PRICE_SURFACES.PRODUCT,
    now: during,
  });
  assertEqual(newProduct.finalPrice, 699, "A: new visitor PDP is 699");

  const afterExpiry = new Date("2026-08-23T10:25:00.000Z");
  const expiredRepeat = startPersonalCountdown({
    store: reuse.store,
    promotionId: "promo-1",
    visitorId,
    userId: null,
    now: afterExpiry,
    durationSeconds: 10 * 60,
    salePriceSnapshot: 699,
    id: "snap-expired",
  });
  assert(!expiredRepeat.created, "D: ?promo= after expiry does not restart");
  assertEqual(expiredRepeat.start.expiresAt, first.start.expiresAt, "D: expired window kept");
  const expiredPrice = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [live699],
    starts: startsForSubject(expiredRepeat.store, visitorId, null),
    surface: PRICE_SURFACES.PRODUCT,
    now: afterExpiry,
  });
  assertEqual(expiredPrice.finalPrice, 4999, "D: expired start is base price");
  assertEqual(expiredPrice.promotion, null, "D: no promo after expiry");

  const guest = startPersonalCountdown({
    store: [],
    promotionId: "promo-1",
    visitorId,
    userId: null,
    now,
    durationSeconds: 20 * 60,
    salePriceSnapshot: 499,
    id: "snap-guest",
  });
  const bound = bindPersonalStarts(guest.store, visitorId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assertEqual(bound[0].salePriceSnapshot, 499, "E: bind keeps guest snapshot");
  const afterBind = startPersonalCountdown({
    store: bound,
    promotionId: "promo-1",
    visitorId,
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    now: during,
    durationSeconds: 10 * 60,
    salePriceSnapshot: 699,
    id: "snap-bind-reuse",
  });
  assert(!afterBind.created, "E: login does not create a start");
  assertEqual(afterBind.start.salePriceSnapshot, 499, "E: login does not copy live 699");
  const loginCheckout = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [live699],
    starts: startsForSubject(
      afterBind.store,
      visitorId,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ),
    surface: PRICE_SURFACES.CHECKOUT,
    now: during,
  });
  assertEqual(loginCheckout.finalPrice, 499, "E: guest→login checkout stays 499");

  const disabled = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [promotion({ salePrice: 699, isActive: false })],
    starts: [start({ salePriceSnapshot: 499 })],
    surface: PRICE_SURFACES.PRODUCT,
    now: during,
  });
  assertEqual(disabled.finalPrice, 4999, "disable stops applying the offer");
  assertEqual(disabled.promotion, null, "disable drops the promotion");

  const calendar = promotion({
    id: "cal-1",
    promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
    salePrice: 888,
    startsAt: "2026-08-23T09:00:00.000Z",
    endsAt: "2026-08-23T18:00:00.000Z",
    durationSeconds: null,
  });
  const catalogCalendar = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [calendar],
    starts: [],
    surface: PRICE_SURFACES.CATALOG,
    now: during,
  });
  assertEqual(catalogCalendar.finalPrice, 888, "F: catalog calendar still applies");

  const personalPlusCalendar = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [live699, calendar],
    starts: [start({ salePriceSnapshot: 499 })],
    surface: PRICE_SURFACES.PRODUCT,
    now: during,
  });
  assertEqual(personalPlusCalendar.finalPrice, 499, "F: snapshot still wins over higher calendar");
  assertEqual(
    personalPlusCalendar.promotion?.promotionType,
    "personal_countdown",
    "F: personal snapshot is the winner",
  );

  const expiredPersonalCalendar = resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: [live699, calendar],
    starts: [start({ salePriceSnapshot: 499, expiresAt: "2026-08-23T10:05:00.000Z" })],
    surface: PRICE_SURFACES.PRODUCT,
    now: during,
  });
  assertEqual(expiredPersonalCalendar.finalPrice, 888, "F: calendar applies after personal expiry");

  const parallelA = start({
    id: "parallel-a",
    startedAt: "2026-08-23T10:00:00.000Z",
    expiresAt: "2026-08-23T10:20:00.000Z",
    salePriceSnapshot: 499,
  });
  const parallelB = start({
    id: "parallel-b",
    startedAt: "2026-08-23T10:00:01.000Z",
    expiresAt: "2026-08-23T10:20:01.000Z",
    salePriceSnapshot: 699,
  });
  const merged = mergeParallelPersonalStarts(parallelA, parallelB);
  assertEqual(merged.length, 1, "parallel keeps one canonical start");
  assertEqual(merged[0].salePriceSnapshot, 499, "canonical start keeps earliest snapshot");
}

function testSnapshotOnlyAppliesBelowCurrentBase() {
  const visitorStart = start({ salePriceSnapshot: 499 });
  const during = new Date("2026-08-23T10:10:00.000Z");
  const promo = promotion();

  const afterLoweredBase = (surface) =>
    resolvePracticePrice({
      isFree: false,
      basePrice: 399,
      promotions: [promo],
      starts: [visitorStart],
      surface,
      now: during,
    });

  const product = afterLoweredBase(PRICE_SURFACES.PRODUCT);
  assertEqual(product.finalPrice, 399, "1: PDP uses current base when snapshot >= base");
  assertEqual(product.salePrice, null, "1: snapshot 499 is not applied against base 399");
  assertEqual(product.promotion, null, "1: no promo when snapshot is not below base");

  const checkout = afterLoweredBase(PRICE_SURFACES.CHECKOUT);
  assertEqual(checkout.finalPrice, 399, "1: checkout uses current base 399");
  assertEqual(checkout.finalPriceMinor, 39900, "1: checkout minor is 39900");
  assertEqual(visitorStart.salePriceSnapshot, 499, "1: start snapshot is not rewritten");
  assertEqual(
    visitorStart.expiresAt,
    "2026-08-23T10:20:00.000Z",
    "1: start expires_at is not rewritten",
  );

  const afterRaisedBase = (surface) =>
    resolvePracticePrice({
      isFree: false,
      basePrice: 5999,
      promotions: [promo],
      starts: [visitorStart],
      surface,
      now: during,
    });

  const raisedProduct = afterRaisedBase(PRICE_SURFACES.PRODUCT);
  assertEqual(raisedProduct.finalPrice, 499, "2: raised base keeps snapshot 499 on PDP");
  assertEqual(raisedProduct.salePrice, 499, "2: snapshot still applies below 5999");

  const raisedCheckout = afterRaisedBase(PRICE_SURFACES.CHECKOUT);
  assertEqual(raisedCheckout.finalPrice, 499, "2: raised base keeps snapshot 499 at checkout");
  assertEqual(visitorStart.salePriceSnapshot, 499, "2: start snapshot still untouched");
  assertEqual(
    visitorStart.expiresAt,
    "2026-08-23T10:20:00.000Z",
    "2: start expires_at still untouched",
  );

  const catalogLowered = resolvePracticePrice({
    isFree: false,
    basePrice: 399,
    promotions: [promo],
    starts: [visitorStart],
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: true,
    now: during,
  });
  assertEqual(
    catalogLowered.finalPrice,
    399,
    "catalog teaser also drops snapshot when it is not below current base",
  );
  assertEqual(catalogLowered.promotion, null, "catalog has no teaser when snapshot is invalid");

  const catalogRaised = resolvePracticePrice({
    isFree: false,
    basePrice: 5999,
    promotions: [promo],
    starts: [visitorStart],
    surface: PRICE_SURFACES.CATALOG,
    catalogPersonalTeaser: true,
    now: during,
  });
  assertEqual(catalogRaised.finalPrice, 499, "catalog ACTIVE stays on snapshot below raised base");
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
  assert(oneshot.includes("WHEN unique_violation THEN"), "bind catches unique conflict");
  assert(oneshot.includes("row_number() OVER"), "upgrade detaches duplicate user_id");

  const qualify = readFileSync(
    join(
      ROOT,
      "supabase/migrations/20260823190000_start_practice_price_promotion_qualify_identifiers.sql",
    ),
    "utf8",
  );
  assert(qualify.includes("CREATE OR REPLACE FUNCTION public.start_practice_price_promotion"), "qualify hotfix");
  assert(qualify.includes("starts.promotion_id"), "qualified promotion_id");
  assert(!qualify.includes("RETURNING *"), "no RETURNING * in hotfix");

  const copyMigration = readFileSync(
    join(ROOT, "supabase/migrations/20260830120000_personal_timer_promotion_copy.sql"),
    "utf8",
  );
  assert(copyMigration.includes("above_timer_text"), "copy column");
  assert(copyMigration.includes("below_button_text"), "below copy column");

  const snapshotMigration = readFileSync(
    join(ROOT, "supabase/migrations/20260831120000_personal_start_sale_price_snapshot.sql"),
    "utf8",
  );
  assert(snapshotMigration.includes("sale_price_snapshot"), "snapshot column");
  assert(snapshotMigration.includes("sale_price := v_existing.sale_price_snapshot"), "reuse returns snapshot");
  assert(snapshotMigration.includes("canonical.sale_price_snapshot"), "resolve uses snapshot");
  assert(
    snapshotMigration.includes("canonical.sale_price_snapshot > 0") &&
      snapshotMigration.includes("canonical.sale_price_snapshot < v_practice.price"),
    "snapshot applies only below current base",
  );
  assert(!snapshotMigration.includes("sale_price := v_promo.sale_price"), "start no longer returns live sale on reuse");
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

  const promoForm = readFileSync(
    join(ROOT, "src/components/author-dashboard/AuthorProductPromotions.tsx"),
    "utf8",
  );
  assert(promoForm.includes("Текст над таймером"), "above-timer label");
  assert(promoForm.includes("Текст под кнопкой"), "below-button label");
  assert(promoForm.includes("DEFAULT_PERSONAL_TIMER_ABOVE_TEXT"), "default above");
  assert(promoForm.includes("DEFAULT_PERSONAL_TIMER_BELOW_TEXT"), "default below");
  assert(promoForm.includes("above_timer_text"), "saves above copy");
  assert(promoForm.includes("below_button_text"), "saves below copy");
  assert(promoForm.includes("Предпросмотр акции"), "author promo preview button");
  assert(promoForm.includes("Редактировать"), "edit button on saved card");
  assert(promoForm.includes("Сохранить изменения"), "edit submit label");
  assert(promoForm.includes("Отмена"), "edit cancel label");
  assert(promoForm.includes("promotionToFormDraft"), "edit reuses form draft");
  assert(promoForm.includes("buildPromotionWriteBody"), "edit reuses write body");
  assert(promoForm.includes("method: editingRow ? \"PATCH\" : \"POST\""), "edit patches same id");
  const cardActions = promoForm.slice(promoForm.indexOf("data-author-promo-preview"));
  const previewIdx = cardActions.indexOf("Предпросмотр акции");
  const editIdx = cardActions.indexOf("Редактировать");
  const toggleIdx = cardActions.indexOf("Выключить");
  const deleteIdx = cardActions.indexOf("Удалить");
  assert(previewIdx >= 0 && previewIdx < editIdx, "preview before edit");
  assert(editIdx < toggleIdx, "edit before toggle");
  assert(toggleIdx < deleteIdx, "toggle before delete");
  assert(promoForm.includes("buildPracticePromoPreviewPath"), "preview uses promotion id path");
  const previewHref = promoForm.slice(promoForm.indexOf("buildPracticePromoPreviewPath"));
  assert(previewHref.includes("row.id"), "preview href uses promotion id");
  assert(
    !previewHref.slice(0, 180).includes("start_token"),
    "preview href must not use start_token",
  );

  const patchRoute = readFileSync(
    join(
      ROOT,
      "src/app/api/author/products/[id]/price-promotions/[promotionId]/route.ts",
    ),
    "utf8",
  );
  assert(patchRoute.includes("requirePracticeMutationAccess"), "update uses create/delete rights");
  assert(patchRoute.includes("buildPromotionPatchUpdates"), "update reuses write schema");
  assert(patchRoute.includes('.eq("id", promotionId)'), "update gated by promotion id");
  assert(patchRoute.includes('.eq("practice_id", id)'), "update gated by practice id");
  assert(!patchRoute.includes("start_token"), "update never writes start_token");
  assert(
    !patchRoute.includes("practice_price_promotion_starts"),
    "author edit never rewrites existing starts or their snapshot",
  );

  const offer = readFileSync(
    join(ROOT, "src/components/pricing/ProductPriceOffer.tsx"),
    "utf8",
  );
  assert(offer.includes("buildPersonalTimerOfferCopy"), "PDP substitutes copy");
  assert(!offer.includes("4 999"), "no hardcoded ruble amount");

  const catalogListing = readFileSync(
    join(ROOT, "src/lib/pricing/catalog-listing.ts"),
    "utf8",
  );
  assert(catalogListing.includes("buildPracticePromoStartPath"), "catalog href uses path helper");
  assert(catalogListing.includes("NEVER_STARTED"), "catalog distinguishes never started");
  assert(
    !catalogListing.includes("ensurePriceVisitorId"),
    "catalog listing price view does not mint a visitor",
  );
  assert(
    !catalogListing.includes("start_practice_price_promotion"),
    "catalog listing does not start a promotion",
  );

  const catalogFetch = readFileSync(join(ROOT, "src/lib/products/catalog.ts"), "utf8");
  assert(catalogFetch.includes("buildCatalogListingPriceView"), "catalog products use listing view");
  assert(
    !catalogFetch.includes("start_practice_price_promotion"),
    "catalog GET does not start a promotion",
  );
  assert(
    !catalogFetch.includes("ensurePriceVisitorId"),
    "catalog product fetch does not mint a visitor cookie",
  );

  const startSelect = readFileSync(join(ROOT, "src/lib/pricing/map.ts"), "utf8");
  assert(startSelect.includes("sale_price_snapshot"), "start select loads snapshot");

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
  testCatalogPersonalTeaserStates();
  testCatalogPersonalTeaserVersusCalendar();
  testOneShotPersonalCountdown();
  testBindVisitorAndUserRowsKeepsEarliestWindow();
  testGuestLoginKeepsOriginalWindow();
  testGuestExpiryThenLoginDoesNotRevive();
  testParallelStartsShareOneWindow();
  testCanonicalStartIgnoresLaterStrayWindow();
  testExpiredPersonalPromo();
  testFrontendTamperRejected();
  testOrderSnapshotShape();
  testAuthorPromotionEditPrefillAndPersist();
  testAuthorPromotionEditOwnershipGate();
  testAuthorPromotionEditKeepsExistingStartSnapshot();
  testAuthorPromoPreviewUsesUpdatedRowById();
  testPersonalStartKeepsSalePriceSnapshot();
  testSnapshotOnlyAppliesBelowCurrentBase();
  testAuthorPromotionValidation();
  testPurchaseRegressionStillUsesIntegerRubles();
  testMigrationContract();
  testSourceContracts();
  console.log("price-promotions-unit: ok");
}

main();
