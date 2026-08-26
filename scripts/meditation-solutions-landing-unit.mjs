#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startPersonalCountdown } from "../src/lib/pricing/personal-start.ts";
import {
  MEDITATION_SOLUTIONS_BASE_PRICE_RUB,
  MEDITATION_SOLUTIONS_BONUS_BADGE,
  MEDITATION_SOLUTIONS_BUY_LABEL,
  MEDITATION_SOLUTIONS_CARDS,
  MEDITATION_SOLUTIONS_H1,
  MEDITATION_SOLUTIONS_HERO_IMAGE,
  MEDITATION_SOLUTIONS_OFFER_LINE,
  MEDITATION_SOLUTIONS_PRACTICE_SLUG,
  MEDITATION_SOLUTIONS_SALE_PRICE_RUB,
  MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
  MEDITATION_SOLUTIONS_SEO_TITLE,
  MEDITATION_SOLUTIONS_SUBTITLE,
  MEDITATION_SOLUTIONS_TIMER_CAPTION,
  MEDITATION_SOLUTIONS_TIMER_SECONDS,
  assertMeditationSolutionsCopyLock,
} from "../src/lib/landings/25-meditation-solutions/content.ts";
import { resolveMeditationSolutionsOfferDisplay } from "../src/lib/landings/25-meditation-solutions/offer.ts";
import { buildMeditationSolutionsMetadata } from "../src/lib/landings/25-meditation-solutions/metadata.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function testCopyLock() {
  assert.equal(
    MEDITATION_SOLUTIONS_H1,
    "25 готовых решений для создания своих медитаций",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_SUBTITLE,
    "Как создать свою медитацию с нуля: выбрать тему, написать текст для медитации, записать медитацию самостоятельно, добавить музыку и получить готовый MP3.",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_OFFER_LINE,
    "25 готовых тем, текстов, шаблонов, инструкций и практических инструментов – от первой идеи до готовой медитации с голосом и музыкой.",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_SEO_TITLE,
    "25 готовых решений для создания своих медитаций | АудиоЛад",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_SEO_DESCRIPTION,
    MEDITATION_SOLUTIONS_SUBTITLE,
  );
  assert.equal(MEDITATION_SOLUTIONS_BASE_PRICE_RUB, 4999);
  assert.equal(MEDITATION_SOLUTIONS_SALE_PRICE_RUB, 499);
  assert.equal(MEDITATION_SOLUTIONS_TIMER_SECONDS, 1200);
  assert.equal(MEDITATION_SOLUTIONS_TIMER_CAPTION, "в ближайшие 20 минут");
  assert.equal(MEDITATION_SOLUTIONS_BUY_LABEL, "Купить");
  assert.equal(MEDITATION_SOLUTIONS_BONUS_BADGE, "БОНУС");
  assert.equal(MEDITATION_SOLUTIONS_CARDS.length, 26);
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS.filter((card) => card.bonus).length,
    1,
  );
  assert.equal(MEDITATION_SOLUTIONS_CARDS[25].id, "bonus-26");
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS[0].title,
    "Как сделать медитацию: пошаговый план от идеи до готового MP3",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS[25].title,
    "Как использовать медитации и аудиопрактики для привлечения клиентов",
  );

  const locked = [
    MEDITATION_SOLUTIONS_H1,
    MEDITATION_SOLUTIONS_SUBTITLE,
    MEDITATION_SOLUTIONS_OFFER_LINE,
    MEDITATION_SOLUTIONS_SEO_TITLE,
    ...MEDITATION_SOLUTIONS_CARDS.flatMap((card) => [
      card.title,
      card.description,
    ]),
  ];

  for (const value of locked) {
    assert.equal(
      assertMeditationSolutionsCopyLock(value),
      true,
      `forbidden phrase in: ${value}`,
    );
    assert.doesNotMatch(value, /4\s*099/);
    assert.doesNotMatch(value, /своей медитации/);
  }
}

function testRouteIsolation() {
  const staticPage =
    "src/app/(platform)/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/page.tsx";
  assert.equal(existsSync(join(ROOT, staticPage)), true, "static sibling page");

  const playlistPage = read("src/app/(platform)/p/[slug]/page.tsx");
  assert.match(playlistPage, /PublicPlaylistPageView/);
  assert.doesNotMatch(playlistPage, /25-gotovyh-resheniy/);
  assert.doesNotMatch(playlistPage, /MeditationSolutions/);
  assert.doesNotMatch(playlistPage, /25-meditation-solutions/);

  const landingPage = read(staticPage);
  assert.doesNotMatch(landingPage, /"use client"/);
  assert.match(landingPage, /force-dynamic/);
  assert.match(landingPage, /buildMeditationSolutionsMetadata/);
  assert.match(landingPage, /MeditationSolutionsLandingView/);
  assert.doesNotMatch(landingPage, /PublicPlaylistPageView/);
  assert.doesNotMatch(landingPage, /QuickOfferPublicPage/);
}

