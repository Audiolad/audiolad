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

function testBeforePurchaseRowKeepsBuy() {
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );

  assert.match(parts, /BuyPracticeButton/);
  assert.match(parts, /kind === "buy"/);
  assert.doesNotMatch(parts, /createCheckout|fulfillTochka/);
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
