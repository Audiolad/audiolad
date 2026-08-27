#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter";
import { mapCatalogProductToListingItem } from "../src/lib/catalog/listing";
import {
  readPaidCatalogOfferCompareAtLabel,
  readPaidCatalogOfferPriceLabel,
} from "../src/lib/catalog/offer";
import { buildCatalogListingPriceView } from "../src/lib/pricing/catalog-listing";
import {
  bindPersonalStarts,
  classifyPersonalCountdownViewerState,
  PERSONAL_COUNTDOWN_VIEWER_STATES,
  startPersonalCountdown,
  startsForSubject,
} from "../src/lib/pricing/personal-start";
import { resolvePracticePrice } from "../src/lib/pricing/resolve";
import {
  PRICE_PROMOTION_TYPES,
  PRICE_SURFACES,
  type PersonalPromotionStart,
  type PricePromotionRecord,
} from "../src/lib/pricing/types";
import { formatRubles } from "../src/lib/products/price-format";
import {
  buildPracticePromoStartPath,
  buildPracticePublicPath,
} from "../src/lib/products/paths";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function promotion(
  overrides: Partial<PricePromotionRecord> = {},
): PricePromotionRecord {
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

function calendarPromotion(
  overrides: Partial<PricePromotionRecord> = {},
): PricePromotionRecord {
  return promotion({
    id: "promo-cal",
    name: "Weekend",
    promotionType: PRICE_PROMOTION_TYPES.CALENDAR,
    salePrice: 888,
    startsAt: "2026-08-23T09:00:00.000Z",
    endsAt: "2026-08-23T18:00:00.000Z",
    durationSeconds: null,
    startToken: "token-cal",
    ...overrides,
  });
}

function catalogView(input: {
  starts?: PersonalPromotionStart[];
  promotions?: PricePromotionRecord[];
  now?: Date;
  isFree?: boolean;
  basePrice?: number;
  personalTeaser?: boolean;
}) {
  return buildCatalogListingPriceView({
    isFree: input.isFree ?? false,
    basePrice: input.basePrice ?? 4999,
    promotions: input.promotions ?? [promotion()],
    starts: input.starts ?? [],
    authorSlug: "anna",
    productSlug: "morning",
    now: input.now ?? new Date("2026-08-23T10:10:00.000Z"),
    personalTeaser: input.personalTeaser ?? true,
  });
}

function productPrice(input: {
  starts: PersonalPromotionStart[];
  now: Date;
  promotions?: PricePromotionRecord[];
}) {
  return resolvePracticePrice({
    isFree: false,
    basePrice: 4999,
    promotions: input.promotions ?? [promotion()],
    starts: input.starts,
    now: input.now,
    surface: PRICE_SURFACES.PRODUCT,
  });
}

function assertStruckSale(view: ReturnType<typeof catalogView>, message: string) {
  assert.equal(view.price, 499, `${message}: sale`);
  assert.equal(view.compareAtPrice, 4999, `${message}: compare-at`);
  assert.equal(view.priceLabel, formatRubles(499), `${message}: sale label`);
  assert.equal(
    view.compareAtPriceLabel,
    formatRubles(4999),
    `${message}: struck label`,
  );
}

function assertBaseOnly(view: ReturnType<typeof catalogView>, message: string) {
  assert.equal(view.price, 4999, `${message}: base price`);
  assert.equal(view.compareAtPrice, null, `${message}: no compare-at`);
  assert.equal(view.resolved.promotion, null, `${message}: no promo`);
  assert.equal(view.href, "/practice/anna/morning", `${message}: canonical href`);
}

function testGuestNeverStartedActiveExpired() {
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const startAt = new Date("2026-08-23T10:00:00.000Z");
  const during = new Date("2026-08-23T10:10:00.000Z");
  const after = new Date("2026-08-23T10:25:00.000Z");
  const promo = promotion();

  const neverStarted = catalogView({ starts: [], now: during });
  assertStruckSale(neverStarted, "guest never-started catalog");
  assert.equal(
    classifyPersonalCountdownViewerState(promo, [], during.getTime()),
    PERSONAL_COUNTDOWN_VIEWER_STATES.NEVER_STARTED,
  );
  assert.equal(
    neverStarted.href,
    buildPracticePromoStartPath("anna", "morning", "token-1"),
    "never-started href uses existing ?promo=",
  );
  assert.equal(neverStarted.resolved.promotion?.expiresAt ?? null, null, "no catalog timer");

  const first = startPersonalCountdown({
    store: [],
    promotionId: promo.id,
    visitorId,
    userId: null,
    now: startAt,
    durationSeconds: 20 * 60,
    id: "start-1",
  });
  assert.equal(first.created, true, "catalog click starts once");
  assert.equal(first.store.length, 1, "starts=1 after first PDP");

  const pdp = productPrice({ starts: first.store, now: during });
  assert.equal(pdp.finalPrice, 499, "PDP sale after start");
  assert.equal(pdp.promotion?.expiresAt, first.start.expiresAt, "PDP remaining window");

  const refresh = startPersonalCountdown({
    store: first.store,
    promotionId: promo.id,
    visitorId,
    userId: null,
    now: during,
    durationSeconds: 20 * 60,
    id: "start-refresh",
  });
  assert.equal(refresh.created, false, "refresh reuses start");
  assert.equal(refresh.start.startedAt, first.start.startedAt, "same started_at");
  assert.equal(refresh.start.expiresAt, first.start.expiresAt, "same expires_at");

  const activeCatalog = catalogView({ starts: first.store, now: during });
  assertStruckSale(activeCatalog, "guest active catalog");
  assert.equal(activeCatalog.href, "/practice/anna/morning", "active href is canonical");

  const expiredCatalog = catalogView({ starts: first.store, now: after });
  assertBaseOnly(expiredCatalog, "guest expired catalog");
  const expiredPdp = productPrice({ starts: first.store, now: after });
  assert.equal(expiredPdp.finalPrice, 4999, "expired PDP is base");
  assert.equal(expiredPdp.promotion, null, "expired PDP has no sale");

  const clickAfterExpiry = startPersonalCountdown({
    store: first.store,
    promotionId: promo.id,
    visitorId,
    userId: null,
    now: after,
    durationSeconds: 20 * 60,
    id: "start-after",
  });
  assert.equal(clickAfterExpiry.created, false, "expired click does not restart");
  assert.equal(clickAfterExpiry.store.length, 1, "starts still 1");
  assert.equal(clickAfterExpiry.start.expiresAt, first.start.expiresAt, "expires_at unchanged");
}

function testSignedInSameSemantics() {
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const startAt = new Date("2026-08-23T10:00:00.000Z");
  const during = new Date("2026-08-23T10:10:00.000Z");
  const after = new Date("2026-08-23T10:25:00.000Z");

  const neverStarted = catalogView({ starts: [], now: during });
  assertStruckSale(neverStarted, "signed-in never-started catalog");
  assert.equal(
    neverStarted.href,
    "/practice/anna/morning?promo=token-1",
    "signed-in never-started still uses ?promo=",
  );

  const first = startPersonalCountdown({
    store: [],
    promotionId: "promo-1",
    visitorId,
    userId,
    now: startAt,
    durationSeconds: 20 * 60,
    id: "user-start-1",
  });
  assert.equal(first.created, true, "signed-in first PDP starts once");
  assert.equal(first.start.userId, userId, "start binds user_id");

  const subject = startsForSubject(first.store, visitorId, userId);
  assertStruckSale(catalogView({ starts: subject, now: during }), "signed-in active catalog");
  assert.equal(
    catalogView({ starts: subject, now: during }).href,
    "/practice/anna/morning",
    "signed-in active href is canonical",
  );
  assert.equal(productPrice({ starts: subject, now: during }).finalPrice, 499, "signed-in PDP sale");

  const afterExpiry = startPersonalCountdown({
    store: first.store,
    promotionId: "promo-1",
    visitorId,
    userId,
    now: after,
    durationSeconds: 20 * 60,
    id: "user-after",
  });
  assert.equal(afterExpiry.created, false, "signed-in expiry does not restart");
  assert.equal(afterExpiry.store.length, 1, "signed-in starts still 1");
  assertBaseOnly(
    catalogView({
      starts: startsForSubject(afterExpiry.store, visitorId, userId),
      now: after,
    }),
    "signed-in expired catalog",
  );
}

function testGuestLoginKeepsOriginalWindow() {
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const startAt = new Date("2026-08-23T10:00:00.000Z");
  const during = new Date("2026-08-23T10:10:00.000Z");

  const guest = startPersonalCountdown({
    store: [],
    promotionId: "promo-1",
    visitorId,
    userId: null,
    now: startAt,
    durationSeconds: 20 * 60,
    id: "guest-1",
  });
  const bound = bindPersonalStarts(guest.store, visitorId, userId);
  const subject = startsForSubject(bound, visitorId, userId);

  assert.equal(bound.length, 1, "login does not add a start");
  assert.equal(bound[0]?.expiresAt, guest.start.expiresAt, "login keeps expires_at");
  assertStruckSale(catalogView({ starts: subject, now: during }), "guest→login catalog");
  assert.equal(
    catalogView({ starts: subject, now: during }).href,
    "/practice/anna/morning",
    "guest→login active href stays canonical",
  );
  assert.equal(
    productPrice({ starts: subject, now: during }).promotion?.expiresAt,
    guest.start.expiresAt,
    "guest→login PDP uses original window",
  );
}

function testDirectPromoUnchanged() {
  const handler = readFileSync(
    join(ROOT, "src/components/pricing/PricePromotionStartHandler.tsx"),
    "utf8",
  );
  const page = readFileSync(
    join(ROOT, "src/app/(platform)/(listener)/practice/[...segments]/page.tsx"),
    "utf8",
  );
  const startRoute = readFileSync(
    join(ROOT, "src/app/api/price-promotions/start/route.ts"),
    "utf8",
  );

  assert.match(handler, /searchParams\.delete\("promo"\)/, "handler still strips promo");
  assert.match(page, /PricePromotionStartHandler/, "PDP still mounts start handler");
  assert.match(startRoute, /start_practice_price_promotion/, "direct token still uses RPC");
  assert.match(
    page,
    /shouldMountPricePromotionStartHandler/,
    "author preview still blocks real start",
  );
}

function testCalendarRegressionAndNoPromoAndFree() {
  const now = new Date("2026-08-23T12:00:00.000Z");
  const calendar = catalogView({
    promotions: [calendarPromotion()],
    starts: [],
    now,
    personalTeaser: true,
  });
  assert.equal(calendar.price, 888, "calendar sale still applies on catalog");
  assert.equal(calendar.compareAtPrice, 4999, "calendar still strikes base");
  assert.equal(calendar.href, "/practice/anna/morning", "calendar href is canonical");

  const none = catalogView({
    promotions: [],
    starts: [],
    now,
    personalTeaser: true,
  });
  assertBaseOnly(none, "no promotion");

  const free = catalogView({
    isFree: true,
    basePrice: 0,
    promotions: [promotion()],
    starts: [],
    now,
  });
  assert.equal(free.isFree, true, "free stays free");
  assert.equal(free.resolved.finalPrice, 0, "free final is 0");
  assert.equal(free.compareAtPrice, null, "free has no compare-at");
  assert.equal(free.href, "/practice/anna/morning", "free href is canonical");

  const card = adaptLegacyCatalogSourceToCard({
    id: "pub-1",
    slug: "morning",
    title: "Утро",
    price: 0,
    isFree: true,
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/morning",
  });
  assert.equal(card?.default_offer?.access, "free", "free catalog offer has no price");
  assert.equal(readPaidCatalogOfferPriceLabel(card?.default_offer ?? null), null);
  assert.equal(readPaidCatalogOfferCompareAtLabel(card?.default_offer ?? null), null);
}

function testListingCardDoesNotHardcodePromoQuery() {
  const item = mapCatalogProductToListingItem({
    id: "p1",
    authorId: "a1",
    title: "Утро",
    slug: "morning",
    subtitle: null,
    description: null,
    format: "Аудиопрактика",
    productKind: "practice",
    price: 499,
    compareAtPrice: 4999,
    isFree: false,
    coverUrl: null,
    authorName: "Анна",
    authorSlug: "anna",
    href: buildPracticePromoStartPath("anna", "morning", "token-1"),
    meta: null,
    statsLabel: null,
    productTypeLabel: "Аудиопрактика",
    priceLabel: formatRubles(499),
    compareAtPriceLabel: formatRubles(4999),
    sortTimestamp: 1,
  });

  assert.equal(item.paths.pdp, "/practice/anna/morning?promo=token-1");
  assert.equal(item.default_offer?.access, "paid");
  if (item.default_offer?.access === "paid") {
    assert.equal(item.default_offer.price.amount_minor, 49900);
    assert.equal(item.default_offer.compare_at_price?.amount_minor, 499900);
  }

  const shell = readFileSync(
    join(ROOT, "src/components/catalog/cards/CatalogCardShell.tsx"),
    "utf8",
  );
  assert.match(shell, /href=\{card\.paths\.pdp\}/, "card uses view-model href");
  assert.doesNotMatch(shell, /\?promo=/, "card does not hardcode promo query");
  assert.doesNotMatch(shell, /20 минут|Предложение действует/, "card has no personal copy");
  assert.doesNotMatch(shell, /Подарок/, "card has no gift label");
}

function testCatalogGetDoesNotStart() {
  const listing = readFileSync(join(ROOT, "src/lib/catalog/listing.ts"), "utf8");
  const catalog = readFileSync(join(ROOT, "src/lib/products/catalog.ts"), "utf8");
  const api = readFileSync(join(ROOT, "src/app/api/catalog/route.ts"), "utf8");
  const page = readFileSync(
    join(ROOT, "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx"),
    "utf8",
  );

  for (const [label, source] of [
    ["listing", listing],
    ["catalog", catalog],
    ["api", api],
    ["page", page],
  ] as const) {
    assert.doesNotMatch(
      source,
      /start_practice_price_promotion|\/api\/price-promotions\/start|ensurePriceVisitorId/,
      `${label} GET must not start a promotion or mint a visitor`,
    );
  }

  assert.match(page, /readPriceVisitorId/, "catalog page reuses existing visitor cookie");
  assert.match(api, /readPriceVisitorId/, "catalog API reuses existing visitor cookie");
  assert.equal(
    buildPracticePublicPath("anna", "morning"),
    "/practice/anna/morning",
    "canonical PDP helper unchanged",
  );
}

function main() {
  testGuestNeverStartedActiveExpired();
  testSignedInSameSemantics();
  testGuestLoginKeepsOriginalWindow();
  testDirectPromoUnchanged();
  testCalendarRegressionAndNoPromoAndFree();
  testListingCardDoesNotHardcodePromoQuery();
  testCatalogGetDoesNotStart();
  console.log("catalog-personal-countdown-unit: ok");
}

main();
