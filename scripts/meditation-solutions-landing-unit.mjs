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
  MEDITATION_SOLUTIONS_ONCE_NOTE,
  MEDITATION_SOLUTIONS_TIMER_CAPTION,
  MEDITATION_SOLUTIONS_TIMER_SECONDS,
  MEDITATION_SOLUTIONS_TIMER_UNIT,
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
  assert.equal(MEDITATION_SOLUTIONS_TIMER_CAPTION, "Предложение действует ещё:");
  assert.equal(MEDITATION_SOLUTIONS_TIMER_UNIT, "мин.");
  assert.equal(
    MEDITATION_SOLUTIONS_ONCE_NOTE,
    "Это предложение показывается вам один раз. После окончания таймера продукт останется доступен по полной цене 4 999 ₽.",
  );
  assert.doesNotMatch(MEDITATION_SOLUTIONS_TIMER_CAPTION, /в ближайшие 20 минут/);
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
    "1. Как сделать медитацию: пошаговый план от идеи до готового MP3",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS[24].title,
    "25. Как из одной медитации создать серию из 7 аудиопрактик",
  );
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS[25].title,
    "Бонус. Как использовать медитации и аудиопрактики для привлечения клиентов",
  );

  for (const [index, card] of MEDITATION_SOLUTIONS_CARDS.slice(0, 25).entries()) {
    assert.equal(
      card.title.startsWith(`${index + 1}. `),
      true,
      `card ${index + 1} title must start with "${index + 1}. "`,
    );
  }
  assert.equal(
    MEDITATION_SOLUTIONS_CARDS[25].title.startsWith("Бонус. "),
    true,
    "bonus card title must start with «Бонус. »",
  );

  const locked = [
    MEDITATION_SOLUTIONS_H1,
    MEDITATION_SOLUTIONS_SUBTITLE,
    MEDITATION_SOLUTIONS_OFFER_LINE,
    MEDITATION_SOLUTIONS_SEO_TITLE,
    MEDITATION_SOLUTIONS_TIMER_CAPTION,
    MEDITATION_SOLUTIONS_TIMER_UNIT,
    MEDITATION_SOLUTIONS_ONCE_NOTE,
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
  assert.match(
    css,
    /\.catalog-product-grid--fixed-2 \{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.doesNotMatch(cards, /BuyPracticeButton/);
  assert.doesNotMatch(cards, /CatalogProductHeartButton/);
  assert.doesNotMatch(cards, /CatalogProductPlayButton/);
  assert.doesNotMatch(cards, /href=.*practice/);
  assert.doesNotMatch(cards, /card\.description/);
  assert.match(cards, /rounded-\[20px\]/);
  assert.match(cards, /border-\[#eadff8\]/);
  assert.match(cards, /data-meditation-solutions-format/);
  assert.match(cards, /card\.format/);
  assert.match(cards, /mt-auto/);
  assert.doesNotMatch(cards, /min-h-20/);
  assert.doesNotMatch(cards, /MEDITATION_SOLUTIONS_BONUS_BADGE/);
  assert.doesNotMatch(cards, /БОНУС/);
  assert.match(view, /priority/);
  assert.match(cards, /loading="lazy"/);
  assert.match(view, /max-w-\[560px\]/);
  assert.doesNotMatch(view, /max-w-\[720px\]/);
  assert.doesNotMatch(view, /platformBottomContentPaddingClass/);
}

function testCardFormats() {
  const expected = [
    "PDF + аудио",
    "PDF",
    "PDF",
    "PDF",
    "PDF",
    "PDF",
    "Аудио",
    "Аудио",
    "Аудио",
    "PDF",
    "PDF",
    "Аудио + PDF",
    "PDF",
    "PDF",
    "PDF",
    "PDF",
    "PDF",
    "PDF",
    "Аудио + PDF",
    "PDF",
    "Аудио",
    "Аудио",
    "PDF",
    "Аудио",
    "PDF",
    "PDF + аудио",
  ];

  assert.equal(MEDITATION_SOLUTIONS_CARDS.length, expected.length);
  assert.deepEqual(
    MEDITATION_SOLUTIONS_CARDS.map((card) => card.format),
    expected,
  );
  assert.equal(MEDITATION_SOLUTIONS_CARDS[25].bonus, true);
  assert.equal(MEDITATION_SOLUTIONS_CARDS[25].format, "PDF + аудио");
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
  const pendingFirstOpen = resolveMeditationSolutionsOfferDisplay({
    nowMs: Date.parse("2026-08-26T10:00:00.000Z"),
    expiresAt: null,
    windowSynced: false,
  });
  assert.equal(pendingFirstOpen.showPromo, true);
  assert.equal(pendingFirstOpen.chargePrice, 499);
  assert.equal(pendingFirstOpen.remainingLabel, "20:00");
  assert.equal(pendingFirstOpen.canPurchase, false);
  assert.equal(pendingFirstOpen.windowSynced, false);

  const active = resolveMeditationSolutionsOfferDisplay({
    nowMs: Date.parse("2026-08-26T10:05:00.000Z"),
    expiresAt: "2026-08-26T10:20:00.000Z",
    windowSynced: true,
  });
  assert.equal(active.showPromo, true);
  assert.equal(active.chargePrice, 499);
  assert.equal(active.chargePriceMinor, 49900);
  assert.equal(active.remainingLabel, "15:00");
  assert.equal(active.canPurchase, true);

  const oneSecondLater = resolveMeditationSolutionsOfferDisplay({
    nowMs: Date.parse("2026-08-26T10:05:01.000Z"),
    expiresAt: "2026-08-26T10:20:00.000Z",
    windowSynced: true,
  });
  assert.equal(oneSecondLater.showPromo, true);
  assert.equal(oneSecondLater.remainingLabel, "14:59");
  assert.equal(oneSecondLater.chargePrice, 499);

  const expired = resolveMeditationSolutionsOfferDisplay({
    nowMs: Date.parse("2026-08-26T10:20:00.000Z"),
    expiresAt: "2026-08-26T10:20:00.000Z",
    windowSynced: true,
  });
  assert.equal(expired.showPromo, false);
  assert.equal(expired.chargePrice, 4999);
  assert.equal(expired.chargePriceMinor, 499900);
  assert.equal(expired.remainingLabel, "00:00");
  assert.equal(expired.canPurchase, true);

  const syncedWithoutWindow = resolveMeditationSolutionsOfferDisplay({
    nowMs: Date.parse("2026-08-26T10:00:00.000Z"),
    expiresAt: null,
    windowSynced: true,
  });
  assert.equal(syncedWithoutWindow.showPromo, false);
  assert.equal(syncedWithoutWindow.chargePrice, 4999);
  assert.equal(syncedWithoutWindow.canPurchase, true);
}

function testCheckoutWiring() {
  const cta = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsOfferCta.tsx",
  );
  const api = read(
    "src/app/api/landings/25-meditation-solutions/window/route.ts",
  );
  const seed = read(
    "supabase/migrations/20260828120000_seed_25_meditation_solutions_practice.sql",
  );

  const provider = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsOfferProvider.tsx",
  );
  const view = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsLandingView.tsx",
  );

  assert.match(cta, /BuyPracticeButton/);
  assert.match(cta, /display.canPurchase/);
  assert.match(cta, /data-meditation-solutions-countdown/);
  assert.match(cta, /MEDITATION_SOLUTIONS_ONCE_NOTE/);
  assert.match(cta, /MEDITATION_SOLUTIONS_TIMER_CAPTION/);
  assert.match(cta, /MEDITATION_SOLUTIONS_TIMER_UNIT/);
  assert.match(cta, /text-\[20px\] font-medium text-\[#9a8bb8\] line-through/);
  assert.match(cta, /text-\[16px\]/);
  assert.doesNotMatch(cta, /в ближайшие 20 минут/);
  assert.doesNotMatch(cta, /setInterval/);
  assert.match(cta, /useMeditationSolutionsOffer/);
  assert.equal((provider.match(/setInterval/g) ?? []).length, 1);
  assert.match(provider, /if \(!expiresAt\)/);
  assert.match(view, /MeditationSolutionsOfferProvider/);
  assert.match(view, /placement="top"/);
  assert.match(view, /placement="bottom"/);
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
  assert.match(seed, /is_catalog_listed = false/);
  assert.match(seed, /ON CONFLICT \(author_id, slug\) DO UPDATE/);
  assert.doesNotMatch(seed, /ON CONFLICT \(slug\) DO UPDATE/);
  assert.match(
    seed,
    /slug 25-meditation-solutions is already owned by another practice id/,
  );
  assert.match(
    seed,
    /set_config\('audiolad\.allow_practice_publish',\s*'on',\s*true\)/,
  );
  const publishGucIndex = seed.search(
    /set_config\('audiolad\.allow_practice_publish',\s*'on',\s*true\)/,
  );
  const publishedInsertIndex = seed.indexOf("INSERT INTO public.practices");
  assert.ok(
    publishGucIndex >= 0 && publishGucIndex < publishedInsertIndex,
    "publication GUC must be enabled before the published practice INSERT/UPSERT",
  );
  const lineage = read("deploy/scripts/lib/migration-audit-lineage.mjs");
  assert.match(lineage, /"20260828120000"/);
  assert.doesNotMatch(
    lineage,
    /"20260826120000": \{\s*extraProbes: \[\s*dataProbe\(\s*"data:practices.25_meditation_solutions_seed"/,
  );
  assert.equal(MEDITATION_SOLUTIONS_PRACTICE_SLUG, "25-meditation-solutions");
}

function testProductImagesOnBranch() {
  const imageDir = join(ROOT, "public/products/25-meditation-solutions");
  const expected = [
    "hero.jpg",
    ...Array.from({ length: 25 }, (_, index) =>
      `item-${String(index + 1).padStart(2, "0")}.jpg`,
    ),
    "bonus-26.jpg",
  ];

  assert.equal(expected.length, 27);
  for (const name of expected) {
    const absolute = join(imageDir, name);
    assert.equal(existsSync(absolute), true, `missing image ${name}`);
    const header = readFileSync(absolute).subarray(0, 3);
    assert.deepEqual(
      [...header],
      [0xff, 0xd8, 0xff],
      `${name} is not a JPEG`,
    );
  }

  for (const card of MEDITATION_SOLUTIONS_CARDS) {
    assert.equal(
      existsSync(join(ROOT, "public", card.imageSrc.slice(1))),
      true,
      card.imageSrc,
    );
  }

  const robots = read("src/lib/seo/robots-config.ts");
  assert.doesNotMatch(robots, /25-gotovyh-resheniy/);
  assert.doesNotMatch(robots, /"\/p\/"/);
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

function testDedicatedLandingShell() {
  const parentLayout = read("src/app/(platform)/p/layout.tsx");
  const playlistLayout = read("src/app/(platform)/p/[slug]/layout.tsx");
  const landingLayout = read(
    "src/app/(platform)/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/layout.tsx",
  );
  const landingPage = read(
    "src/app/(platform)/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/page.tsx",
  );
  const view = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsLandingView.tsx",
  );

  assert.doesNotMatch(parentLayout, /ListenerAppShell/);
  assert.match(playlistLayout, /ListenerAppShell/);
  assert.match(playlistLayout, /mode="default"/);
  assert.match(playlistLayout, /getListenerShellData/);
  assert.match(playlistLayout, /px-5 pt-6 pb-4 lg:px-10 xl:px-6 xl:pt-3 xl:pb-5/);
  assert.doesNotMatch(landingLayout, /ListenerAppShell/);
  assert.doesNotMatch(landingLayout, /DesktopSidebar/);
  assert.doesNotMatch(landingLayout, /DesktopRightColumn/);
  assert.doesNotMatch(landingPage, /ListenerAppShell/);
  assert.doesNotMatch(view, /ListenerAppShell/);
  assert.match(landingLayout, /data-meditation-solutions-shell/);
  assert.match(landingLayout, /min-h-dvh/);
}

function testHeroProductCard() {
  const view = read(
    "src/components/landings/25-meditation-solutions/MeditationSolutionsLandingView.tsx",
  );

  assert.match(view, /data-meditation-solutions-hero-card/);
  assert.match(view, /data-meditation-solutions-hero-cover/);
  assert.match(view, /data-meditation-solutions-hero-title/);
  assert.match(view, /aspect-square/);
  assert.match(view, /object-contain/);
  assert.match(view, /rounded-\[22px\]/);
  assert.match(view, /rounded-\[28px\]/);
  assert.match(view, /border-\[#e8def5\]/);
  assert.match(view, /max-w-\[300px\]/);
  assert.match(view, /sm:max-w-\[340px\]/);
  assert.match(view, /text-center/);
  assert.match(
    view,
    /data-meditation-solutions-hero-title[\s\S]*pt-10/,
  );
  assert.doesNotMatch(
    view,
    /data-meditation-solutions-hero-title[\s\S]*pt-4/,
  );
  assert.doesNotMatch(view, /aspect-\[4\/5\]/);
  assert.doesNotMatch(view, /object-cover/);

  const cardIndex = view.indexOf("data-meditation-solutions-hero-card");
  const titleIndex = view.indexOf("data-meditation-solutions-hero-title");
  const h1Index = view.indexOf("<h1");
  const h1CloseIndex = view.indexOf("</h1>");
  const heroCardCloseIndex = view.indexOf("</div>", view.indexOf("</div>", h1CloseIndex) + 1);
  const subtitleJsxIndex = view.indexOf("{MEDITATION_SOLUTIONS_SUBTITLE}");
  const offerJsxIndex = view.indexOf("{MEDITATION_SOLUTIONS_OFFER_LINE}");
  const topCtaIndex = view.indexOf('placement="top"');

  assert.ok(cardIndex >= 0, "hero card container");
  assert.ok(titleIndex > cardIndex, "title zone inside card");
  assert.ok(h1Index > titleIndex, "H1 lives in the title zone");
  assert.ok(
    subtitleJsxIndex > heroCardCloseIndex,
    "subtitle stays below the hero card",
  );
  assert.ok(offerJsxIndex > subtitleJsxIndex, "offer line stays below subtitle");
  assert.ok(topCtaIndex > offerJsxIndex, "top CTA stays below offer copy");
  assert.match(
    view,
    /data-meditation-solutions-hero-title[\s\S]*<h1[\s\S]*MEDITATION_SOLUTIONS_H1[\s\S]*<\/h1>/,
  );
  assert.doesNotMatch(
    view.slice(cardIndex, heroCardCloseIndex),
    /\{MEDITATION_SOLUTIONS_SUBTITLE\}/,
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
testCardFormats();
testPromotionWindowReuse();
testExpiryUi();
testCheckoutWiring();
testProductImagesOnBranch();
testSeoAndShell();
testDedicatedLandingShell();
testHeroProductCard();
testNoPageBuilder();

console.log("meditation-solutions-landing-unit: ok");
