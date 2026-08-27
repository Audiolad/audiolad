import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testSharedShellIsTheHomepageCard() {
  const shell = read("src/components/home/FeaturedProductCard.tsx");
  const homeHero = read("src/components/home/HeroFeaturedProduct.tsx");
  const pdpHero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  const guestHome = read("src/components/home/GuestHome.tsx");
  const homeCard = read("src/components/home/HomeProductCard.tsx");

  assert.match(shell, /featured-card featured-card--guest overflow-hidden rounded-\[28px\]/);
  assert.match(shell, /featured-card__content/);
  assert.match(
    shell,
    /inline-flex rounded-full bg-\[#f4ecfb\] px-3 py-1 text-xs font-medium text-\[#7042c5\]/,
  );
  assert.match(
    shell,
    /mt-3 text-\[22px\] font-semibold leading-tight text-\[#25135c\]/,
  );
  assert.match(
    shell,
    /inline-flex min-h-11 items-center gap-2 rounded-2xl bg-\[#7042c5\] px-5 py-3 text-sm font-semibold text-white/,
  );

  assert.match(homeHero, /FeaturedProductCard/);
  assert.match(homeHero, /FEATURED_CARD_CHIP_CLASS/);
  assert.match(homeHero, /FEATURED_CARD_TITLE_CLASS/);
  assert.match(homeHero, /FEATURED_CARD_PRIMARY_CTA_CLASS/);
  assert.match(homeHero, /HomeProductPlayButton/);
  assert.match(homeHero, /href=\{product\.href\}/);
  assert.match(homeHero, /className="mt-8"/);
  assert.match(homeHero, /featured-card__cover/);
  assert.match(homeHero, /ProductCoverThumbnail/);

  assert.match(pdpHero, /FeaturedProductCard/);
  assert.match(pdpHero, /FEATURED_CARD_CHIP_CLASS/);
  assert.match(pdpHero, /FEATURED_CARD_TITLE_CLASS/);
  assert.match(pdpHero, /PracticeHeroGallery/);
  assert.doesNotMatch(pdpHero, /PRODUCT_FORMAT_LINE_CLASS/);
  assert.doesNotMatch(pdpHero, /grid-cols-\[minmax/);
  assert.doesNotMatch(pdpHero, /rounded-\[28px\] border border-\[#eadff8\]/);

  assert.match(guestHome, /HeroFeaturedProduct/);
  assert.doesNotMatch(homeCard, /featured-card--guest/);
}

function testGuestGeometryIsSharedNotHomeScoped() {
  const css = read("src/app/globals.css");

  assert.match(
    css,
    /\.featured-card\s*\{[^}]*border:\s*1px solid #eadff8;/,
    "shared card border",
  );
  assert.match(
    css,
    /\.featured-card\s*\{[^}]*box-shadow:\s*0 12px 30px rgba\(91, 62, 145, 0\.08\)/,
    "shared card shadow",
  );
  assert.match(css, /\.featured-card__cover\s*\{[^}]*aspect-ratio:\s*1 \/ 1/);
  assert.match(
    css,
    /@media \(min-width: 640px\)[\s\S]*\.featured-card__cover\s*\{[^}]*width:\s*200px/,
  );
  assert.match(
    css,
    /@media \(min-width: 1024px\)[\s\S]*\.featured-card--guest \.featured-card__cover\s*\{[^}]*width:\s*min\(56%, 360px\)/,
  );
  assert.match(
    css,
    /@media \(min-width: 1024px\)[\s\S]*\.featured-card--guest \.featured-card__content\s*\{[^}]*width:\s*44%/,
  );
  assert.doesNotMatch(
    css,
    /\.listener-home-content \.featured-card--guest \.featured-card__cover/,
    "guest desktop geometry is not homepage-only",
  );
}

function testHomepageGuestCardRulesStayPixelEquivalent() {
  const css = read("src/app/globals.css");
  const homeHero = read("src/components/home/HeroFeaturedProduct.tsx");

  assert.match(
    css,
    /@media \(min-width: 1024px\)[\s\S]*\.featured-card--guest \.featured-card__cover\s*\{[^}]*width:\s*min\(56%, 360px\)/,
  );
  assert.match(
    css,
    /@media \(min-width: 1024px\)[\s\S]*\.featured-card--guest \.featured-card__content\s*\{[^}]*width:\s*44%/,
  );
  assert.match(
    css,
    /\.listener-home-content \.featured-card__cover\s*\{[^}]*width:\s*168px/,
  );
  assert.match(
    css,
    /\.listener-home-content \.featured-card__content\s*\{[^}]*padding:\s*1rem 1\.125rem/,
  );
  assert.doesNotMatch(
    homeHero,
    /practice-product-hero|data-practice-product-hero/,
    "homepage hero must not pick up PDP geometry hooks",
  );
  assert.match(
    css,
    /\[data-practice-product-hero="desktop"\][\s\S]*position:\s*absolute/,
    "PDP desktop info column is scoped off the homepage card",
  );
}

function testPdpGalleryStaysInCoverSlot() {
  const gallery = read(
    "src/components/products/practice-page/PracticeHeroGallery.tsx",
  );
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );

  assert.match(gallery, /featured-card__cover/);
  assert.doesNotMatch(gallery, /object-cover/);
  assert.match(gallery, /\{activeIndex \+ 1\} \/ \{pages\.length\}/);
  assert.match(gallery, /showMobileDots/);
  assert.match(gallery, /data-practice-hero-dots/);
  assert.match(parts, /FEATURED_CARD_PRIMARY_CTA_CLASS/);
  assert.doesNotMatch(parts, /heroBuyClassName/);
  assert.doesNotMatch(parts, /bg-\[#f4ecfb\] px-4 py-4/);
}

testSharedShellIsTheHomepageCard();
testGuestGeometryIsSharedNotHomeScoped();
testHomepageGuestCardRulesStayPixelEquivalent();
testPdpGalleryStaysInCoverSlot();

console.log("homepage-featured-card-unit: ok");
