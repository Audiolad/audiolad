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
import { resolveAuthorPromoPreviewPrice } from "../src/lib/pricing/author-promo-preview";
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
  buildPracticeCanonicalUrl,
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
  basePrice?: number;
  surface?: (typeof PRICE_SURFACES)[keyof typeof PRICE_SURFACES];
}) {
  return resolvePracticePrice({
    isFree: false,
    basePrice: input.basePrice ?? 4999,
    promotions: input.promotions ?? [promotion()],
    starts: input.starts,
    now: input.now,
    surface: input.surface ?? PRICE_SURFACES.PRODUCT,
  });
}

function startOnce(input: {
  store?: PersonalPromotionStart[];
  visitorId: string;
  userId?: string | null;
  now: Date;
  salePriceSnapshot?: number;
  id: string;
}) {
  return startPersonalCountdown({
    store: input.store ?? [],
    promotionId: "promo-1",
    visitorId: input.visitorId,
    userId: input.userId ?? null,
    now: input.now,
    durationSeconds: 20 * 60,
    salePriceSnapshot: input.salePriceSnapshot ?? 499,
    id: input.id,
  });
}

function assertStruckSale(
  view: ReturnType<typeof catalogView>,
  message: string,
  salePrice = 499,
  compareAt = 4999,
) {
  assert.equal(view.price, salePrice, `${message}: sale`);
  assert.equal(view.compareAtPrice, compareAt, `${message}: compare-at`);
  assert.equal(view.priceLabel, formatRubles(salePrice), `${message}: sale label`);
  assert.equal(
    view.compareAtPriceLabel,
    formatRubles(compareAt),
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

  const first = startOnce({
    visitorId,
    now: startAt,
    id: "start-1",
  });
  assert.equal(first.created, true, "catalog click starts once");
  assert.equal(first.store.length, 1, "starts=1 after first PDP");
  assert.equal(first.start.salePriceSnapshot, 499, "first start freezes snapshot");

  const pdp = productPrice({ starts: first.store, now: during });
  assert.equal(pdp.finalPrice, 499, "PDP sale after start");
  assert.equal(pdp.promotion?.expiresAt, first.start.expiresAt, "PDP remaining window");

  const refresh = startOnce({
    store: first.store,
    visitorId,
    now: during,
    salePriceSnapshot: 699,
    id: "start-refresh",
  });
  assert.equal(refresh.created, false, "refresh reuses start");
  assert.equal(refresh.start.startedAt, first.start.startedAt, "same started_at");
  assert.equal(refresh.start.expiresAt, first.start.expiresAt, "same expires_at");
  assert.equal(refresh.start.salePriceSnapshot, 499, "refresh keeps snapshot");

  const activeCatalog = catalogView({ starts: first.store, now: during });
  assertStruckSale(activeCatalog, "guest active catalog");
  assert.equal(activeCatalog.href, "/practice/anna/morning", "active href is canonical");

  const expiredCatalog = catalogView({ starts: first.store, now: after });
  assertBaseOnly(expiredCatalog, "guest expired catalog");
  const expiredPdp = productPrice({ starts: first.store, now: after });
  assert.equal(expiredPdp.finalPrice, 4999, "expired PDP is base");
  assert.equal(expiredPdp.promotion, null, "expired PDP has no sale");

  const clickAfterExpiry = startOnce({
    store: first.store,
    visitorId,
    now: after,
    salePriceSnapshot: 699,
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

  const first = startOnce({
    visitorId,
    userId,
    now: startAt,
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

  const afterExpiry = startOnce({
    store: first.store,
    visitorId,
    userId,
    now: after,
    salePriceSnapshot: 699,
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

  const guest = startOnce({
    visitorId,
    now: startAt,
    id: "guest-1",
  });
  const bound = bindPersonalStarts(guest.store, visitorId, userId);
  const subject = startsForSubject(bound, visitorId, userId);

  assert.equal(bound.length, 1, "login does not add a start");
  assert.equal(bound[0]?.expiresAt, guest.start.expiresAt, "login keeps expires_at");
  assert.equal(bound[0]?.startedAt, guest.start.startedAt, "login keeps started_at");
  assert.equal(bound[0]?.salePriceSnapshot, 499, "login keeps sale_price_snapshot");
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
    handler,
    /const PROMOTION_START_TIMEOUT_MS = 8_000/,
    "promo start has a bounded client timeout",
  );
  assert.match(
    handler,
    /signal: controller\.signal/,
    "promo start aborts its only request after timeout",
  );
  assert.match(
    handler,
    /startedRef\.current = true/,
    "promo start remains one request per mounted handler",
  );
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

function testActiveCatalogUsesSnapshotNotLive() {
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const startAt = new Date("2026-08-23T10:00:00.000Z");
  const during = new Date("2026-08-23T10:10:00.000Z");
  const first = startOnce({ visitorId, now: startAt, id: "snap-1" });
  const edited = [promotion({ salePrice: 699 })];

  assertStruckSale(
    catalogView({ starts: first.store, now: during, promotions: edited }),
    "active catalog keeps snapshot after live edit",
    499,
  );
  assert.equal(
    catalogView({ starts: first.store, now: during, promotions: edited }).href,
    "/practice/anna/morning",
    "active snapshot href stays canonical",
  );
  assert.equal(
    productPrice({ starts: first.store, now: during, promotions: edited }).finalPrice,
    499,
    "PDP resolver stays on snapshot 499",
  );
  assert.equal(
    productPrice({
      starts: first.store,
      now: during,
      promotions: edited,
      surface: PRICE_SURFACES.CHECKOUT,
    }).finalPrice,
    499,
    "checkout resolver stays on snapshot 499",
  );
  assertStruckSale(
    catalogView({ starts: [], now: during, promotions: edited }),
    "never-started second viewer catalogs live 699",
    699,
  );
  assert.equal(
    catalogView({ starts: [], now: during, promotions: edited }).href,
    "/practice/anna/morning?promo=token-1",
    "never-started live 699 still gets ?promo=",
  );

  const second = startOnce({
    visitorId: "22222222-2222-4222-8222-222222222222",
    now: during,
    salePriceSnapshot: 699,
    id: "snap-2",
  });
  assert.equal(second.start.salePriceSnapshot, 699, "new start snapshots live 699");
}

function testBasePriceLowerThanSnapshot() {
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const startAt = new Date("2026-08-23T10:00:00.000Z");
  const during = new Date("2026-08-23T10:10:00.000Z");
  const first = startOnce({ visitorId, now: startAt, id: "base-guard-1" });

  const lowered = catalogView({
    starts: first.store,
    now: during,
    basePrice: 399,
  });
  assert.equal(lowered.price, 399, "snapshot 499 + base 399 → catalog 399");
  assert.equal(lowered.compareAtPrice, null, "invalid snapshot has no strikethrough");
  assert.equal(lowered.href, "/practice/anna/morning", "invalid snapshot href is canonical");
  assert.equal(
    productPrice({ starts: first.store, now: during, basePrice: 399 }).finalPrice,
    399,
    "PDP uses current base when snapshot is not below it",
  );
  assert.equal(
    productPrice({
      starts: first.store,
      now: during,
      basePrice: 399,
      surface: PRICE_SURFACES.CHECKOUT,
    }).finalPrice,
    399,
    "checkout uses current base when snapshot is not below it",
  );

  assertStruckSale(
    catalogView({ starts: first.store, now: during, basePrice: 5999 }),
    "raised base keeps ACTIVE snapshot",
    499,
    5999,
  );
}

function testCalendarVersusPersonalWinners() {
  const now = new Date("2026-08-23T12:00:00.000Z");
  const visitorId = "11111111-1111-4111-8111-111111111111";
  const personal = promotion({ salePrice: 499 });
  const calendar799 = calendarPromotion({ salePrice: 799 });
  const calendar399 = calendarPromotion({ salePrice: 399 });

  const caseA = catalogView({
    promotions: [personal, calendar799],
    starts: [],
    now,
  });
  assertStruckSale(caseA, "A: calendar 799 + never-started 499");
  assert.equal(caseA.href, "/practice/anna/morning?promo=token-1", "A: winner starts personal");

  const caseB = catalogView({
    promotions: [personal, calendar399],
    starts: [],
    now,
  });
  assert.equal(caseB.price, 399, "B: calendar 399 wins over never-started 499");
  assert.equal(caseB.href, "/practice/anna/morning", "B: no ?promo= when calendar wins");

  const active = startOnce({ visitorId, now: new Date("2026-08-23T10:00:00.000Z"), id: "cal-c" });
  const caseC = catalogView({
    promotions: [personal, calendar399],
    starts: active.store,
    now,
  });
  assert.equal(caseC.price, 399, "C: calendar 399 beats ACTIVE snapshot 499");
  assert.equal(caseC.href, "/practice/anna/morning", "C: calendar winner has no ?promo=");

  const expired = startOnce({ visitorId, now: new Date("2026-08-23T10:00:00.000Z"), id: "cal-d" });
  const caseD = catalogView({
    promotions: [personal, calendar399],
    starts: expired.store,
    now: new Date("2026-08-23T10:25:00.000Z"),
  });
  assert.equal(caseD.price, 399, "D: expired personal leaves calendar");
  assert.equal(caseD.href, "/practice/anna/morning", "D: expired + calendar href is canonical");
}

function testAuthorPromoPreviewStaysLiveAndWritesNoStart() {
  const live = promotion({ salePrice: 699 });
  const preview = resolveAuthorPromoPreviewPrice({
    isFree: false,
    basePrice: 4999,
    promotion: live,
    now: new Date("2026-08-23T10:10:00.000Z"),
  });

  assert.equal(preview?.finalPrice, 699, "author preview uses live sale_price");
  assert.equal(preview?.promotion?.salePrice, 699, "preview resolved sale is live");

  const source = readFileSync(
    join(ROOT, "src/lib/pricing/author-promo-preview.ts"),
    "utf8",
  );
  assert.match(source, /salePriceSnapshot: previewPromotion\.salePrice/, "preview snapshots live");
  assert.doesNotMatch(source, /start_practice_price_promotion/, "preview writes no start RPC");
  assert.doesNotMatch(
    source,
    /ensurePriceVisitorId/,
    "preview does not mint a buyer visitor cookie",
  );
}

function testSeoAndSitemapStayCanonical() {
  const sitemap = readFileSync(join(ROOT, "src/lib/seo/sitemap-data.ts"), "utf8");
  const home = readFileSync(join(ROOT, "src/lib/home/data.ts"), "utf8");
  const catalog = readFileSync(join(ROOT, "src/lib/products/catalog.ts"), "utf8");
  const dto = readFileSync(join(ROOT, "src/lib/catalog/dto.ts"), "utf8");
  const listing = readFileSync(join(ROOT, "src/lib/pricing/catalog-listing.ts"), "utf8");

  assert.match(sitemap, /buildPracticePublicPath/, "sitemap uses canonical practice path");
  assert.doesNotMatch(sitemap, /buildPracticePromoStartPath|\?promo=/, "sitemap has no promo query");
  assert.match(sitemap, /toAbsoluteSitemapUrl/, "sitemap strips query from loc");
  assert.doesNotMatch(sitemap, /viewer:/, "sitemap catalog fetch is not viewer-aware");

  assert.doesNotMatch(home, /buildPracticePromoStartPath|\?promo=/, "homepage has no promo query");
  assert.match(
    catalog,
    /Omit for listed-only public showcases: home, sitemap, topic hubs, author page/,
    "catalog documents crawler surfaces stay canonical",
  );

  const canonical = buildPracticeCanonicalUrl("anna", "morning");
  assert.match(canonical, /\/practice\/anna\/morning$/, "canonical path stays clean");
  assert.doesNotMatch(canonical, /[?&]promo=/, "canonical URL has no promo query");

  assert.doesNotMatch(dto, /start_token|startToken/, "catalog DTO does not expose start_token");
  assert.doesNotMatch(
    listing,
    /start_token/,
    "listing view-model does not put start_token on the DTO",
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
  testActiveCatalogUsesSnapshotNotLive();
  testBasePriceLowerThanSnapshot();
  testCalendarVersusPersonalWinners();
  testAuthorPromoPreviewStaysLiveAndWritesNoStart();
  testSeoAndSitemapStayCanonical();
  console.log("catalog-personal-countdown-unit: ok");
}

main();
