#!/usr/bin/env node
/**
 * Phase 3C in-tile catalog carousel — no database, no UI framework.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPracticePublicPath } from "../src/lib/products/paths.ts";
import {
  CATALOG_SLIDE_HORIZONTAL_INTENT_PX,
  CATALOG_SLIDE_TAP_JITTER_PX,
  CATALOG_SLIDE_VERTICAL_DOMINANCE_PX,
  didCatalogTileScrollerMove,
  formatCatalogTilePagerAriaLabel,
  formatCatalogTilePagerLabel,
  resolveCatalogSlidePointerIntent,
  resolveCatalogTileSlideIndex,
  shouldAllowCatalogSlidePdpNavigation,
  shouldShowCatalogTilePager,
  shouldTreatCatalogSlidePointerAsTap,
} from "../src/lib/products/catalog-tile-carousel.ts";
import {
  buildExperimentalAuthorSlides,
  getExperimentalCatalogAuthorSlides,
  resolveExperimentalAuthorSlideCount,
} from "../src/lib/products/experimental-catalog-author-slides.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRoot(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function createCatalogProduct(overrides = {}) {
  const authorSlug = overrides.authorSlug ?? "anna-test";
  const slug = overrides.slug ?? "morning-practice";

  return {
    id: overrides.id ?? "practice-1",
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

function testTapVersusSwipe() {
  assert.equal(
    resolveCatalogSlidePointerIntent({
      startX: 40,
      startY: 80,
      endX: 42,
      endY: 81,
    }),
    "tap",
    "clean tap stays a tap",
  );
  assert.equal(
    shouldTreatCatalogSlidePointerAsTap({
      startX: 40,
      startY: 80,
      endX: 47,
      endY: 84,
    }),
    true,
    "7×4 jitter (hypot≈8) is still a tap",
  );
  assert.ok(7 * 7 + 4 * 4 < CATALOG_SLIDE_TAP_JITTER_PX * CATALOG_SLIDE_TAP_JITTER_PX);

  assert.equal(
    resolveCatalogSlidePointerIntent({
      startX: 40,
      startY: 80,
      endX: 40 + CATALOG_SLIDE_HORIZONTAL_INTENT_PX + 4,
      endY: 83,
    }),
    "swipe",
    "clear horizontal movement is a swipe",
  );
  assert.equal(
    shouldAllowCatalogSlidePdpNavigation("swipe"),
    false,
    "horizontal swipe must not open PDP",
  );
  assert.equal(shouldAllowCatalogSlidePdpNavigation("tap"), true);

  assert.equal(
    resolveCatalogSlidePointerIntent({
      startX: 40,
      startY: 80,
      endX: 48,
      endY: 83,
      startScrollLeft: 0,
      currentScrollLeft: 18,
    }),
    "swipe",
    "horizontal intent + scrollLeft change is not a PDP tap",
  );

  assert.equal(
    resolveCatalogSlidePointerIntent({
      startX: 40,
      startY: 80,
      endX: 56,
      endY: 82,
      startScrollLeft: 0,
      currentScrollLeft: 0,
      horizontalIntent: true,
    }),
    "swipe",
    "snap-back after a horizontal pan is still a swipe",
  );

  assert.equal(
    resolveCatalogSlidePointerIntent({
      startX: 40,
      startY: 80,
      endX: 42,
      endY: 80 + CATALOG_SLIDE_VERTICAL_DOMINANCE_PX + 10,
    }),
    "vertical",
    "vertical movement is not a swipe",
  );
  assert.equal(
    shouldTreatCatalogSlidePointerAsTap({
      startX: 40,
      startY: 80,
      endX: 42,
      endY: 80 + CATALOG_SLIDE_VERTICAL_DOMINANCE_PX + 10,
    }),
    false,
    "vertical page scroll is not a PDP tap",
  );

  assert.equal(didCatalogTileScrollerMove(0, 1), false);
  assert.equal(didCatalogTileScrollerMove(0, 8), true);
}

function testTenBackAndForthSwipeIntents() {
  let scrollLeft = 0;
  const viewport = 169;

  for (let step = 0; step < 10; step += 1) {
    const direction = step % 2 === 0 ? 1 : -1;
    const startScrollLeft = scrollLeft;
    scrollLeft = Math.max(0, Math.min(viewport * 14, scrollLeft + direction * viewport));

    const intent = resolveCatalogSlidePointerIntent({
      startX: 80,
      startY: 120,
      endX: 80 - direction * 36,
      endY: 122,
      startScrollLeft,
      currentScrollLeft: scrollLeft,
    });

    assert.equal(intent, "swipe", `back-and-forth swipe ${step + 1} stays a swipe`);
    assert.equal(shouldAllowCatalogSlidePdpNavigation(intent), false);
    assert.equal(
      resolveCatalogTileSlideIndex(scrollLeft, viewport, 15),
      Math.round(scrollLeft / viewport) + 1,
    );
  }
}

function testPagerScalesWithoutFatDots() {
  assert.equal(shouldShowCatalogTilePager(0), false);
  assert.equal(shouldShowCatalogTilePager(1), false);
  assert.equal(shouldShowCatalogTilePager(2), true);
  assert.equal(shouldShowCatalogTilePager(15), true);
  assert.equal(formatCatalogTilePagerLabel(1, 12), "1/12");
  assert.equal(formatCatalogTilePagerLabel(15, 15), "15/15");
  assert.equal(formatCatalogTilePagerAriaLabel(3, 12), "Слайд 3 из 12");
  assert.equal(resolveCatalogTileSlideIndex(0, 169, 8), 1);
  assert.equal(resolveCatalogTileSlideIndex(169, 169, 8), 2);
  assert.equal(resolveCatalogTileSlideIndex(169 * 7, 169, 8), 8);
}

function testZeroAndManyAuthorSlides() {
  const product = createCatalogProduct();

  assert.deepEqual(buildExperimentalAuthorSlides(product, 0), []);
  assert.equal(buildExperimentalAuthorSlides(product, 1).length, 1);
  assert.equal(buildExperimentalAuthorSlides(product, 3).length, 3);
  assert.equal(buildExperimentalAuthorSlides(product, 8).length, 8);

  const many = buildExperimentalAuthorSlides(product, 15);
  assert.equal(many.length, 15);
  assert.equal(new Set(many.map((slide) => slide.id)).size, 15);
  assert.equal(many[0].label, "Слайд 2");
  assert.equal(many[14].label, "Слайд 16");
  assert.ok(many[0].backgroundClassName !== many[1].backgroundClassName);

  const resolved = getExperimentalCatalogAuthorSlides(product);
  assert.equal(resolved.length, resolveExperimentalAuthorSlideCount(product.id));
}

function testZeroAuthorSlidesKeepCurrentTile() {
  const tile = readRoot("src/components/products/CatalogProductTile.tsx");
  const carousel = readRoot(
    "src/components/products/CatalogProductCarouselCard.tsx",
  );

  assert.match(tile, /authorSlides\.length === 0/, "empty slides stay on the current tile");
  const zeroBranch = tile.match(
    /if \(authorSlides\.length === 0\) \{[\s\S]*?\n  \}\n/,
  )?.[0];
  assert.ok(zeroBranch, "0-slide branch is a distinct early return");
  assert.match(zeroBranch, /CatalogSystemProductSlide/, "0 author slides render only the system slide");
  assert.doesNotMatch(
    zeroBranch,
    /CatalogProductCarouselCard|data-catalog-tile-pager|catalog-tile-carousel-scroller/,
    "0 author slides do not mount the carousel",
  );
  assert.match(carousel, /CatalogSystemProductSlide/, "carousel slide 1 is the system slide");
  assert.doesNotMatch(
    carousel,
    /from ["']swiper|from ["']embla|require\(["']swiper|require\(["']embla/,
    "no extra carousel library",
  );
}

function testCarouselGeometryAndPlayStayOnSlideOne() {
  const carousel = readRoot(
    "src/components/products/CatalogProductCarouselCard.tsx",
  );
  const authorSlide = readRoot("src/components/products/CatalogAuthorSlide.tsx");
  const control = readRoot("src/components/products/CatalogTilePlayControl.tsx");
  const systemSlide = readRoot(
    "src/components/products/CatalogSystemProductSlide.tsx",
  );

  assert.match(carousel, /aspect-\[9\/16\]|CATALOG_SYSTEM_SLIDE_ASPECT_CLASS/);
  assert.match(carousel, /data-catalog-tile-carousel-aspect="9\/16"/);
  assert.match(authorSlide, /data-catalog-author-slide-aspect="9\/16"/);
  assert.match(authorSlide, /CATALOG_SYSTEM_SLIDE_ASPECT_CLASS|aspect-\[9\/16\]/);
  assert.match(carousel, /catalog-tile-carousel/, "native CSS scroller class");
  assert.match(carousel, /resolveCatalogSlidePointerIntent/, "swipe is not a tap");
  assert.match(carousel, /onPointerMove/, "horizontal intent is tracked during the pan");
  assert.match(carousel, /onClickCapture/, "swipe click is suppressed");
  assert.match(carousel, /onDragStartCapture/, "system Link drag does not eat the first swipe");
  assert.match(authorSlide, /href=\{productHref\}/, "author slide uses product.href");
  assert.match(authorSlide, /data-catalog-author-slide-link=""/);
  assert.doesNotMatch(authorSlide, /CatalogTilePlayControl|Слушать/, "no Play on author slides");
  assert.match(carousel, /playControl/, "Play stays on slide 1");
  assert.doesNotMatch(
    carousel,
    /data-catalog-tile-slide="author"[\s\S]*playControl/,
    "Play is not passed into author slides",
  );
  assert.match(systemSlide, /\{playControl\}/);
  assert.match(control, /runCatalogTilePlayClick/);
  assert.doesNotMatch(carousel, /loadSession|fetchListenSessionPayload/, "no second player");
}

function testPagerOnlyWhenMultipleSlides() {
  const carousel = readRoot(
    "src/components/products/CatalogProductCarouselCard.tsx",
  );

  assert.match(carousel, /shouldShowCatalogTilePager/);
  assert.match(carousel, /data-catalog-tile-pager=""/);
  assert.doesNotMatch(
    carousel,
    /authorSlides\.map\([\s\S]*data-catalog-tile-dot/,
    "does not render one fat dot per slide",
  );
  assert.match(carousel, /formatCatalogTilePagerLabel/, "compact 3\/12 progress");
}

function testFirstSwipeStabilizers() {
  const css = readRoot("src/app/globals.css");
  const carousel = readRoot(
    "src/components/products/CatalogProductCarouselCard.tsx",
  );
  const control = readRoot("src/components/products/CatalogTilePlayControl.tsx");
  const contents = readRoot(
    "src/components/products/useProductContentsPlayback.ts",
  );
  const progress = readRoot(
    "src/app/api/listen/product/[slug]/[productSlug]/progress/route.ts",
  );

  assert.match(css, /touch-action:\s*pan-x pan-y/);
  assert.match(
    css,
    /\.catalog-tile-carousel a,[\s\S]*touch-action:\s*pan-x pan-y/,
    "Link/Play hit targets use the same pan-x pan-y as the scroller",
  );
  assert.doesNotMatch(
    css,
    /\.catalog-tile-carousel[^{]*\{[^}]*scroll-snap-stop:\s*always/,
    "first swipe is not blocked by snap-stop:always",
  );
  assert.doesNotMatch(
    carousel,
    /setTimeout|debounce|requestAnimationFrame/,
    "first swipe is not masked with delayed replay",
  );
  assert.doesNotMatch(carousel, /tabIndex=\{currentIndex/);
  assert.match(control, /fetchListenSessionPayload/);
  assert.match(contents, /fetchListenSessionPayload/);
  assert.match(progress, /if \(!userId\) \{[\s\S]*status: 401/);
  assert.doesNotMatch(
    control,
    /\/progress|resume-session/,
    "tile Play does not invent a second progress/auth request",
  );
}

function testDemoDataStaysExperimental() {
  const page = readRoot(
    "src/app/(platform)/(listener)/experimental/catalog-tiles/page.tsx",
  );
  const catalogPage = readRoot(
    "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
  );
  const catalog = readRoot("src/lib/products/catalog.ts");
  const demo = readRoot(
    "src/lib/products/experimental-catalog-author-slides.ts",
  );
  const grid = readRoot("src/components/products/ProductGrid.tsx");
  const layout = readRoot("src/lib/products/product-grid-layout.ts");

  assert.match(page, /getExperimentalCatalogAuthorSlides/);
  assert.match(page, /getAuthorSlides=\{getExperimentalCatalogAuthorSlides\}/);
  assert.doesNotMatch(catalogPage, /getExperimentalCatalogAuthorSlides|CatalogAuthorSlide|CatalogProductCarouselCard/);
  assert.doesNotMatch(catalog, /experimental-catalog-author-slides|CatalogAuthorSlide/);
  assert.doesNotMatch(demo, /supabase|from\(["']practices["']\)|createClient/);
  assert.match(grid, /getAuthorSlides/);
  assert.doesNotMatch(grid, /getExperimentalCatalogAuthorSlides/);
  assert.doesNotMatch(layout, /authorSlides|carousel|snap-/);
}

testTapVersusSwipe();
testTenBackAndForthSwipeIntents();
testPagerScalesWithoutFatDots();
testZeroAndManyAuthorSlides();
testZeroAuthorSlidesKeepCurrentTile();
testCarouselGeometryAndPlayStayOnSlideOne();
testPagerOnlyWhenMultipleSlides();
testFirstSwipeStabilizers();
testDemoDataStaysExperimental();

console.log("catalog-tile-carousel-unit: ok");
