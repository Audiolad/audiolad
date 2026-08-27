import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRACTICE_HERO_DOT_WINDOW,
  buildCoverFirstHeroSlides,
  buildPracticeHeroLightMeta,
  buildWindowedHeroDots,
  formatHeroMaterialsMeta,
  isHeroPromoOfferActive,
  resolvePracticeHeroSubtitle,
  shouldRenderProductHeroSlider,
} from "../src/lib/catalog/product-hero-gallery";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const GALLERY_SEED =
  "supabase/migrations/20260829120000_seed_25_meditation_solutions_gallery.sql";
const PRACTICE_SEED =
  "supabase/migrations/20260828120000_seed_25_meditation_solutions_practice.sql";

function expectedGalleryUrls() {
  return [
    ...Array.from({ length: 25 }, (_, index) =>
      `/products/25-meditation-solutions/item-${String(index + 1).padStart(2, "0")}.jpg`,
    ),
    "/products/25-meditation-solutions/bonus-26.jpg",
  ];
}

function testSliderOnlyWhenGalleryExists() {
  const coverOnly = buildCoverFirstHeroSlides(
    { displayUrl: "/cover.jpg", alt: "Cover" },
    [],
  );
  assert.equal(coverOnly.length, 1);
  assert.equal(coverOnly[0]?.type, "cover");
  assert.equal(shouldRenderProductHeroSlider(coverOnly), false);

  const withSlides = buildCoverFirstHeroSlides(
    { displayUrl: "/cover.jpg", alt: "Cover" },
    [
      { id: "s1", image_url: "/slide-1.jpg", position: 0, alt: "One · PDF" },
      { id: "s2", image_url: "/slide-2.jpg", position: 1, alt: "Two · Аудио" },
    ],
  );
  assert.equal(withSlides.length, 3);
  assert.equal(withSlides[0]?.type, "cover");
  assert.equal(withSlides[1]?.type, "slide");
  assert.equal(shouldRenderProductHeroSlider(withSlides), true);

  const hero = read("src/components/products/practice-page/PracticeHeroGallery.tsx");
  const productHero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  assert.match(hero, /shouldRenderProductHeroSlider/);
  assert.match(hero, /featured-card__cover/);
  assert.doesNotMatch(hero, /rounded-\[28px\]|shadow-\[0_22px_48px/);
  assert.match(productHero, /data-practice-hero-has-gallery/);
  assert.match(productHero, /PracticeHeroGallery/);
  assert.match(productHero, /FeaturedProductCard/);
}

function testPromoBlockOnlyWhenOfferActive() {
  const now = Date.now();
  const active = isHeroPromoOfferActive({
    basePrice: 4999,
    salePrice: 499,
    endsAt: null,
    expiresAt: new Date(now + 60_000).toISOString(),
  });
  const expired = isHeroPromoOfferActive({
    basePrice: 4999,
    salePrice: 499,
    endsAt: null,
    expiresAt: new Date(now - 1_000).toISOString(),
  });
  const regular = isHeroPromoOfferActive({
    basePrice: 4999,
    salePrice: null,
    endsAt: null,
    expiresAt: null,
  });

  assert.equal(active, true);
  assert.equal(expired, false);
  assert.equal(regular, false);

  const offer = read("src/components/pricing/ProductPriceOffer.tsx");
  const hero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  assert.match(offer, /data-product-price-offer="promo"/);
  assert.match(offer, /data-product-price-offer="regular"/);
  assert.match(offer, /Предложение действует ещё:/);
  assert.match(offer, /мин\./);
  assert.match(
    offer,
    /Это предложение показывается вам один раз\. После окончания таймера/,
  );
  assert.match(hero, /isHeroPromoOfferActive/);
  assert.match(hero, /data-practice-hero-has-promo/);
}

function testNoGalleryNoPromoFallback() {
  const lightMeta = buildPracticeHeroLightMeta({
    gallerySlides: [],
    productTypeLabel: "Аудиопрактика",
    formatMeta: "Аудиопрактика · 12 мин",
  });
  assert.equal(lightMeta, "12 мин");

  const noExtra = buildPracticeHeroLightMeta({
    gallerySlides: [],
    productTypeLabel: "Аудиопрактика",
    formatMeta: "Аудиопрактика",
  });
  assert.equal(noExtra, null);

  const coverOnly = buildCoverFirstHeroSlides(
    { displayUrl: "/cover.jpg", alt: "Cover" },
    [],
  );
  assert.equal(shouldRenderProductHeroSlider(coverOnly), false);
  assert.equal(
    isHeroPromoOfferActive({
      basePrice: 900,
      salePrice: null,
      endsAt: null,
      expiresAt: null,
    }),
    false,
  );

  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  assert.match(parts, /kind === "listen"/);
  assert.match(parts, /BuyPracticeButton/);
  assert.match(parts, /PracticeListenCtaLink/);
}

function testMeditationSolutionsGalleryOrder() {
  const seed = read(GALLERY_SEED);
  const practiceSeed = read(PRACTICE_SEED);
  const urls = [...seed.matchAll(/'\/products\/25-meditation-solutions\/[^']+'/g)].map(
    (match) => match[0].slice(1, -1),
  );

  assert.deepEqual(urls, expectedGalleryUrls());
  assert.equal(urls.length, expectedGalleryUrls().length);
  assert.equal(
    urls.includes("/products/25-meditation-solutions/hero.jpg"),
    false,
    "cover is not a gallery row",
  );
  assert.match(
    practiceSeed,
    /'\/products\/25-meditation-solutions\/hero\.jpg'/,
  );
  assert.doesNotMatch(practiceSeed, /publication_gallery_slides/);
  assert.match(seed, /ON CONFLICT \(id\) DO UPDATE/);
  assert.doesNotMatch(seed, /UPDATE\s+public\.practices/i);
  assert.doesNotMatch(seed, /practice_price_promotions/);
  assert.doesNotMatch(seed, /20260828120000/);

  const pages = buildCoverFirstHeroSlides(
    {
      displayUrl: "/products/25-meditation-solutions/hero.jpg",
      alt: "25 готовых решений для создания своих медитаций",
    },
    expectedGalleryUrls().map((image_url, index) => ({
      id: `slide-${index + 1}`,
      image_url,
      position: index,
      alt: index === expectedGalleryUrls().length - 1 ? "Бонус · PDF + аудио" : "Материал · PDF",
    })),
  );

  const leftoverSeedPages = expectedGalleryUrls().length + 1;
  assert.equal(
    pages.length,
    leftoverSeedPages,
    "cover + whatever the leftover seed actually lists",
  );
  assert.equal(pages[0]?.src, "/products/25-meditation-solutions/hero.jpg");
  assert.equal(pages[1]?.src, "/products/25-meditation-solutions/item-01.jpg");
  assert.equal(pages[leftoverSeedPages - 2]?.src, "/products/25-meditation-solutions/item-25.jpg");
  assert.equal(
    pages[leftoverSeedPages - 1]?.src,
    expectedGalleryUrls().at(-1),
  );
  assert.equal(
    formatHeroMaterialsMeta(
      expectedGalleryUrls().map((url, index) => ({
        alt:
          index === expectedGalleryUrls().length - 1
            ? "Бонус · PDF + аудио"
            : "Материал · PDF",
      })),
    ),
    "26 материалов · PDF и аудио",
  );

  const imageDir = join(repoRoot, "public/products/25-meditation-solutions");
  for (const name of ["hero.jpg", ...expectedGalleryUrls().map((url) => url.split("/").at(-1)!)]) {
    assert.equal(existsSync(join(imageDir, name)), true, name);
  }
}

function testReusablePdpWiring() {
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const mobile = read(
    "src/components/products/practice-page/PracticePageMobile.tsx",
  );
  const desktop = read(
    "src/components/products/practice-page/PracticePageDesktop.tsx",
  );
  const hero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );

  assert.match(page, /loadPublicationGalleriesByIds/);
  assert.match(page, /catalogGalleryForPublication/);
  assert.match(page, /PRICE_SURFACES\.PRODUCT/);
  assert.match(page, /resolvePracticePriceRpc/);
  assert.match(page, /PricePromotionStartHandler/);
  assert.match(page, /resolvePracticeHeroSubtitle/);
  assert.match(page, /buildPracticeHeroLightMeta/);
  assert.doesNotMatch(page, /25-meditation-solutions/);
  assert.doesNotMatch(hero, /25-meditation-solutions/);
  assert.match(mobile, /ListenerAppShell|PracticeProductHero/);
  assert.match(desktop, /PracticeProductHero/);
  assert.match(hero, /FEATURED_CARD_CHIP_CLASS/);
  assert.match(hero, /data-practice-hero-type-chip/);
  assert.doesNotMatch(hero, /w-full|flex-grow/);
  assert.match(hero, /FeaturedProductCard/);

  const chipClass = read("src/components/home/FeaturedProductCard.tsx");
  const chipClassValue =
    /export const FEATURED_CARD_CHIP_CLASS =\s*"([^"]+)"/.exec(chipClass)?.[1] ??
    "";
  assert.match(chipClassValue, /inline-flex/);
  assert.match(chipClassValue, /w-fit|featured-card__chip/);
  assert.doesNotMatch(chipClassValue, /w-full/);

  const css = read("src/app/globals.css");
  assert.match(
    css,
    /\[data-practice-product-hero\][\s\S]*\[data-practice-hero-type-chip\][\s\S]*width:\s*fit-content/,
  );
  assert.match(
    css,
    /\[data-practice-product-hero\][\s\S]*\.featured-card__chip[\s\S]*width:\s*fit-content/,
  );
  assert.match(hero, /practice-product-hero/);
  assert.match(hero, /data-practice-product-hero=\{layout\}/);
  assert.doesNotMatch(hero, /PRODUCT_FORMAT_LINE_CLASS/);
  assert.doesNotMatch(hero, /grid-cols-\[minmax/);

  const subtitle = resolvePracticeHeroSubtitle(
    null,
    "Как создать свою медитацию с нуля: выбрать тему, написать текст для медитации, записать медитацию самостоятельно, добавить музыку и получить готовый MP3.",
  );
  assert.match(subtitle ?? "", /Как создать свою медитацию с нуля/);
  assert.equal(
    resolvePracticeHeroSubtitle(null, `${"длинное описание\n\n".repeat(8)}хвост`),
    null,
  );
}

