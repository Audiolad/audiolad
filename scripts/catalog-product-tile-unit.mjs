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
import {
  PRODUCT_GRID_CLASS_NAME,
  PRODUCT_GRID_COLUMN_MIN_WIDTHS,
  PRODUCT_GRID_CONTAINER_CLASS_NAME,
  PRODUCT_GRID_GAP_PX,
  PRODUCT_GRID_MAX_COLUMNS,
  PRODUCT_GRID_MIN_COLUMNS,
  PRODUCT_GRID_MIN_TILE_PX,
  productGridMinWidthForColumns,
  resolveProductGridColumns,
} from "../src/lib/products/product-grid-layout.ts";

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

function testSquareCoverResolvesToSquareViewModel() {
  const product = createCatalogProduct({
    coverUrl: "https://cdn.example/covers/square.jpg",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
  const visual = resolveCatalogCardVisual(product);

  assert.equal(visual.hasSquareCover, true, "square cover is present");
  assert.equal(visual.fallbackMode, "square", "system slide uses a 1:1 square cover");
  assert.ok(visual.image?.src, "image src is resolved from existing helpers");
  assert.match(
    visual.image.src,
    /cdn\.example\/covers\/square\.jpg/,
    "legacy square cover url is reused",
  );
  assert.equal(visual.image.sizes, CATALOG_TILE_IMAGE_SIZES);
  assert.deepEqual(visual.additionalVisuals, [], "no gallery visuals on the system slide");
}

function testManifestPrefersSmMdNotXl() {
  const product = createCatalogProduct({
    coverImage: createCoverManifest(),
  });
  const visual = resolveCatalogCardVisual(product);

  assert.equal(visual.fallbackMode, "square");
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

  const slide = readRoot("src/components/products/CatalogSystemProductSlide.tsx");
  assert.match(slide, /CATALOG_PRODUCT_TILE_TITLE_CLASS/);
  assert.match(slide, /line-clamp-2/);
  assert.match(slide, /min-h-8/, "two-line title keeps reserved height");
  assert.match(slide, /product\.title/, "full title is rendered");
  assert.doesNotMatch(slide, /title\.slice|substring\(/, "title is not truncated in JS");
}

function testGridClassStructure() {
  const grid = readRoot("src/components/products/ProductGrid.tsx");
  const layout = readRoot("src/lib/products/product-grid-layout.ts");

  assert.match(grid, /PRODUCT_GRID_CLASS_NAME/, "grid uses shared layout classes");
  assert.match(grid, /data-product-grid-container/, "container is measurable");
  assert.match(PRODUCT_GRID_CONTAINER_CLASS_NAME, /@container/, "wrapper is a CQ container");
  assert.match(PRODUCT_GRID_CLASS_NAME, /grid-cols-2/, "default is 2 columns");
  assert.match(PRODUCT_GRID_CLASS_NAME, /@min-\[474px\]:grid-cols-3/);
  assert.match(PRODUCT_GRID_CLASS_NAME, /@min-\[636px\]:grid-cols-4/);
  assert.match(PRODUCT_GRID_CLASS_NAME, /@min-\[798px\]:grid-cols-5/);
  assert.match(PRODUCT_GRID_CLASS_NAME, /@min-\[960px\]:grid-cols-6/);
  assert.doesNotMatch(
    PRODUCT_GRID_CLASS_NAME,
    /\b(sm|md|lg|xl|2xl):grid-cols-/,
    "columns are not viewport breakpoints",
  );
  assert.doesNotMatch(layout, /minmax\(|auto-fit|auto-fill/, "no auto-fit that can collapse 320 to 1");
  assert.doesNotMatch(grid, /overflow-x-auto|snap-|carousel/);
  assert.match(grid, /CatalogProductTile/, "grid renders the new tile");
  assert.doesNotMatch(grid, /CatalogProductCard/, "grid does not reuse the row card");
}

function testContainerAwareColumnResolution() {
  assert.equal(productGridMinWidthForColumns(3), PRODUCT_GRID_COLUMN_MIN_WIDTHS[3]);
  assert.equal(productGridMinWidthForColumns(3), 3 * PRODUCT_GRID_MIN_TILE_PX + 2 * PRODUCT_GRID_GAP_PX);
  assert.equal(productGridMinWidthForColumns(4), PRODUCT_GRID_COLUMN_MIN_WIDTHS[4]);
  assert.equal(productGridMinWidthForColumns(6), PRODUCT_GRID_COLUMN_MIN_WIDTHS[6]);

  assert.equal(resolveProductGridColumns(280), PRODUCT_GRID_MIN_COLUMNS);
  assert.equal(resolveProductGridColumns(320), 2);
  assert.equal(resolveProductGridColumns(390), 2);
  assert.equal(resolveProductGridColumns(430), 2);
  assert.equal(resolveProductGridColumns(473), 2);
  assert.equal(resolveProductGridColumns(474), 3);
  assert.equal(resolveProductGridColumns(600), 3);
  assert.equal(resolveProductGridColumns(635), 3);
  assert.equal(resolveProductGridColumns(636), 4);
  assert.equal(resolveProductGridColumns(797), 4);
  assert.equal(resolveProductGridColumns(798), 5);
  assert.equal(resolveProductGridColumns(959), 5);
  assert.equal(resolveProductGridColumns(960), PRODUCT_GRID_MAX_COLUMNS);

  const widths = [280, 335, 350, 390, 474, 600, 636, 798, 960];
  let previous = 2;
  for (const width of widths) {
    const columns = resolveProductGridColumns(width);
    assert.ok(columns >= previous, `columns must not drop as container grows (${width})`);
    previous = columns;
    if (columns >= 3) {
      const tile =
        (width - (columns - 1) * PRODUCT_GRID_GAP_PX) / columns;
      assert.ok(tile >= PRODUCT_GRID_MIN_TILE_PX, `tile ${tile} too narrow at ${width}px / ${columns} cols`);
    }
  }
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
  const slide = readRoot("src/components/products/CatalogSystemProductSlide.tsx");
  const control = readRoot("src/components/products/CatalogTilePlayControl.tsx");

  assert.match(slide, /href=\{product\.href\}/, "slide Link is catalog product href");
  assert.match(slide, /<Link/, "card keyboard access is the PDP Link");
  assert.match(tile, /CatalogSystemProductSlide/, "tile wraps the system first slide");
  assert.doesNotMatch(tile + slide, /AuthorLink/, "no nested author link");
  assert.match(tile, /CatalogTilePlayControl/, "Play control is present on the tile");
  assert.match(tile, /playControl=/, "tile passes Play into the system slide slot");
  assert.match(
    slide,
    /<\/Link>[\s\S]*\{playControl\}/,
    "Play is a sibling after Link, not nested inside it",
  );
  assert.doesNotMatch(
    slide,
    /<Link[\s\S]*\{playControl\}[\s\S]*<\/Link>/,
    "playControl is not rendered inside the PDP Link",
  );
  assert.doesNotMatch(
    tile,
    /<Link[\s\S]*<(button|CatalogTilePlayControl)[\s\S]*<\/Link>/,
    "tile does not nest Play inside a Link",
  );
  assert.doesNotMatch(tile + slide + control, /listenHref/, "Play is not a listen-page Link");
  assert.doesNotMatch(tile + slide + control, /Подробнее/, "no Подробнее button");
  assert.match(slide, /alt=\{alt\}/, "cover alt comes from product title");
  assert.match(slide, /data-catalog-tile-image="square-cover"/);
  assert.match(slide, /data-catalog-tile-author=""/);
  assert.match(slide, /data-catalog-tile-duration=""/);
  assert.match(slide, /data-catalog-tile-meta=""/);
  assert.match(slide, /product\.statsLabel/, "duration uses existing statsLabel");
  assert.match(control, /Слушать/, "Play control reads as Слушать");
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

function testSystemSlideIsNineSixteenIncludingPlay() {
  const slide = readRoot("src/components/products/CatalogSystemProductSlide.tsx");
  const tile = readRoot("src/components/products/CatalogProductTile.tsx");
  const control = readRoot("src/components/products/CatalogTilePlayControl.tsx");

  assert.match(slide, /CATALOG_SYSTEM_SLIDE_ASPECT_CLASS/);
  assert.match(slide, /aspect-\[9\/16\]/, "system slide is locked to 9:16");
  assert.match(slide, /data-catalog-system-slide-aspect="9\/16"/);
  assert.match(slide, /overflow-hidden/, "9:16 frame does not grow or overflow");
  assert.match(slide, /aspect-square/, "cover is 1:1");
  assert.match(slide, /data-catalog-tile-cover="square"/);
  assert.match(slide, /\{playControl\}/, "Play lives inside the first-slide geometry");
  assert.doesNotMatch(tile, /aspect-\[9\/16\]/, "tile does not add a second aspect box");
  assert.doesNotMatch(slide, /aspect-\[4\/5\]/, "first slide is not forced into 4:5");
  assert.doesNotMatch(slide, /blur-background|blur-2xl|square_blur/, "no square-in-blur frame");
  assert.doesNotMatch(tile, /aspect-\[4\/5\]|blur-background|square_blur/);
  assert.doesNotMatch(control, /aspect-\[4\/5\]/, "Play is not overlaid on a 4:5 frame");
  assert.doesNotMatch(slide, /next\/image/, "does not use next/image");
  assert.doesNotMatch(slide, /from ["']sharp["']/, "does not import Sharp");
  assert.doesNotMatch(slide, /Подробнее/);
}

function testAuthorAndDurationShareOneLine() {
  const slide = readRoot("src/components/products/CatalogSystemProductSlide.tsx");

  assert.match(slide, /data-catalog-tile-meta=""/, "author and duration share one meta row");
  assert.match(slide, /data-catalog-tile-author=""/);
  assert.match(slide, /data-catalog-tile-duration=""/);
  assert.match(slide, /["'] · ["']/, "meta joins author and duration with a middle dot");
  assert.match(slide, /truncate/, "long author truncates");
  assert.doesNotMatch(
    slide,
    /data-catalog-tile-author=""[\s\S]*<\/p>[\s\S]*data-catalog-tile-duration=""/,
    "duration is not a second stacked row",
  );
}

testSquareCoverResolvesToSquareViewModel();
testManifestPrefersSmMdNotXl();
testMissingOptionalVisualsDoesNotThrow();
testLongTitleIsCssClamped();
testGridClassStructure();
testContainerAwareColumnResolution();
testTileLinksToCanonicalPdp();
testPreviewReusesCatalogListing();
testSystemSlideIsNineSixteenIncludingPlay();
testAuthorAndDurationShareOneLine();

console.log("catalog-product-tile-unit: ok");
