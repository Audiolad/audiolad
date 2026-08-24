import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testEntitledPlayStaysOnLibrary() {
  const card = read("src/components/my-practices/LibraryCard.tsx");
  const play = read("src/components/my-practices/LibraryCardPlayButton.tsx");

  assert.match(card, /LibraryCardPlayButton/);
  assert.match(card, /canEntitledPlay/);
  assert.match(card, /variant="full"/);
  assert.doesNotMatch(card, /buildListenPath/);
  assert.doesNotMatch(card, /LISTEN_AUTOPLAY/);
  assert.doesNotMatch(card, /\/listen\?autoplay|href=\{listenHref\}/);
  assert.doesNotMatch(card, /href=\{?["'`]\/listen/);

  assert.match(play, /fetchCatalogPlaySession/);
  assert.match(play, /loadSession/);
  assert.match(play, /entrySurface: "library"/);
  assert.match(play, /suppressListenUrlSync: true/);
  assert.match(play, /data-library-full-play/);
  assert.doesNotMatch(play, /buildListenPath|href=.*\/listen/);
  assert.doesNotMatch(play, /entrySurface: "catalog"|entrySurface: "home"|entrySurface: "product"/);
}

function testLockedPreviewUnchanged() {
  const card = read("src/components/my-practices/LibraryCard.tsx");
  const preview = read(
    "src/components/my-practices/LibraryCardPreviewPlayButton.tsx",
  );
  const play = read("src/components/my-practices/LibraryCardPlayButton.tsx");

  assert.match(card, /LibraryCardPreviewPlayButton/);
  assert.match(card, /canPreviewPlay && authorSlug && practice/);
  assert.match(preview, /variant="preview"/);
  assert.match(preview, /LibraryCardPlayButton/);
  assert.match(play, /data-library-preview-play/);
  assert.match(play, /entrySurface: "library"/);
  assert.match(play, /fetchCatalogPlaySession/);
  assert.doesNotMatch(preview, /buildListenPath|\/listen\?autoplay/);
}

function testBoundaries() {
  const catalogPlay = read("src/components/products/CatalogProductPlayButton.tsx");
  const homePlay = read("src/components/home/HomeProductPlayButton.tsx");
  const productPlay = read(
    "src/components/products/practice-page/PracticeListenCtaLink.tsx",
  );
  const collection = read("src/lib/library/collection.ts");
  const access = read("src/lib/products/access.ts");

  assert.match(catalogPlay, /entrySurface: "catalog"/);
  assert.doesNotMatch(catalogPlay, /entrySurface: "library"/);
  assert.doesNotMatch(homePlay, /entrySurface: "library"/);
  assert.match(productPlay, /entrySurface: "product"/);
  assert.doesNotMatch(collection, /LibraryCardPlayButton|LibraryCardPreviewPlayButton/);
  assert.doesNotMatch(access, /LibraryCardPlayButton|entrySurface: "library"/);
}

testEntitledPlayStaysOnLibrary();
testLockedPreviewUnchanged();
testBoundaries();

console.log("library-entitled-play-unit: ok");
