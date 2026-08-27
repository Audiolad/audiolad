import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testPrimaryPlayStaysOnPractice() {
  const cta = read(
    "src/components/products/practice-page/PracticeListenCtaLink.tsx",
  );
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );

  assert.match(cta, /fetchCatalogPlaySession/);
  assert.match(cta, /loadSession/);
  assert.match(cta, /entrySurface: "product"/);
  assert.match(cta, /suppressListenUrlSync: true/);
  assert.match(cta, /prepareSharedAudioGesture/);
  assert.match(cta, /data-practice-primary-play/);
  assert.doesNotMatch(cta, /<Link|href=/);
  assert.doesNotMatch(cta, /buildListenPath|\/listen\?autoplay/);
  assert.match(parts, /PracticeListenCtaLink/);
  assert.match(parts, /showPrimaryPlay/);
  assert.match(parts, /kind === "listen"/);
  assert.match(parts, /kind === "buy"/);
}

function testHeartOnCover() {
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  const hero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  const gallery = read(
    "src/components/products/practice-page/PracticeHeroGallery.tsx",
  );
  const mobile = read(
    "src/components/products/practice-page/PracticePageMobile.tsx",
  );
  const desktop = read(
    "src/components/products/practice-page/PracticePageDesktop.tsx",
  );
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );

  assert.match(parts, /CatalogProductHeartButton/);
  assert.match(parts, /relative aspect-square/);
  assert.match(parts, /function PracticeLibraryActionSection[\s\S]*LibraryAddButton/);
  assert.match(hero, /toPracticeHeartProduct\(viewModel\)/);
  assert.match(gallery, /CatalogProductHeartButton/);
  assert.match(mobile, /PracticeProductHero/);
  assert.match(desktop, /PracticeProductHero/);
  assert.doesNotMatch(mobile, /PracticeLibraryActionSection|LibraryAddButton/);
  assert.doesNotMatch(desktop, /PracticeLibraryActionSection|LibraryAddButton/);
  assert.match(page, /listSavedPracticeIds/);
  assert.match(page, /isSaved/);
}

function featuredBuyClassSource(card: string) {
  const start = card.indexOf("export const FEATURED_CARD_PRIMARY_CTA_CLASS");
  const end = card.indexOf(";", start);
  return card.slice(start, end);
}

