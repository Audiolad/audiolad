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
  CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME,
  beginCatalogTileCarouselGesture,
  consumeCatalogTileCarouselClickSuppress,
  createIdleCatalogTileCarouselGesture,
  didCatalogTileScrollerMove,
  endCatalogTileCarouselGesture,
  formatCatalogTilePagerAriaLabel,
  formatCatalogTilePagerLabel,
  isCatalogTileCarouselGestureIdle,
  isCatalogTileCarouselInteractiveTarget,
  releaseCatalogTilePlayPointerFocus,
  resolveCatalogSlidePointerIntent,
  resolveCatalogTileSlideIndex,
  resolveCatalogTileSlideViewport,
  resolveCatalogTileSnapPositions,
  shouldAllowCatalogSlidePdpNavigation,
  shouldBlurCatalogTilePlayAfterPointerClick,
  shouldShowCatalogTilePager,
  shouldTreatCatalogSlidePointerAsTap,
  updateCatalogTileCarouselGesture,
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

  assert.match(carousel, /data-catalog-tile-carousel-height="content"/);
  assert.doesNotMatch(
    carousel,
    /aspect-\[3\/4\]|aspect-\[9\/16\]|CATALOG_SYSTEM_SLIDE_ASPECT_CLASS/,
    "carousel is not a poster-ratio box",
  );
  assert.match(authorSlide, /data-catalog-author-slide-layout="match"/);
  assert.doesNotMatch(
    authorSlide,
    /aspect-\[3\/4\]|aspect-\[9\/16\]/,
    "author slide matches the system-card frame — no poster aspect",
  );
  assert.match(carousel, /catalog-tile-carousel/, "native CSS scroller class");
  assert.match(carousel, /beginCatalogTileCarouselGesture/, "swipe is not a tap");
  assert.match(carousel, /onPointerMove/, "horizontal intent is tracked during the pan");
  assert.match(carousel, /onLostPointerCapture/, "lost capture always ends the pointer session");
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
  assert.doesNotMatch(control, /data-catalog-tile-play-overlay/, "Play is in the info block");
  assert.doesNotMatch(carousel, /loadSession|fetchListenSessionPayload/, "no second player");
}

