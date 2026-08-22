#!/usr/bin/env node
/**
 * Phase 1 catalog tile unit checks — no database, no mocks of listing data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPracticePublicPath } from "../src/lib/products/paths.ts";
import {
  CATALOG_TILE_DISPLAY_WIDTH,
  CATALOG_TILE_IMAGE_SIZES,
  CATALOG_TILE_VARIANT_KEYS,
  resolveCatalogCardVisual,
} from "../src/lib/products/catalog-card-visual.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRoot(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function createCatalogProduct(overrides = {}) {
  const authorSlug = overrides.authorSlug ?? "anna-test";
  const slug = overrides.slug ?? "morning-practice";

  return {
    id: "practice-1",
    authorId: "author-1",
    title: "Утренняя практика",
    slug,
    subtitle: null,
    description: null,
    format: "Аудиопрактика",
    productKind: "practice",
    price: 0,
    isFree: true,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    authorName: "Анна",
    authorSlug,
    href: buildPracticePublicPath(authorSlug, slug),
    meta: "12 мин",
    statsLabel: "12 мин",
    productTypeLabel: "Аудиопрактика",
    priceLabel: "Подарок",
    sortTimestamp: 0,
    ...overrides,
  };
}

function createCoverManifest(overrides = {}) {
  return {
    version: 1,
    versionId: "cover-v1",
    profile: "product-cover",
    sourceWidth: 1000,
    sourceHeight: 1000,
    variants: {
      sm: {
        path: "covers/practice/sm.webp",
        width: 160,
        height: 160,
        byteSize: 1200,
        mimeType: "image/webp",
      },
      md: {
        path: "covers/practice/md.webp",
        width: 360,
        height: 360,
        byteSize: 2400,
        mimeType: "image/webp",
      },
      xl: {
        path: "covers/practice/xl.webp",
        width: 1200,
        height: 1200,
        byteSize: 8000,
        mimeType: "image/webp",
      },
    },
    placeholderBlurDataUrl: "data:image/webp;base64,dGlsZQ==",
    ...overrides,
  };
}

function testSquareCoverResolvesToBlurFallback() {
  const product = createCatalogProduct({
    coverUrl: "https://cdn.example/covers/square.jpg",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const visual = resolveCatalogCardVisual(product);

  assert.equal(visual.hasSquareCover, true, "square cover is present");
  assert.equal(visual.fallbackMode, "square_blur", "uses CSS square-blur fallback");
  assert.ok(visual.image?.src, "image src is resolved from existing helpers");
  assert.match(
    visual.image.src,
    /cdn\.example\/covers\/square\.jpg/,
    "legacy square cover url is reused",
  );
  assert.equal(visual.image.sizes, CATALOG_TILE_IMAGE_SIZES);
  assert.deepEqual(visual.additionalVisuals, [], "no gallery visuals in phase 1");
}

function testManifestPrefersSmMdNotXl() {
  const product = createCatalogProduct({
    coverImage: createCoverManifest(),
  });
  const visual = resolveCatalogCardVisual(product);

  assert.equal(visual.fallbackMode, "square_blur");
  assert.ok(visual.image?.src.includes("covers/practice/md.webp"), "src prefers md");
  assert.ok(visual.image.srcSet.includes("covers/practice/sm.webp"));
  assert.ok(visual.image.srcSet.includes("covers/practice/md.webp"));
  assert.equal(
    visual.image.srcSet.includes("covers/practice/xl.webp"),
    false,
    "srcSet does not include xl",
  );
  assert.equal(visual.image.placeholderBlurDataUrl, "data:image/webp;base64,dGlsZQ==");
  assert.deepEqual([...CATALOG_TILE_VARIANT_KEYS], ["sm", "md"]);
  assert.equal(CATALOG_TILE_DISPLAY_WIDTH, 200);
}

function testMissingOptionalVisualsDoesNotThrow() {
  const product = createCatalogProduct({
    coverUrl: null,
    coverImage: undefined,
    updatedAt: undefined,
    subtitle: undefined,
    description: undefined,
    authorName: null,
  });

  const visual = resolveCatalogCardVisual(product);

  assert.equal(visual.hasSquareCover, false);
  assert.equal(visual.fallbackMode, "system");
  assert.equal(visual.image, null);
  assert.deepEqual(visual.additionalVisuals, []);
  assert.ok(visual.systemFallback.gradientClassName);
  assert.ok(visual.systemFallback.symbol);
}

function testLongTitleIsCssClamped() {
  const longTitle =
    "Очень длинное название аудиопрактики которое должно занимать больше двух строк на плитке каталога и не ломать сетку";
  const product = createCatalogProduct({ title: longTitle });
  const visual = resolveCatalogCardVisual(product);

  assert.doesNotThrow(() => resolveCatalogCardVisual(product));
  assert.deepEqual(visual.additionalVisuals, []);
  assert.equal(product.title, longTitle, "resolver does not truncate the title");

  const tile = readRoot("src/components/products/CatalogProductTile.tsx");
  assert.match(tile, /CATALOG_PRODUCT_TILE_TITLE_CLASS/);
  assert.match(tile, /line-clamp-2/);
  assert.match(tile, /min-h-\[44px\]/);
  assert.match(tile, /product\.title/, "full title is rendered");
  assert.doesNotMatch(tile, /title\.slice|substring\(/, "title is not truncated in JS");
}

function testGridClassStructure() {
  const grid = readRoot("src/components/products/ProductGrid.tsx");

  assert.match(grid, /grid-cols-2/, "2 columns on mobile");
  assert.match(grid, /md:grid-cols-3/, "3 columns on tablet");
  assert.match(grid, /xl:grid-cols-4/, "4 columns on desktop preview");
  assert.doesNotMatch(grid, /overflow-x-auto|snap-|carousel/);
  assert.match(grid, /CatalogProductTile/, "grid renders the new tile");
  assert.doesNotMatch(grid, /CatalogProductCard/, "grid does not reuse the row card");
}

function testTileLinksToCanonicalPdp() {
  const href = buildPracticePublicPath("sergey-petrov", "klyuch-k-izobiliyu");
  const product = createCatalogProduct({
    authorSlug: "sergey-petrov",
    slug: "klyuch-k-izobiliyu",
    href,
    coverUrl: "https://cdn.example/cover.jpg",
  });

  assert.equal(href, "/practice/sergey-petrov/klyuch-k-izobiliyu");
  assert.equal(product.href, href);

  const tile = readRoot("src/components/products/CatalogProductTile.tsx");
  assert.match(tile, /href=\{product\.href\}/, "tile links to catalog product href");
  assert.match(tile, /<Link/, "keyboard access is the single Link");
  assert.doesNotMatch(tile, /AuthorLink/, "no nested author link");
  assert.doesNotMatch(tile, /PlayIcon|showPlayButton|listenHref/, "no play control");
  assert.match(tile, /alt=\{alt\}/, "cover alt comes from product title");
  assert.match(tile, /data-catalog-tile-image="blur-background"/);
  assert.match(tile, /data-catalog-tile-image="square-cover"/);
}

function testPreviewReusesCatalogListing() {
  const page = readRoot(
    "src/app/(platform)/(listener)/experimental/catalog-tiles/page.tsx",
  );
  const catalogPage = readRoot(
    "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
  );

  assert.match(page, /getPublishedCatalogSections/, "preview uses catalog listing");
  assert.match(page, /from "@\/lib\/products\/catalog"/, "same catalog.ts module");
  assert.doesNotMatch(page, /from\("practices"\)/, "preview does not query practices itself");
  assert.match(page, /index:\s*false/, "preview is noindex");
  assert.match(page, /ProductGrid/, "preview renders the new grid");
  assert.doesNotMatch(page, /CatalogProductCarousel/, "preview is not the production rail");

  assert.match(
    catalogPage,
    /CatalogProductCarousel/,
    "production catalog still uses the existing carousel",
  );
  assert.doesNotMatch(
    catalogPage,
    /experimental\/catalog-tiles|ProductGrid|CatalogProductTile/,
    "production catalog page is unchanged",
  );
}

function testBlurAndSharpShareOneSrc() {
  const tile = readRoot("src/components/products/CatalogProductTile.tsx");

  assert.match(tile, /src=\{src\}/, "both images use the resolved src");
  assert.match(
    tile,
    /data-catalog-tile-image="blur-background"[\s\S]*src=\{src\}[\s\S]*data-catalog-tile-image="square-cover"/,
    "blur background and sharp square are consecutive imgs with the same src binding",
  );
  assert.doesNotMatch(tile, /next\/image/, "does not use next/image");
  assert.doesNotMatch(tile, /from ["']sharp["']/, "does not import Sharp");
}

testSquareCoverResolvesToBlurFallback();
testManifestPrefersSmMdNotXl();
testMissingOptionalVisualsDoesNotThrow();
testLongTitleIsCssClamped();
testGridClassStructure();
testTileLinksToCanonicalPdp();
testPreviewReusesCatalogListing();
testBlurAndSharpShareOneSrc();

console.log("catalog-product-tile-unit: ok");