function testStandardPdpNotBroken() {
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const mobile = read(
    "src/components/products/practice-page/PracticePageMobile.tsx",
  );
  const desktop = read(
    "src/components/products/practice-page/PracticePageDesktop.tsx",
  );

  assert.match(parts, /BuyPracticeButton/);
  assert.match(parts, /PracticeListenCtaLink/);
  assert.match(parts, /CatalogProductHeartButton/);
  assert.match(parts, /PublishPreviewBanner/);
  assert.match(page, /publishPreview/);
  assert.match(mobile, /ProductContentsSection/);
  assert.match(desktop, /ProductContentsSection/);
  assert.match(mobile, /description \?/);
  assert.match(desktop, /description \?/);
}

function testDesktopHeroHeightFollowsSquareCover() {
  const css = read("src/app/globals.css");
  const hero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );

  const desktopBlock = css.slice(
    css.indexOf('[data-practice-product-hero="desktop"]'),
  );

  assert.match(
    hero,
    /className="practice-product-hero"/,
    "PDP hero is marked for scoped geometry",
  );
  assert.match(
    desktopBlock,
    /\[data-practice-product-hero="desktop"\] \.featured-card__cover\s*\{[^}]*aspect-ratio:\s*1 \/ 1/,
    "desktop cover stays 1:1",
  );
  assert.match(
    desktopBlock,
    /\[data-practice-product-hero="desktop"\] \.featured-card__content\s*\{[^}]*position:\s*absolute/,
    "info column is fitted inside the square height",
  );
  assert.match(
    desktopBlock,
    /inset:\s*0 0 0 min\(56%, 360px\)/,
    "info column starts at the square cover edge",
  );
  assert.doesNotMatch(
    desktopBlock.slice(
      0,
      desktopBlock.indexOf("[data-practice-product-hero=\"mobile\"]") === -1
        ? desktopBlock.length
        : desktopBlock.indexOf("[data-practice-product-hero=\"mobile\"]"),
    ),
    /object-fit:\s*cover/,
    "do not stretch the cover to fill leftover white",
  );
  assert.match(
    desktopBlock,
    /\.practice-product-hero__actions\s*\{[^}]*flex-wrap:\s*nowrap/,
    "desktop Buy + Listen stay on one row",
  );
  assert.match(
    css,
    /\[data-practice-product-hero="mobile"\] \.practice-product-hero__actions\s*\{[^}]*flex-wrap:\s*nowrap/,
    "mobile Buy + Listen stay on one row",
  );
  assert.match(
    css,
    /\[data-practice-product-hero="mobile"\] \.practice-product-hero__actions\s*\{[^}]*align-items:\s*stretch/,
    "mobile CTA row stretches both buttons to one height",
  );
  assert.match(
    css,
    /\[data-practice-product-hero="mobile"\] \.practice-product-hero__actions > :first-child\s*\{[^}]*flex:\s*0 0 auto/,
    "mobile Buy stays compact",
  );
  assert.match(
    css,
    /\[data-practice-product-hero="mobile"\][\s\S]*\[data-practice-primary-play\]:not\(:only-child\)\s*\{[^}]*flex:\s*1 1 0/,
    "mobile Listen takes leftover width",
  );
  assert.doesNotMatch(
    css,
    /\[data-practice-product-hero="mobile"\] \.practice-product-hero__actions\s*\{[^}]*flex-wrap:\s*wrap/,
    "mobile CTA row must not wrap",
  );
  assert.match(
    desktopBlock,
    /\.practice-product-hero__legal\s*\{[^}]*font-size:\s*10px/,
    "legal copy is visually secondary on desktop",
  );
  assert.match(
    desktopBlock,
    /\[data-practice-hero-has-promo="true"\][\s\S]*gap:\s*0\.25rem/,
    "promo state uses denser gaps instead of a hardcoded no-promo height",
  );
  assert.match(parts, /data-practice-hero-actions/);
  assert.match(parts, /data-practice-hero-legal/);
  assert.match(parts, /FEATURED_CARD_ACTIONS_CLASS/);
  assert.match(parts, /FEATURED_CARD_PRIMARY_CTA_CLASS/);
  assert.match(parts, /FEATURED_CARD_SECONDARY_CTA_CLASS/);
  assert.doesNotMatch(
    parts,
    /heroBuyClassName|w-full rounded-\[22px\] bg-\[#7c3fe4\]/,
    "no invented button design",
  );
}