function testEachSlideMatchesScrollerViewport() {
  const carousel = readRoot(
    "src/components/products/CatalogProductCarouselCard.tsx",
  );
  const systemSlide = readRoot(
    "src/components/products/CatalogSystemProductSlide.tsx",
  );
  const authorSlide = readRoot("src/components/products/CatalogAuthorSlide.tsx");
  const css = readRoot("src/app/globals.css");
  const tile = readRoot("src/components/products/CatalogProductTile.tsx");

  assert.match(
    CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME,
    /basis-full/,
    "wrapper flex-basis is 100%, not auto",
  );
  assert.match(CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME, /w-full/);
  assert.doesNotMatch(
    CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME,
    /h-full/,
    "wrappers do not force a poster height",
  );
  assert.match(
    CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME,
    /min-w-0/,
    "min-width:0 so intrinsic content cannot expand the flex item",
  );
  assert.doesNotMatch(
    CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME,
    /min-w-full/,
    "min-width:100% is a floor, not a width lock",
  );
  assert.match(CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME, /grow-0/);
  assert.match(CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME, /shrink-0/);

  const wrapperUses = carousel.match(
    /className=\{CATALOG_TILE_SLIDE_WRAPPER_CLASS_NAME\}/g,
  );
  assert.equal(
    wrapperUses?.length,
    2,
    "Slide 1 and author wrappers share the same 100% viewport class",
  );

  assert.match(
    css,
    /\.catalog-tile-carousel > \[data-catalog-tile-slide\][\s\S]*flex:\s*0 0 100%/,
  );
  assert.match(
    css,
    /\.catalog-tile-carousel > \[data-catalog-tile-slide\][\s\S]*min-width:\s*0/,
  );
  assert.match(
    css,
    /\.catalog-tile-carousel > \[data-catalog-tile-slide\][\s\S]*width:\s*100%/,
  );
  assert.doesNotMatch(
    css,
    /\.catalog-tile-carousel > \[data-catalog-tile-slide\]\s*\{[^}]*height:\s*100%/,
    "slide height is not a forced 100% poster",
  );
  assert.match(
    css,
    /\.catalog-tile-carousel > \[data-catalog-tile-slide="author"\][\s\S]*align-self:\s*stretch/,
    "author slides stretch to the system-card height",
  );

  assert.match(carousel, /layout="fill"/, "carousel Slide 1 fills the wrapper");
  assert.match(systemSlide, /layout === "fill"/);
  assert.match(systemSlide, /h-full min-h-0 min-w-0/);
  assert.match(
    systemSlide,
    /layout = "standalone"/,
    "0-slide tiles keep the same auto-height card",
  );
  assert.doesNotMatch(
    tile,
    /layout="fill"/,
    "standalone tile does not use carousel fill layout",
  );

  assert.match(authorSlide, /h-full w-full min-h-0 min-w-0/);
  assert.doesNotMatch(
    authorSlide,
    /aspect-\[3\/4\]|aspect-\[9\/16\]/,
    "author geometry matches the system-card frame",
  );

  assert.match(carousel, /pointer-events-none absolute/, "pager is overlay");
  assert.doesNotMatch(
    carousel,
    /data-catalog-tile-pager=""[\s\S]*catalog-tile-carousel/,
    "pager is not a flex slide and cannot resize the track",
  );

  assert.match(
    systemSlide,
    /\{playControl\}/,
    "Play stays inside the system slide frame",
  );
  assert.match(systemSlide, /overflow-hidden/, "frame clips — Play cannot sit below the article");
  assert.match(
    systemSlide,
    /<\/Link>[\s\S]*\{playControl\}/,
    "Play is a sibling of the PDP Link",
  );
  assert.doesNotMatch(
    systemSlide,
    /<Link[\s\S]*\{playControl\}[\s\S]*<\/Link>/,
    "Play is not nested inside the PDP Link",
  );

  const at390 = resolveCatalogTileSlideViewport(169);
  assert.equal(at390.width, 169);
  assert.equal(at390.coverSize, 169);
  assert.equal(at390.heightMode, "content");

  const at320 = resolveCatalogTileSlideViewport(134);
  assert.equal(at320.width, 134);
  assert.equal(at320.coverSize, 134);

  const at430 = resolveCatalogTileSlideViewport(189);
  assert.equal(at430.width, 189);
  assert.equal(at430.coverSize, 189);

  assert.deepEqual(resolveCatalogTileSnapPositions(169, 3), [0, 169, 338]);
  assert.deepEqual(resolveCatalogTileSnapPositions(169, 1), [0]);
  assert.notDeepEqual(
    resolveCatalogTileSnapPositions(169, 3),
    [0, 219, 388],
    "first snap step must be clientWidth, not the old 219 intrinsic width",
  );
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

function playTarget() {
  return {
    closest(selector) {
      return selector.includes("button") || selector.includes("data-catalog-tile-play")
        ? this
        : null;
    },
  };
}

function coverTarget() {
  return {
    closest() {
      return null;
    },
  };
}

/**
 * Real event sequence: pointer Play tap, then the first horizontal pan.
 * Proves Play bubbles into the carousel, must fully idle, and the next
 * pointer sequence is a clean swipe (slide would change natively).
 */
function testPointerPlayThenFirstSwipeStartsClean() {
  assert.equal(isCatalogTileCarouselInteractiveTarget(playTarget()), true);
  assert.equal(isCatalogTileCarouselInteractiveTarget(coverTarget()), false);
  assert.equal(isCatalogTileCarouselInteractiveTarget(null), false);

  let gesture = createIdleCatalogTileCarouselGesture();
  assert.equal(isCatalogTileCarouselGestureIdle(gesture), true, "before Play: idle");

  // A) tap Play — carousel SEES pointerdown (Play does not stop pointer events)
  gesture = beginCatalogTileCarouselGesture({
    pointerId: 7,
    startX: 84,
    startY: 210,
    startScrollLeft: 0,
    isInteractiveTarget: isCatalogTileCarouselInteractiveTarget(playTarget()),
  });
  assert.equal(gesture.phase, "down");
  assert.equal(gesture.pointerId, 7);
  assert.equal(gesture.startedOnControl, true);
  assert.equal(gesture.suppressClick, false);
  assert.equal(isCatalogTileCarouselGestureIdle(gesture), false, "after Play pointerdown: mid-gesture");

  // Play pointerup (symmetric). Click stopPropagation must NOT skip this.
  const playEnd = endCatalogTileCarouselGesture(gesture, {
    pointerId: 7,
    endX: 86,
    endY: 211,
    currentScrollLeft: 0,
  });
  gesture = playEnd.gesture;
  assert.equal(playEnd.intent, "tap");
  assert.equal(gesture.suppressClick, false, "Play tap must not suppress the button click");
  assert.equal(
    isCatalogTileCarouselGestureIdle(gesture),
    true,
    "after Play pointerup: fully idle — no leftover startX/pointerId/intent",
  );
  assert.equal(gesture.startX, 0);
  assert.equal(gesture.pointerId, null);
  assert.equal(gesture.horizontalIntent, false);
  assert.equal(gesture.phase, "idle");

  const playClick = consumeCatalogTileCarouselClickSuppress(gesture);
  gesture = playClick.gesture;
  assert.equal(playClick.suppressClick, false, "after Play click: carousel does not eat Play");
  assert.equal(isCatalogTileCarouselGestureIdle(gesture), true, "after Play click / loading: still idle");

  // B) first horizontal pan on the cover — new pointerId, must start clean
  gesture = beginCatalogTileCarouselGesture({
    pointerId: 8,
    startX: 90,
    startY: 40,
    startScrollLeft: 0,
    isInteractiveTarget: isCatalogTileCarouselInteractiveTarget(coverTarget()),
  });
  assert.equal(gesture.startedOnControl, false);
  assert.equal(gesture.pointerId, 8);
  assert.equal(gesture.startX, 90, "swipe does not reuse Play startX");

  gesture = updateCatalogTileCarouselGesture(gesture, {
    pointerId: 8,
    endX: 40,
    endY: 42,
    currentScrollLeft: 48,
  });
  assert.equal(gesture.horizontalIntent, true);
  assert.equal(gesture.scrolled, true);

  const swipeEnd = endCatalogTileCarouselGesture(gesture, {
    pointerId: 8,
    endX: 20,
    endY: 43,
    currentScrollLeft: 169,
  });
  assert.equal(swipeEnd.intent, "swipe");
  assert.equal(shouldAllowCatalogSlidePdpNavigation(swipeEnd.intent), false);
  assert.equal(swipeEnd.gesture.suppressClick, true);
  assert.equal(swipeEnd.gesture.phase, "idle");
  assert.equal(swipeEnd.gesture.pointerId, null);
  assert.equal(resolveCatalogTileSlideIndex(169, 169, 4), 2, "first swipe after Play changes slide");

  const swipeClick = consumeCatalogTileCarouselClickSuppress(swipeEnd.gesture);
  assert.equal(swipeClick.suppressClick, true);
  assert.equal(swipeClick.gesture.suppressClick, false);
}

function testPlayPointerupLostThenNewSwipeStillStartsClean() {
  let gesture = beginCatalogTileCarouselGesture({
    pointerId: 3,
    startX: 80,
    startY: 200,
    startScrollLeft: 0,
    isInteractiveTarget: true,
  });

  // Lost capture / pointercancel without a matching leftover: end by pointerId
  gesture = endCatalogTileCarouselGesture(gesture, {
    pointerId: 3,
    endX: 80,
    endY: 200,
    currentScrollLeft: 0,
  }).gesture;
  assert.equal(isCatalogTileCarouselGestureIdle(gesture), true);

  // New swipe pointer must not be ignored as a continuation of Play
  gesture = beginCatalogTileCarouselGesture({
    pointerId: 4,
    startX: 88,
    startY: 36,
    startScrollLeft: 0,
    isInteractiveTarget: false,
  });
  gesture = updateCatalogTileCarouselGesture(gesture, {
    pointerId: 3,
    endX: 10,
    endY: 36,
    currentScrollLeft: 80,
  });
  assert.equal(gesture.horizontalIntent, false, "moves from Play pointerId are ignored");
  gesture = updateCatalogTileCarouselGesture(gesture, {
    pointerId: 4,
    endX: 20,
    endY: 38,
    currentScrollLeft: 80,
  });
  assert.equal(gesture.horizontalIntent, true);
  assert.equal(endCatalogTileCarouselGesture(gesture, {
    pointerId: 4,
    endX: 16,
    endY: 38,
    currentScrollLeft: 169,
  }).intent, "swipe");
}

function testKeyboardPlayLeavesGestureIdle() {
  const gesture = createIdleCatalogTileCarouselGesture();
  assert.equal(isCatalogTileCarouselGestureIdle(gesture), true);
  // Keyboard Enter does not emit pointerdown on the scroller.
  const swipe = beginCatalogTileCarouselGesture({
    pointerId: 11,
    startX: 90,
    startY: 40,
    startScrollLeft: 0,
    isInteractiveTarget: false,
  });
  assert.equal(swipe.startedOnControl, false);
  assert.equal(
    endCatalogTileCarouselGesture(updateCatalogTileCarouselGesture(swipe, {
      pointerId: 11,
      endX: 30,
      endY: 42,
      currentScrollLeft: 169,
    }), {
      pointerId: 11,
      endX: 24,
      endY: 42,
      currentScrollLeft: 169,
    }).intent,
    "swipe",
  );
}

function testSwipeStartedOnPlayButtonStillCountsAsSwipe() {
  let gesture = beginCatalogTileCarouselGesture({
    pointerId: 9,
    startX: 84,
    startY: 210,
    startScrollLeft: 0,
    isInteractiveTarget: true,
  });
  gesture = updateCatalogTileCarouselGesture(gesture, {
    pointerId: 9,
    endX: 20,
    endY: 208,
    currentScrollLeft: 90,
  });
  const ended = endCatalogTileCarouselGesture(gesture, {
    pointerId: 9,
    endX: 16,
    endY: 208,
    currentScrollLeft: 169,
  });
  assert.equal(ended.intent, "swipe", "pan that starts on Play is still a swipe");
  assert.equal(ended.gesture.suppressClick, false, "do not suppress — Play is not a PDP Link");
  assert.equal(ended.gesture.phase, "idle");
}

function testAnyButtonInsideScrollerIsAControlSequence() {
  const dummyButton = {
    closest(selector) {
      return selector.includes("button") ? this : null;
    },
  };

  let gesture = beginCatalogTileCarouselGesture({
    pointerId: 1,
    startX: 50,
    startY: 50,
    startScrollLeft: 0,
    isInteractiveTarget: isCatalogTileCarouselInteractiveTarget(dummyButton),
  });
  gesture = endCatalogTileCarouselGesture(gesture, {
    pointerId: 1,
    endX: 51,
    endY: 50,
    currentScrollLeft: 0,
  }).gesture;
  assert.equal(isCatalogTileCarouselGestureIdle(gesture), true);
  assert.equal(gesture.suppressClick, false, "dummy button tap is not a PDP swipe");
}

function testFirstSwipeAfterPlayDoesNotTrapOverflowFocus() {
  const delays = [0, 100, 250, 500, 1000];

  assert.equal(shouldBlurCatalogTilePlayAfterPointerClick(1), true);
  assert.equal(shouldBlurCatalogTilePlayAfterPointerClick(0), false);

  let blurCount = 0;
  releaseCatalogTilePlayPointerFocus({
    blur() {
      blurCount += 1;
    },
  });
  releaseCatalogTilePlayPointerFocus(null);
  assert.equal(blurCount, 1);

  for (const delay of delays) {
    assert.equal(
      shouldBlurCatalogTilePlayAfterPointerClick(1),
      true,
      `pointer Play at +${delay}ms must still blur so the first pan can move scrollLeft`,
    );
  }

  const control = readRoot("src/components/products/CatalogTilePlayControl.tsx");
  const tile = readRoot("src/components/products/CatalogProductTile.tsx");
  const carousel = readRoot(
    "src/components/products/CatalogProductCarouselCard.tsx",
  );

  assert.match(
    control,
    /shouldBlurCatalogTilePlayAfterPointerClick\(event\.detail\)/,
  );
  assert.match(
    control,
    /releaseCatalogTilePlayPointerFocus\(event\.currentTarget\)/,
  );
  assert.doesNotMatch(
    control,
    /disabled=\{loading\}/,
    "disabled Play dumps focus onto the tabIndex=0 scroller",
  );
  assert.doesNotMatch(
    tile,
    /key=\{[^}]*(play|loading|session|currentIndex)/,
    "tile does not remount the carousel when Play goes loading → playing",
  );
  assert.doesNotMatch(carousel, /useGlobalAudioPlayer|useOptionalPlayerEngine/);
  assert.doesNotMatch(
    carousel,
    /key=\{[^}]*(playControl|currentIndex|session)/,
    "scroller DOM identity does not change with Play state",
  );
  assert.match(carousel, /tabIndex=\{0\}/, "keyboard scroller tab stop stays");
  assert.doesNotMatch(control, /setTimeout|scrollBy\(|debounce/);
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
  assert.match(layout, /grid-cols-6/, "shared ProductGrid still documents 6 cols");
  assert.match(page, /EXPERIMENTAL_CATALOG_TILE_GRID_CLASS_NAME/);
  const expGrid = readRoot("src/lib/products/experimental-catalog-tile-grid.ts");
  assert.match(expGrid, /grid-cols-5/, "experimental desktop caps at 5");
  assert.doesNotMatch(expGrid, /grid-cols-6/);
}

testTapVersusSwipe();
testTenBackAndForthSwipeIntents();
testPagerScalesWithoutFatDots();
testZeroAndManyAuthorSlides();
testZeroAuthorSlidesKeepCurrentTile();
testCarouselGeometryAndPlayStayOnSlideOne();
testEachSlideMatchesScrollerViewport();
testPagerOnlyWhenMultipleSlides();
testPointerPlayThenFirstSwipeStartsClean();
testPlayPointerupLostThenNewSwipeStillStartsClean();
testKeyboardPlayLeavesGestureIdle();
testSwipeStartedOnPlayButtonStillCountsAsSwipe();
testAnyButtonInsideScrollerIsAControlSequence();
testFirstSwipeAfterPlayDoesNotTrapOverflowFocus();
testFirstSwipeStabilizers();
testDemoDataStaysExperimental();

console.log("catalog-tile-carousel-unit: ok");
