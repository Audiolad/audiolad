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
  assert.match(mobile, /toPracticeHeartProduct\(viewModel\)/);
  assert.match(desktop, /toPracticeHeartProduct\(viewModel\)/);
  assert.doesNotMatch(mobile, /PracticeLibraryActionSection|LibraryAddButton/);
  assert.doesNotMatch(desktop, /PracticeLibraryActionSection|LibraryAddButton/);
  assert.match(page, /listSavedPracticeIds/);
  assert.match(page, /isSaved/);
}

function compactBuyClassSource(parts: string) {
  const start = parts.indexOf("const compactBuyClassName");
  const end = parts.indexOf(";", start);
  return parts.slice(start, end);
}

function testBeforePurchaseRowKeepsBuy() {
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
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
    parts.indexOf("const compactBuyClassName"),
  );

  assert.match(
    meta,
    /primaryAction\.kind !== "buy"/,
    "paid price pill is hidden above the title",
  );
  assert.match(meta, /statusBadge/, "non-buy badges stay in meta");

  const purchaseRow = action.indexOf("flex items-center justify-between");
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

  assert.match(action, /compactBuyClassName/, "paid buy uses a compact class");
  assert.match(
    compactBuyClassSource(parts),
    /min-h-11/,
    "mobile buy keeps a 44px touch target",
  );
  assert.doesNotMatch(
    compactBuyClassSource(parts),
    /\bw-full\b/,
    "compact buy class is not full width",
  );
  assert.match(
    action,
    /className=\{compactBuyClassName\}/,
    "BuyPracticeButton uses the compact class only",
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

  const mobileCta = mobile.indexOf("<PracticePrimaryActionSection");
  const mobileDescription = mobile.indexOf("description ?");
  const mobileContents = mobile.indexOf("<ProductContentsSection");
  assert.ok(mobileCta >= 0, "mobile mounts the primary CTA");
  assert.ok(
    mobileCta < mobileDescription,
    "mobile CTA appears before description",
  );
  assert.ok(
    mobileCta < mobileContents,
    "mobile CTA appears before ProductContentsSection",
  );

  assert.doesNotMatch(
    desktop,
    /mt-auto/,
    "desktop CTA is not pinned to the cover baseline",
  );
  assert.match(desktop, /PracticePrimaryActionSection/);

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
