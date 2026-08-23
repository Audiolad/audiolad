#!/usr/bin/env node
/**
 * Phase 2 catalog tile play — no DB, no UI framework.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPracticePublicPath } from "../src/lib/products/paths.ts";
import {
  buildCatalogTilePlaybackErrorMessage,
  createCatalogTilePlayLock,
  isSameCatalogTileSession,
  resolveCatalogTilePlayClickAction,
  runCatalogTilePlayClick,
} from "../src/lib/products/catalog-tile-playback.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readRoot(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function createSession(overrides = {}) {
  return {
    practiceId: "practice-1",
    authorSlug: "anna-test",
    productSlug: "morning-practice",
    practiceTitle: "Утренняя практика",
    authorName: "Анна",
    format: "Аудиопрактика",
    tracks: [{ id: "track-1", title: "Часть 1" }],
    initialProgress: [],
    coverSymbol: "✧",
    coverGradient: "from-[#e8f0ff]",
    coverImageUrl: null,
    isAuthorPreview: false,
    ...overrides,
  };
}

function testResolverStates() {
  assert.deepEqual(
    resolveCatalogTilePlayClickAction({
      authorSlug: "anna-test",
      productSlug: "morning-practice",
      isLoading: true,
      isSameCatalogProduct: false,
      canTogglePlayback: false,
    }),
    { type: "noop" },
    "loading is a no-op",
  );

  assert.deepEqual(
    resolveCatalogTilePlayClickAction({
      authorSlug: "",
      productSlug: "morning-practice",
      isLoading: false,
      isSameCatalogProduct: false,
      canTogglePlayback: false,
    }),
    { type: "noop" },
    "missing author slug is a no-op",
  );

  assert.deepEqual(
    resolveCatalogTilePlayClickAction({
      authorSlug: "anna-test",
      productSlug: "morning-practice",
      isLoading: false,
      isSameCatalogProduct: true,
      canTogglePlayback: true,
    }),
    { type: "toggle_pause_resume" },
    "same catalog session with existing handlePlayPause toggles",
  );

  assert.deepEqual(
    resolveCatalogTilePlayClickAction({
      authorSlug: "anna-test",
      productSlug: "morning-practice",
      isLoading: false,
      isSameCatalogProduct: false,
      canTogglePlayback: false,
    }),
    { type: "load_session" },
    "new product loads the listen session",
  );
}

function testSessionIdentity() {
  const session = createSession();
  assert.equal(
    isSameCatalogTileSession(session, "anna-test", "morning-practice"),
    true,
  );
  assert.equal(
    isSameCatalogTileSession(session, "anna-test", "other"),
    false,
  );
  assert.equal(
    isSameCatalogTileSession(
      { ...session, sourceType: "private_audio", itemId: "x", detailPath: "/x", authorText: null },
      "anna-test",
      "morning-practice",
    ),
    false,
    "private audio is not a catalog tile session",
  );
  assert.equal(isSameCatalogTileSession(null, "anna-test", "morning-practice"), false);
}

async function testLoadSessionUsesExistingListenFetch() {
  const loads = [];
  const gestures = [];
  let fetchCount = 0;
  const session = createSession();

  const result = await runCatalogTilePlayClick(
    {
      authorSlug: "anna-test",
      productSlug: "morning-practice",
      isLoading: false,
      isSameCatalogProduct: false,
      canTogglePlayback: false,
    },
    {
      fetchSession: async (authorSlug, productSlug) => {
        fetchCount += 1;
        assert.equal(authorSlug, "anna-test");
        assert.equal(productSlug, "morning-practice");
        return { ok: true, session };
      },
      loadSession: (input) => {
        loads.push(input);
      },
      prepareSharedAudioGesture: () => {
        gestures.push("warm");
      },
      clearPlaylistQueue: () => {},
    },
  );

  assert.equal(result.status, "loaded");
  assert.equal(fetchCount, 1);
  assert.equal(gestures.length, 1, "iOS gesture warm-up runs before fetch");
  assert.equal(loads.length, 1);
  assert.equal(loads[0].requestAutoplay, true);
  assert.equal(loads[0].suppressListenUrlSync, true);
  assert.equal(loads[0].authorSlug, "anna-test");
  assert.equal(loads[0].productSlug, "morning-practice");
  assert.equal(loads[0].initialTrackId, undefined, "does not invent a track pick");
}

async function testDoubleClickWhileLoadingDoesNotParallelFetch() {
  const lock = createCatalogTilePlayLock();
  let fetchCount = 0;
  let unblock;
  const blocked = new Promise((resolve) => {
    unblock = resolve;
  });

  const fetchSession = async () => {
    fetchCount += 1;
    await blocked;
    return { ok: true, session: createSession() };
  };

  const input = {
    authorSlug: "anna-test",
    productSlug: "morning-practice",
    isLoading: false,
    isSameCatalogProduct: false,
    canTogglePlayback: false,
  };

  const first = runCatalogTilePlayClick(
    input,
    { fetchSession, loadSession: () => {} },
    lock,
  );

  while (fetchCount === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const whileLoading = await runCatalogTilePlayClick(
    { ...input, isLoading: true },
    { fetchSession, loadSession: () => {} },
    lock,
  );
  const whileLocked = await runCatalogTilePlayClick(
    input,
    { fetchSession, loadSession: () => {} },
    lock,
  );

  assert.equal(whileLoading.status, "ignored");
  assert.equal(whileLocked.status, "ignored");
  assert.equal(fetchCount, 1, "second click does not start a parallel fetch");

  unblock();
  const firstResult = await first;
  assert.equal(firstResult.status, "loaded");
  assert.equal(fetchCount, 1);
}

async function testErrorClearsLoadingAndDoesNotThrow() {
  const lock = createCatalogTilePlayLock();
  const result = await runCatalogTilePlayClick(
    {
      authorSlug: "anna-test",
      productSlug: "morning-practice",
      isLoading: false,
      isSameCatalogProduct: false,
      canTogglePlayback: false,
    },
    {
      fetchSession: async () => ({ ok: false, reason: "unavailable" }),
      loadSession: () => {
        throw new Error("loadSession must not run on error");
      },
    },
    lock,
  );

  assert.equal(result.status, "error");
  assert.equal(
    result.errorMessage,
    buildCatalogTilePlaybackErrorMessage("unavailable"),
  );
  assert.equal(lock.current, false, "error clears the loading lock");
}

async function testToggleDoesNotFetch() {
  let fetchCount = 0;
  let pauseCount = 0;

  const result = await runCatalogTilePlayClick(
    {
      authorSlug: "anna-test",
      productSlug: "morning-practice",
      isLoading: false,
      isSameCatalogProduct: true,
      canTogglePlayback: true,
    },
    {
      fetchSession: async () => {
        fetchCount += 1;
        return { ok: true, session: createSession() };
      },
      loadSession: () => {
        throw new Error("toggle must not load a new session");
      },
      handlePlayPause: () => {
        pauseCount += 1;
      },
    },
  );

  assert.equal(result.status, "toggled");
  assert.equal(fetchCount, 0);
  assert.equal(pauseCount, 1);
}

function testMarkupSplitsLinkAndPlay() {
  const tile = readRoot("src/components/products/CatalogProductTile.tsx");
  const slide = readRoot("src/components/products/CatalogSystemProductSlide.tsx");
  const control = readRoot("src/components/products/CatalogTilePlayControl.tsx");
  const helper = readRoot("src/lib/products/catalog-tile-playback.ts");
  const href = buildPracticePublicPath("sergey-petrov", "klyuch-k-izobiliyu");

  assert.equal(href, "/practice/sergey-petrov/klyuch-k-izobiliyu");
  assert.match(slide, /href=\{product\.href\}/, "Link stays on canonical PDP");
  assert.match(tile, /CatalogTilePlayControl/, "Play control is present");
  assert.match(tile, /playControl=/, "Play is passed into the 9:16 system slide");
  assert.match(
    slide,
    /<\/Link>[\s\S]*\{playControl\}/,
    "Play control is a sibling after Link, not nested inside it",
  );
  assert.doesNotMatch(
    slide,
    /<Link[\s\S]*\{playControl\}[\s\S]*<\/Link>/,
    "no playControl inside the card Link",
  );
  assert.doesNotMatch(
    tile,
    /<Link[\s\S]*<(button|CatalogTilePlayControl)[\s\S]*<\/Link>/,
    "no button inside a tile Link",
  );
  assert.match(control, /<button/, "Play is a button");
  assert.match(control, /type="button"/);
  assert.match(control, /data-catalog-tile-play=""/);
  assert.doesNotMatch(control, /listenHref|\/listen\//, "does not navigate to /listen");
  assert.doesNotMatch(control, /<Link/, "Play is not a Link");
  assert.match(control, /fetchListenSessionPayload/, "uses existing listen-session fetch");
  assert.match(helper, /fetchSession/);
  assert.match(helper, /loadSession/);
  assert.match(helper, /suppressListenUrlSync/);
  assert.match(helper, /requestAutoplay: true/);
  assert.match(control, /prepareSharedAudioGesture/, "reuses iOS gesture warm-up");
  assert.match(control, /releaseCatalogTilePlayPointerFocus/);
  assert.match(control, /shouldBlurCatalogTilePlayAfterPointerClick/);
  assert.doesNotMatch(
    control,
    /disabled=\{loading\}/,
    "Play must not disable inside the tabIndex=0 scroller (focus dump)",
  );
  assert.match(control, /role="alert"/);
}

function testDoesNotTouchForbiddenSurfaces() {
  const catalogPage = readRoot(
    "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
  );
  const card = readRoot("src/components/products/CatalogProductCard.tsx");
  const grid = readRoot("src/components/products/ProductGrid.tsx");
  const resolver = readRoot("src/lib/products/catalog-card-visual.ts");

  assert.doesNotMatch(catalogPage, /CatalogTilePlayControl|catalog-tile-playback/);
  assert.doesNotMatch(card, /CatalogTilePlayControl|runCatalogTilePlayClick/);
  assert.doesNotMatch(grid, /CatalogTilePlayControl/);
  assert.doesNotMatch(resolver, /loadSession|fetchListenSessionPayload/);
}

testResolverStates();
testSessionIdentity();
await testLoadSessionUsesExistingListenFetch();
await testDoubleClickWhileLoadingDoesNotParallelFetch();
await testErrorClearsLoadingAndDoesNotThrow();
await testToggleDoesNotFetch();
testMarkupSplitsLinkAndPlay();
testDoesNotTouchForbiddenSurfaces();

console.log("catalog-tile-playback-unit: ok");