function testGridAndCardsReuseCatalogGeometry() {
  const cards = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsCards.tsx",
  );
  const css = read("src/app/globals.css");
  const view = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsLandingView.tsx",
  );

  assert.match(cards, /data-catalog-product-grid/);
  assert.match(cards, /catalog-product-grid--fixed-2/);
  assert.match(css, /catalog-product-grid--fixed-2/);
  assert.doesNotMatch(cards, /BuyPracticeButton/);
  assert.doesNotMatch(cards, /CatalogProductHeartButton/);
  assert.doesNotMatch(cards, /href=.*practice/);
  assert.match(view, /priority/);
  assert.match(cards, /loading="lazy"/);
  assert.match(view, /platformBottomContentPaddingClass/);
}

function testPromotionWindowReuse() {
  const now = new Date("2026-08-26T10:00:00.000Z");
  const first = startPersonalCountdown({
    store: [],
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    now,
    durationSeconds: 1200,
    id: "start-1",
  });

  assert.equal(first.created, true);
  assert.equal(first.start.expiresAt, "2026-08-26T10:20:00.000Z");

  const refresh = startPersonalCountdown({
    store: first.store,
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    now: new Date("2026-08-26T10:05:00.000Z"),
    durationSeconds: 1200,
    id: "start-2",
  });

  assert.equal(refresh.created, false);
  assert.equal(refresh.start.id, "start-1");
  assert.equal(refresh.start.expiresAt, first.start.expiresAt);

  const returnVisit = startPersonalCountdown({
    store: refresh.store,
    promotionId: "promo-1",
    visitorId: "11111111-1111-4111-8111-111111111111",
    userId: null,
    now: new Date("2026-08-26T12:00:00.000Z"),
    durationSeconds: 1200,
    id: "start-3",
  });

  assert.equal(returnVisit.created, false);
  assert.equal(returnVisit.start.expiresAt, first.start.expiresAt);
}

function testExpiryUi() {
  const active = resolveMeditationSolutionsOfferDisplay({
    nowMs: Date.parse("2026-08-26T10:05:00.000Z"),
    expiresAt: "2026-08-26T10:20:00.000Z",
  });
  assert.equal(active.showPromo, true);
  assert.equal(active.chargePrice, 499);
  assert.equal(active.chargePriceMinor, 49900);
  assert.equal(active.remainingLabel, "15:00");

  const expired = resolveMeditationSolutionsOfferDisplay({
    nowMs: Date.parse("2026-08-26T10:20:00.000Z"),
    expiresAt: "2026-08-26T10:20:00.000Z",
  });
  assert.equal(expired.showPromo, false);
  assert.equal(expired.chargePrice, 4999);
  assert.equal(expired.chargePriceMinor, 499900);
  assert.equal(expired.remainingLabel, "00:00");
}

function testCheckoutWiring() {
  const cta = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsOfferCta.tsx",
  );
  const api = read(
    "src/app/api/landings/25-meditation-solutions/window/route.ts",
  );
  const seed = read(
    "supabase/migrations/20260826120000_seed_25_meditation_solutions_practice.sql",
  );

  assert.match(cta, /BuyPracticeButton/);
  assert.match(cta, /purchaseSurface="sales_landing"/);
  assert.match(cta, /productPriceMinorSnapshot=\{display.chargePriceMinor\}/);
  assert.match(cta, /ctaPlacement=\{placement\}/);
  assert.match(api, /start_practice_price_promotion/);
  assert.match(api, /ensurePriceVisitorId/);
  assert.match(seed, /25-meditation-solutions/);
  assert.match(seed, /4999/);
  assert.doesNotMatch(seed, /4099/);
  assert.match(seed, /AND sale_price = 499/);
  assert.match(seed, /1200/);
  assert.equal(MEDITATION_SOLUTIONS_PRACTICE_SLUG, "25-meditation-solutions");
}

function testSeoAndShell() {
  const metadata = buildMeditationSolutionsMetadata();
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.robots?.follow, true);
  assert.match(String(metadata.alternates?.canonical ?? ""), /25-gotovyh/);
  const bottomNav = read("src/lib/navigation/bottom-nav.ts");
  const sitemap = read("src/lib/seo/sitemap-data.ts");
  assert.match(bottomNav, /MEDITATION_SOLUTIONS_PUBLIC_PATH/);
  assert.match(sitemap, /MEDITATION_SOLUTIONS_PUBLIC_PATH/);
  assert.equal(MEDITATION_SOLUTIONS_HERO_IMAGE, "/products/25-meditation-solutions/hero.jpg");
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS[0].imageSrc,
    "/products/25-meditation-solutions/item-01.jpg",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS[25].imageSrc,
    "/products/25-meditation-solutions/bonus-26.jpg",
  );
}

function testNoPageBuilder() {
  const view = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsLandingView.tsx",
  );
  assert.doesNotMatch(view, /drag/i);
  assert.doesNotMatch(view, /block editor/i);
  assert.doesNotMatch(view, /AuthorQuickOffer/);
}

testCopyLock();
testRouteIsolation();
testGridAndCardsReuseCatalogGeometry();
testPromotionWindowReuse();
testExpiryUi();
testCheckoutWiring();
testSeoAndShell();
testNoPageBuilder();

console.log("meditation-solutions-landing-unit: ok");
