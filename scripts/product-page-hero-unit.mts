import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MEDITATION_SOLUTIONS_CARDS } from "../src/lib/landings/25-meditation-solutions/content.ts";
import {
  buildCoverFirstHeroSlides,
  buildPracticeHeroLightMeta,
  formatHeroMaterialsMeta,
  isHeroPromoOfferActive,
  resolvePracticeHeroSubtitle,
  shouldRenderProductHeroSlider,
} from "../src/lib/catalog/product-hero-gallery.ts";

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
  assert.match(hero, /<PracticeProductCover/);
  assert.match(productHero, /data-practice-hero-has-gallery/);
  assert.match(productHero, /PracticeHeroGallery/);
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
  assert.equal(urls.length, 26);
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
      alt: MEDITATION_SOLUTIONS_CARDS[index]?.format ?? "",
    })),
  );

  assert.equal(pages.length, 27, "cover + 26 material slides");
  assert.equal(pages[0]?.src, "/products/25-meditation-solutions/hero.jpg");
  assert.equal(pages[1]?.src, "/products/25-meditation-solutions/item-01.jpg");
  assert.equal(pages[25]?.src, "/products/25-meditation-solutions/item-25.jpg");
  assert.equal(pages[26]?.src, "/products/25-meditation-solutions/bonus-26.jpg");
  assert.equal(
    formatHeroMaterialsMeta(
      MEDITATION_SOLUTIONS_CARDS.map((card) => ({
        alt: `${card.title} · ${card.format}`,
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
  const landing = read(
    "src/app/(platform)/p/25-gotovyh-resheniy-dlya-sozdaniya-svoih-meditaciy/page.tsx",
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
  assert.match(hero, /PRODUCT_FORMAT_LINE_CLASS/);
  assert.match(landing, /MeditationSolutionsLandingView/);
  assert.doesNotMatch(landing, /permanentRedirect|301/);

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

testSliderOnlyWhenGalleryExists();
testPromoBlockOnlyWhenOfferActive();
testNoGalleryNoPromoFallback();
testMeditationSolutionsGalleryOrder();
testReusablePdpWiring();
testStandardPdpNotBroken();

console.log("product-page-hero-unit: ok");