function testBeforePurchaseRowKeepsBuy() {
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  const hero = read(
    "src/components/products/practice-page/PracticeProductHero.tsx",
  );
  const featuredCard = read("src/components/home/FeaturedProductCard.tsx");
  const mobile = read(
    "src/components/products/practice-page/PracticePageMobile.tsx",
  );
  const desktop = read(
    "src/components/products/practice-page/PracticePageDesktop.tsx",
  );
  const audioPost = read("src/components/products/audio-post/AudioPostPage.tsx");

  assert.match(parts, /BuyPracticeButton/);
  assert.match(parts, /kind === "buy"/);
  assert.doesNotMatch(parts, /createCheckout|fulfillTochka/);

  const meta = parts.slice(
    parts.indexOf("export function PracticeMetaSection"),
    parts.indexOf("export function PracticePrimaryActionSection"),
  );
  const action = parts.slice(
    parts.indexOf("export function PracticePrimaryActionSection"),
  );
  const legalFn = parts.slice(
    parts.indexOf("function PaymentLegalNote"),
    parts.indexOf("export function toPracticeHeartProduct"),
  );

  assert.match(
    meta,
    /primaryAction\.kind !== "buy"/,
    "paid price pill is hidden above the title",
  );
  assert.match(meta, /statusBadge/, "non-buy badges stay in meta");

  const purchaseRow = action.indexOf("data-practice-hero-sell");
  const buyButton = action.indexOf("<BuyPracticeButton");
  const previewPlay = action.indexOf("<PracticeListenCtaLink");
  const legalNote = action.indexOf("<PaymentLegalNote");

  assert.ok(purchaseRow >= 0, "paid CTA has a purchase row");
  assert.ok(purchaseRow < previewPlay, "price/buy row is before preview play");
  assert.ok(
    buyButton >= 0 && buyButton < previewPlay,
    "BuyPracticeButton is before PracticeListenCtaLink",
  );
  assert.match(action, /PREVIEW_ACTION_LABEL/, "preview uses PREVIEW_ACTION_LABEL");
  assert.ok(
    previewPlay >= 0 && previewPlay < legalNote,
    "preview play is before PaymentLegalNote",
  );

  assert.match(
    action,
    /data-practice-hero-actions/,
    "Buy + Listen share one actions row",
  );
  assert.match(
    action,
    /FEATURED_CARD_PRIMARY_CTA_CLASS/,
    "paid buy uses the homepage featured CTA class",
  );
  assert.match(
    featuredBuyClassSource(featuredCard),
    /min-h-11/,
    "featured buy keeps a 44px touch target",
  );
  assert.doesNotMatch(
    featuredBuyClassSource(featuredCard),
    /\bw-full\b/,
    "featured buy is not a full-width invented plate",
  );
  assert.match(
    action,
    /className=\{FEATURED_CARD_PRIMARY_CTA_CLASS\}/,
    "BuyPracticeButton uses the featured card CTA class",
  );
  assert.doesNotMatch(
    action,
    /bg-\[#f4ecfb\]/,
    "sell zone does not invent a purple price plate",
  );

  assert.match(legalFn, /text-xs/, "PaymentLegalNote is smaller");
  assert.match(legalFn, /text-\[#7d70a2\]/, "PaymentLegalNote stays secondary");
  assert.match(action, /showPaymentLegalNote/, "legal note still mounts on paid");

  assert.match(
    action,
    /presentation\.primaryAction\.kind === "listen"/,
    "free/listen path still uses the existing listen label",
  );
  assert.doesNotMatch(
    action,
    /kind === "listen"[\s\S]{0,120}<BuyPracticeButton/,
    "listen path does not render BuyPracticeButton",
  );

  const mobileCta = mobile.indexOf("<PracticeProductHero");
  const mobileDescription = mobile.indexOf("description ?");
  const mobileContents = mobile.indexOf("<ProductContentsSection");
  assert.match(hero, /PracticePrimaryActionSection/, "hero mounts the primary CTA");
  assert.ok(mobileCta >= 0, "mobile mounts the product hero");
  assert.ok(
    mobileCta < mobileContents,
    "mobile CTA appears before ProductContentsSection",
  );
  assert.ok(
    mobileCta < mobileDescription,
    "mobile CTA appears before description",
  );
  assert.ok(
    mobileContents < mobileDescription,
    "mobile contents appear before the description block",
  );

  const desktopCta = desktop.indexOf("<PracticeProductHero");
  const desktopDescription = desktop.indexOf("description ?");
  const desktopContents = desktop.indexOf("<ProductContentsSection");
  assert.doesNotMatch(
    desktop,
    /mt-auto/,
    "desktop CTA is not pinned to the cover baseline",
  );
  assert.ok(desktopCta >= 0, "desktop mounts the product hero");
  assert.ok(
    desktopCta < desktopContents,
    "desktop CTA appears before ProductContentsSection",
  );
  assert.ok(
    desktopCta < desktopDescription,
    "desktop CTA appears before description",
  );
  assert.ok(
    desktopContents < desktopDescription,
    "desktop contents appear before the description block",
  );

  assert.doesNotMatch(
    audioPost,
    /PracticePrimaryActionSection/,
    "audio_post stays out of the practice CTA reorder",
  );
}

function testBoundaries() {
  const play = read("src/components/products/CatalogProductPlayButton.tsx");
  const collection = read("src/lib/library/collection.ts");
  const access = read("src/lib/products/access.ts");
  const cta = read(
    "src/components/products/practice-page/PracticeListenCtaLink.tsx",
  );

  assert.doesNotMatch(play, /entrySurface: "product"/);
  assert.doesNotMatch(collection, /PracticeListenCtaLink|practice-page/);
  assert.doesNotMatch(access, /library_saves|isSaved/);
  assert.doesNotMatch(cta, /Избранн|Favorites|LibraryAddButton/);
}

testPrimaryPlayStaysOnPractice();
testHeartOnCover();
testBeforePurchaseRowKeepsBuy();
testBoundaries();

console.log("product-page-core-ux-unit: ok");