function testMobileWindowedDotsKeepDesktopArrows() {
  const many = 40;
  const dots = buildWindowedHeroDots(0, many);
  assert.equal(PRACTICE_HERO_DOT_WINDOW, 5);
  assert.equal(dots.length, PRACTICE_HERO_DOT_WINDOW);
  assert.ok(dots.length < many, "large N must not render one micro-dot per slide");
  assert.equal(dots[0]?.index, 0);
  assert.equal(dots[0]?.active, true);
  assert.equal(dots[dots.length - 1]?.edge, true, "trailing edge hints more slides");

  const midIndex = Math.floor((many - 1) / 2);
  const mid = buildWindowedHeroDots(midIndex, many);
  const half = Math.floor(PRACTICE_HERO_DOT_WINDOW / 2);
  assert.equal(mid.length, PRACTICE_HERO_DOT_WINDOW);
  assert.ok(mid.length < many);
  assert.deepEqual(
    mid.map((dot) => dot.index),
    Array.from(
      { length: PRACTICE_HERO_DOT_WINDOW },
      (_, offset) => midIndex - half + offset,
    ),
  );
  assert.equal(mid[half]?.active, true);
  assert.equal(mid[0]?.edge, true);
  assert.equal(mid[mid.length - 1]?.edge, true);

  const last = buildWindowedHeroDots(many - 1, many);
  assert.equal(last[last.length - 1]?.index, many - 1);
  assert.equal(last[last.length - 1]?.active, true);
  assert.equal(last[0]?.edge, true);

  const few = buildWindowedHeroDots(1, 3);
  assert.equal(few.length, 3);
  assert.equal(
    few.filter((dot) => dot.edge).length,
    0,
    "short galleries need no edge shrink",
  );

  const hero = read("src/components/products/practice-page/PracticeHeroGallery.tsx");
  const productHero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  const css = read("src/app/globals.css");

  assert.match(productHero, /showMobileDots=\{layout === "mobile"\}/);
  assert.match(hero, /buildWindowedHeroDots/);
  assert.match(hero, /data-practice-hero-dots/);
  assert.match(hero, /data-practice-hero-gallery-counter/);
  assert.match(hero, /data-practice-hero-gallery-prev/);
  assert.match(hero, /hidden h-8 w-8[\s\S]*sm:inline-flex/);
  assert.match(hero, /practice-hero-media/);
  assert.match(hero, /buildWindowedHeroDots\(activeIndex, pages\.length\)/);

  assert.match(
    css,
    /@media \(min-width: 640px\)[\s\S]*\.practice-hero-media\s*\{[^}]*display:\s*contents/,
    "tablet/desktop unwrap the mobile media wrapper",
  );
  assert.match(
    css,
    /@media \(min-width: 640px\)[\s\S]*\.practice-hero-dots\s*\{[^}]*display:\s*none/,
    "dots stay off desktop so hover arrows remain the nav",
  );
}

testSliderOnlyWhenGalleryExists();
testPromoBlockOnlyWhenOfferActive();
testNoGalleryNoPromoFallback();
testMeditationSolutionsGalleryOrder();
testReusablePdpWiring();
testStandardPdpNotBroken();
testDesktopHeroHeightFollowsSquareCover();
testMobileWindowedDotsKeepDesktopArrows();

console.log("product-page-hero-unit: ok");
