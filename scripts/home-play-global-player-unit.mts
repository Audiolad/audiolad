import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testHomePlayStaysOnHome() {
  const play = read("src/components/home/HomeProductPlayButton.tsx");

  assert.match(play, /<button/);
  assert.match(play, /stopPropagation/);
  assert.match(play, /prepareSharedAudioGesture/);
  assert.match(play, /fetchCatalogPlaySession/);
  assert.match(play, /loadSession/);
  assert.match(play, /entrySurface: "home"/);
  assert.match(play, /requestAutoplay: true/);
  assert.match(play, /suppressListenUrlSync: true/);
  assert.match(play, /data-home-product-play/);
  assert.match(play, /handlePlayPause/);
  assert.doesNotMatch(play, /<Link|href=/);
  assert.doesNotMatch(play, /buildListenPath|\/listen\?autoplay/);
  assert.doesNotMatch(play, /router\.(push|replace)/);
}

function testSurfacesUseHomePlayButton() {
  const card = read("src/components/home/HomeProductCard.tsx");
  const hero = read("src/components/home/HeroFeaturedProduct.tsx");
  const cont = read("src/components/home/ContinueListening.tsx");
  const guest = read("src/components/home/GuestHome.tsx");
  const programs = read("src/components/home/ActiveProgramsSection.tsx");

  assert.match(card, /HomeProductPlayButton/);
  assert.match(hero, /HomeProductPlayButton/);
  assert.match(cont, /HomeProductPlayButton/);
  assert.doesNotMatch(guest, /HomeProductPlayButton/);
  assert.match(programs, /HomeProductPlayButton/);

  assert.doesNotMatch(card, /href=\{listenHref\}|href=\{product\.listenHref\}/);
  assert.doesNotMatch(hero, /href=\{listenHref\}|href=\{product\.listenHref\}/);
  assert.doesNotMatch(cont, /item\.listenHref/);
  assert.doesNotMatch(guest, /getPrimaryListenHref|listenHref/);
  assert.doesNotMatch(programs, /program\.listenHref/);
}

function testPreviewUsesCatalogPlayApi() {
  const play = read("src/components/home/HomeProductPlayButton.tsx");

  assert.match(play, /fetchCatalogPlaySession\(authorSlug, productSlug\)/);
  assert.doesNotMatch(play, /resolveCatalogPlaybackMode|previewStartMs|playbackMode/);
  assert.doesNotMatch(play, /canListen|accessState/);
}

function testCardOpensPractice() {
  const card = read("src/components/home/HomeProductCard.tsx");
  const hero = read("src/components/home/HeroFeaturedProduct.tsx");
  const types = read("src/lib/home/types.ts");
  const mapper = read("src/lib/home/listening-progress.ts");

  assert.match(card, /href=\{product\.href\}/);
  assert.match(hero, /href=\{product\.href\}/);
  assert.match(types, /listenHref: string \| null/);
  assert.match(mapper, /href: `\/practice\/\$\{author\.slug\}\/\$\{practice\.slug\}`/);
}

function testContinueListeningDoesNotOpenListen() {
  const cont = read("src/components/home/ContinueListening.tsx");

  assert.match(cont, /HomeProductPlayButton/);
  assert.match(cont, /href=\{product\.href\}/);
  assert.doesNotMatch(cont, /item\.listenHref/);
  assert.doesNotMatch(cont, /buildListenPath|\/listen/);
}

function testBoundaries() {
  const catalogPlay = read("src/components/products/CatalogProductPlayButton.tsx");
  const practicePlay = read(
    "src/components/products/practice-page/PracticeListenCtaLink.tsx",
  );
  const libraryPlay = read(
    "src/components/my-practices/LibraryCardPlayButton.tsx",
  );
  const fetchSession = read("src/lib/catalog/fetch-catalog-play-session.ts");
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  const access = read("src/lib/products/access.ts");
  const collection = read("src/lib/library/collection.ts");

  assert.match(catalogPlay, /entrySurface: "catalog"/);
  assert.doesNotMatch(catalogPlay, /entrySurface: "home"/);
  assert.doesNotMatch(catalogPlay, /HomeProductPlayButton/);

  assert.match(practicePlay, /entrySurface: "product"/);
  assert.doesNotMatch(practicePlay, /entrySurface: "home"/);

  assert.match(libraryPlay, /entrySurface: "library"/);
  assert.doesNotMatch(libraryPlay, /entrySurface: "home"/);

  assert.doesNotMatch(fetchSession, /entrySurface: "home"/);
  assert.doesNotMatch(provider, /HomeProductPlayButton/);
  assert.doesNotMatch(access, /HomeProductPlayButton|entrySurface: "home"/);
  assert.doesNotMatch(collection, /HomeProductPlayButton|home-play/);
}

function testGuestHomeStartListenStaysOnHome() {
  const guest = read("src/components/home/GuestHome.tsx");

  assert.doesNotMatch(guest, /HomeProductPlayButton/);
  assert.doesNotMatch(guest, /getPrimaryHomePlayProduct/);
  assert.match(guest, /GUEST_HOME_LISTEN_FREE_CTA/);
  assert.match(
    read("src/lib/home/guest-slider.ts"),
    /label: "Начать слушать бесплатно"/,
  );
  assert.doesNotMatch(guest, /getPrimaryListenHref/);
  assert.doesNotMatch(guest, /listenHref/);
  assert.doesNotMatch(guest, /buildListenPath|\/listen\?autoplay/);
}

function testActiveProgramsContinueStaysOnHome() {
  const programs = read("src/components/home/ActiveProgramsSection.tsx");

  assert.match(programs, /HomeProductPlayButton/);
  assert.match(programs, /Продолжить/);
  assert.match(programs, /href=\{program\.product\.href\}/);
  assert.doesNotMatch(programs, /program\.listenHref/);
  assert.doesNotMatch(programs, /buildListenPath|\/listen/);
}

testHomePlayStaysOnHome();
testSurfacesUseHomePlayButton();
testPreviewUsesCatalogPlayApi();
testCardOpensPractice();
testContinueListeningDoesNotOpenListen();
testGuestHomeStartListenStaysOnHome();
testActiveProgramsContinueStaysOnHome();
testBoundaries();

console.log("home-play-global-player-unit: ok");
