#!/usr/bin/env node
/**
 * MAX Home tab: default start, deeplink exceptions, guest shelves, catalog handoff.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOG_CLASS_FILTERS } from "../src/lib/catalog/listing-contract.ts";
import { GUEST_HOME_INTRO, GUEST_HOME_LISTEN_FREE_CTA, GUEST_HOME_SLIDES } from "../src/lib/home/guest-slider.ts";
import { MaxHomeScreen } from "../src/components/max/MaxHome.tsx";
import {
  beginMaxGuestSlideGesture,
  endMaxGuestSlidePointer,
  isMaxGuestHomeAuthorSlideUrl,
  maxGuestSlideClickActivates,
  moveMaxGuestSlideGesture,
  nearestMaxGuestSlideIndex,
  openMaxGuestHomeExternalSlide,
  resolveMaxGuestHomeAuthorUrl,
  resolveMaxGuestHomeSlideAction,
} from "../src/lib/max/guest-home-slider.ts";
import { readMaxHomeShelves, MAX_HOME_SHELVES, MAX_HOME_SUBTITLE } from "../src/lib/max/home.ts";
import {
  MAX_INITIAL_PRIMARY_TAB,
  resolveInitialMaxPrimaryTab,
} from "../src/lib/max/primary-tabs.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return readFileSync(join(repoRoot, relative), "utf8");
}

const shell = read("src/components/max/MaxAuthenticatedHome.tsx");
const home = read("src/components/max/MaxHome.tsx");
const slider = read("src/components/max/MaxGuestHomeSlider.tsx");
const slideActions = read("src/lib/max/guest-home-slider.ts");
const card = read("src/components/max/MaxCatalogProductCard.tsx");
const search = read("src/components/max/MaxCatalogSearch.tsx");
const bridge = read("src/components/max/MaxBridgeScript.tsx");
const tabs = read("src/lib/max/primary-tabs.ts");

assert.equal(MAX_INITIAL_PRIMARY_TAB, "home");
assert.equal(resolveInitialMaxPrimaryTab(null, false), "home");
assert.equal(resolveInitialMaxPrimaryTab(undefined, false), "home");
assert.equal(resolveInitialMaxPrimaryTab({ kind: "product" }, false), "catalog");
assert.equal(resolveInitialMaxPrimaryTab({ kind: "promo" }, false), "catalog");
assert.equal(resolveInitialMaxPrimaryTab(null, true), "catalog");
assert.equal(resolveInitialMaxPrimaryTab({ kind: "product" }, true), "catalog");
assert.match(tabs, /export const MAX_INITIAL_PRIMARY_TAB: MaxPrimaryTab = "home"/);
assert.match(shell, /resolveInitialMaxPrimaryTab\(/);
assert.match(shell, /initialStartTarget\?\.kind === "promo"/);
assert.match(shell, /initialStartTarget\?\.kind === "product"/);
assert.match(shell, /slug: initialStartTarget\.productSlug/);
assert.match(shell, /if \(locationPromo\) \{\s*setActiveTab\("catalog"\);/);

assert.match(bridge, /<MaxAuthenticatedHome/);
assert.match(
  bridge,
  /view\.phase === "linked_authenticated" \|\| view\.phase === "guest_unlinked"/,
);
assert.match(bridge, /guestMode=\{view\.phase === "guest_unlinked"\}/);
const homePane = shell.slice(
  shell.indexOf('activeTab === "home"'),
  shell.indexOf('activeTab === "playlists"'),
);
assert.match(homePane, /<MaxHome/);
assert.match(homePane, /guestMode=\{guestMode\}/);
assert.match(homePane, /onSlideAction=\{applyGuestHomeSlide\}/);
assert.doesNotMatch(shell, /MaxGuestHomeSlider/);
assert.match(shell, /activeTab === "playlists" \? \(/);
assert.match(shell, /<MaxPlaylists/);
assert.match(shell, /activeTab === "library" \? \(/);
assert.match(shell, /<MaxLibrary/);
assert.match(shell, /title=\{activeTabLabel\}/);
assert.doesNotMatch(shell, /<MaxTabPlaceholder/);
const playlistsPane = shell.slice(
  shell.indexOf('activeTab === "playlists"'),
  shell.indexOf('activeTab === "library" ? ('),
);
assert.match(playlistsPane, /<MaxPlaylists/);
assert.doesNotMatch(playlistsPane, /MaxTabPlaceholder/);

assert.match(home, /MAX_HOME_PATH/);
assert.match(home, /method: "POST"/);
assert.match(home, /cache: "no-store"/);
assert.match(home, /JSON\.stringify\(\{ initData \}\)/);
assert.match(home, /\{MAX_HOME_TITLE\}/);
assert.match(home, /\{MAX_HOME_SUBTITLE\}/);
assert.doesNotMatch(home, /MAX_HOME_OPEN_CATALOG_LABEL|MAX_HOME_LISTEN_FREE_LABEL|onOpenCatalog/);
assert.match(home, /\{shelf\.title\}/);
assert.match(home, /\{MAX_HOME_SEE_ALL_LABEL\}/);
assert.match(home, /PUBLIC_CATALOG_SECTION_CARDS/);
assert.match(home, /data-max-home-section=\{section\.value\}/);
assert.match(home, /MaxCatalogProductCard/);
assert.doesNotMatch(home, /MaxProductDetailView/);
assert.match(home, /guestMode/);
assert.match(home, /\{guestMode \?/);
assert.match(home, /<MaxGuestHomeSlider/);
assert.match(home, /data-max-guest-home-cta/);
assert.match(home, /GUEST_HOME_INTRO/);
assert.match(home, /GUEST_HOME_LISTEN_FREE_CTA\.label/);
assert.doesNotMatch(home, /localStorage|sessionStorage|useRouter|next\/link|next\/navigation/);
assert.doesNotMatch(home, /user_id|max_user_id|initDataUnsafe|for-you|listen history/i);

assert.match(shell, /function openHomeProduct\(product: MaxCatalogProduct\)/);
assert.match(shell, /setActiveTab\("catalog"\)/);
assert.match(shell, /openCatalogProduct\(product\)/);
assert.match(shell, /<MaxProductDetailView/);
assert.doesNotMatch(shell, /onOpenCatalog/);
assert.match(
  shell,
  /onListenFree=\{\(\) => openCatalogFromHome\(\{ section: null, access: "free" \}\)\}/,
);
assert.match(
  shell,
  /onOpenSection=\{\(section\) => openCatalogFromHome\(\{ section, access: "all" \}\)\}/,
);
assert.match(shell, /onOpenShelf=\{\(shelfId\) => openCatalogFromHome\(homeShelfTarget\(shelfId\)\)\}/);
assert.match(shell, /section: target\.section/);
assert.match(shell, /access: target\.access/);
assert.match(shell, /publicationClass: target\.publicationClass \?\? "all"/);
assert.match(shell, /function applyGuestHomeSlide\(slideId: string\)/);
assert.match(shell, /resolveMaxGuestHomeSlideAction\(slideId\)/);
assert.match(shell, /openMaxGuestHomeExternalSlide\(action\.url\)/);
assert.match(shell, /selectMaxTab\("playlists"\)/);
const maxGuestSlideHandler = shell.slice(
  shell.indexOf("function applyGuestHomeSlide"),
  shell.indexOf("function selectMaxTab"),
);
assert.match(maxGuestSlideHandler, /action\.type === "library"/);
assert.match(maxGuestSlideHandler, /selectMaxTab\("library"\)/);
assert.doesNotMatch(
  maxGuestSlideHandler,
  /signup|onRequestSignup|\/auth\/|become-author/,
);
const maxLibraryPane = shell.slice(
  shell.indexOf('{activeTab === "library" ? ('),
  shell.indexOf('{activeTab === "profile"'),
);
assert.match(maxLibraryPane, /<MaxLibrary/);
assert.match(maxLibraryPane, /guestMode=\{guestMode\}/);
assert.match(maxLibraryPane, /onRequestLogin=\{onRequestLogin\}/);
assert.match(maxLibraryPane, /onRequestSignup=\{onRequestSignup\}/);
assert.match(shell, /publicationClass: action\.publicationClass/);
assert.match(search, /section\?: PublicCatalogSection \| null/);
assert.match(search, /access\?: CatalogAccessFilter/);
assert.match(search, /applyFilters\(\[topicKey\], "all", "all"\)/);
assert.match(
  search,
  /applyFilters\(topicKey \? \[topicKey\] : \[\], access, publicationClass\)/,
);
assert.match(search, /activeSectionRef\.current = section/);
assert.match(search, /setActiveSection\(null\)/);
assert.doesNotMatch(
  `${shell}\n${home}\n${search}\n${card}`,
  /localStorage|sessionStorage|useRouter|useSearchParams|router\.push|openLink/,
);

const selectFn = shell.slice(
  shell.indexOf("function selectMaxTab"),
  shell.indexOf("const activeTabLabel"),
);
assert.match(selectFn, /if \(activeTab === "catalog" \|\| activeTab === "library"\)/);
assert.match(selectFn, /setSelected\(null\)/);
assert.match(shell, /activeTab === "catalog" && selected && !promoTarget/);
assert.match(shell, /<MaxBottomNav activeTab=\{activeTab\} onSelectTab=\{selectMaxTab\} \/>/);
assert.match(shell, /<MaxProfile/);
assert.match(shell, /onUnlinkAccount/);
assert.match(shell, /MAX_PLAYBACK_SESSION_PATH/);
assert.match(shell, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(shell, /interactiveActionsEnabled=\{!guestMode\}/);
assert.match(shell, /<AudioladHorizontalLogo/);

assert.deepEqual(
  MAX_HOME_SHELVES.map((shelf) => shelf.id),
  ["free", "music", "meditations"],
);

const parsed = readMaxHomeShelves({
  ok: true,
  shelves: {
    free: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        storagePath: "private/a.mp3",
        user_id: "browser-user",
        authorSlug: "author",
        slug: "free-one",
        title: "Бесплатная практика",
        subtitle: null,
        coverUrl: "https://cdn.example.test/free.webp",
        authorName: "Автор",
        formatLabel: "Практика",
        priceLabel: "Бесплатно",
        isFree: true,
      },
    ],
    music: [],
    meditations: [
      {
        authorSlug: "author",
        slug: "med-one",
        title: "Тишина",
        subtitle: null,
        coverUrl: null,
        authorName: "Автор",
        formatLabel: "Медитация",
        priceLabel: "490 ₽",
        isFree: false,
      },
    ],
  },
});
assert.ok(parsed);
assert.equal(parsed.free[0].id, undefined);
assert.equal(JSON.stringify(parsed).includes("storagePath"), false);
assert.equal(JSON.stringify(parsed).includes("browser-user"), false);
assert.equal(JSON.stringify(parsed).includes("aaaaaaaa-aaaa-4aaa-8aaa"), false);
assert.equal(readMaxHomeShelves({ shelves: { free: [], music: [] } }), null);

const linkedProps = {
  guestMode: false,
  onListenFree: () => {},
  onSlideAction: () => {},
  onOpenSection: () => {},
  onOpenShelf: () => {},
  onSelectProduct: () => {},
};

const markup = renderToStaticMarkup(
  createElement(MaxHomeScreen, {
    ...linkedProps,
    status: "ready",
    shelves: parsed,
  }),
);
assert.match(markup, /АудиоЛад/);
assert.ok(markup.includes(MAX_HOME_SUBTITLE));
assert.doesNotMatch(markup, /Открыть каталог/);
assert.doesNotMatch(markup, /Слушать бесплатно/);
assert.match(markup, /data-max-home-section="music"/);
assert.match(markup, /data-max-home-section="meditations"/);
assert.match(markup, /data-max-home-section="education"/);
assert.match(markup, /data-max-home-section="stories"/);
assert.match(markup, /aria-label="Музыка"/);
assert.match(markup, /aria-label="Практики"/);
assert.match(markup, /aria-label="Обучение"/);
assert.match(markup, /aria-label="Истории"/);
assert.match(markup, /data-max-home-shelf="free"/);
assert.match(markup, /Слушайте бесплатно/);
assert.match(markup, /Бесплатная практика/);
assert.match(markup, /data-max-home-shelf="meditations"/);
assert.match(markup, /Практики и медитации/);
assert.match(markup, /Тишина/);
assert.doesNotMatch(markup, /data-max-home-shelf="music"/);
assert.equal(markup.split("Смотреть все").length - 1, 2);
assert.match(markup, /rounded-\[20px\]/);
assert.match(markup, /data-max-home-guest="false"/);
assert.doesNotMatch(markup, /<a[\s>]|\/catalog\?|\/practice\//);
assert.doesNotMatch(markup, /data-max-guest-home-slider|data-max-guest-home-intro|Начать слушать бесплатно/);
assert.doesNotMatch(markup, /\/images\/home\/guest-slider\//);

const loading = renderToStaticMarkup(
  createElement(MaxHomeScreen, {
    ...linkedProps,
    status: "loading",
    shelves: null,
  }),
);
assert.doesNotMatch(loading, /Открыть каталог/);
assert.doesNotMatch(loading, /Слушать бесплатно/);
assert.match(loading, /data-max-home-section="music"/);
assert.match(loading, /data-max-home-section="meditations"/);
assert.match(loading, /data-max-home-section="education"/);
assert.match(loading, /data-max-home-section="stories"/);
assert.match(loading, /Собираем подборки/);
assert.doesNotMatch(loading, /data-max-home-shelf=/);
assert.doesNotMatch(loading, /data-max-guest-home-slider/);

const guestActions = [];
const guestMarkup = renderToStaticMarkup(
  createElement(MaxHomeScreen, {
    ...linkedProps,
    guestMode: true,
    status: "ready",
    shelves: parsed,
    onListenFree: () => guestActions.push("cta"),
    onSlideAction: (slideId) => guestActions.push(slideId),
  }),
);
assert.match(guestMarkup, /data-max-home-guest="true"/);
assert.match(guestMarkup, /data-max-guest-home-intro/);
assert.ok(guestMarkup.includes(GUEST_HOME_INTRO));
assert.match(guestMarkup, /data-max-guest-home-cta/);
assert.ok(guestMarkup.includes(GUEST_HOME_LISTEN_FREE_CTA.label));
assert.equal(GUEST_HOME_SLIDES.length, 7);
assert.equal((guestMarkup.match(/data-max-guest-home-slide=/g) ?? []).length, 7);
assert.equal((guestMarkup.match(/data-max-guest-home-dot=/g) ?? []).length, 7);
assert.match(
  guestMarkup,
  /data-max-guest-home-dot="01"[^>]*aria-current="true"/,
);
for (const slide of GUEST_HOME_SLIDES) {
  assert.match(guestMarkup, new RegExp(`data-max-guest-home-slide="${slide.id}"`));
  assert.match(guestMarkup, new RegExp(`data-max-guest-home-dot="${slide.id}"`));
  assert.ok(guestMarkup.includes(slide.src), slide.src);
  assert.match(slide.src, /^\/images\/home\/guest-slider\/0[1-7]-audio-practices\.webp$/);
}
assert.match(guestMarkup, /data-max-home-section="music"/);
assert.match(guestMarkup, /data-max-home-section="meditations"/);
assert.match(guestMarkup, /data-max-home-section="education"/);
assert.match(guestMarkup, /data-max-home-section="stories"/);
assert.match(guestMarkup, /data-max-home-shelf="free"/);
assert.match(guestMarkup, /data-max-home-shelf="meditations"/);
assert.match(guestMarkup, /Бесплатная практика/);
assert.doesNotMatch(guestMarkup, /Открыть каталог/);
assert.equal(guestMarkup.includes(MAX_HOME_SUBTITLE), false);
const guestBody = guestMarkup.replace(/<link\b[^>]*>/g, "");
assert.doesNotMatch(guestBody, /<a[\s>]|\/catalog\?|\/practice\/|\/auth\/|\/playlists\//);
assert.doesNotMatch(guestBody, /href=/);
for (const href of guestMarkup.matchAll(/<link\b[^>]*href="([^"]+)"/g)) {
  assert.match(href[1], /^\/images\/|^https:\/\/cdn\.example\.test\//, href[1]);
}

const maxSlideSources = `${slider}\n${slideActions}\n${home}`;
assert.match(slider, /GUEST_HOME_SLIDES\.map/);
assert.match(slider, /nearestMaxGuestSlideIndex/);
assert.match(slider, /maxGuestSlideClickActivates\(gestureRef\.current\)/);
assert.match(slider, /onSlideAction\(slideId\)/);
assert.match(slider, /guest-home-slider guest-home-slider--max/);
assert.match(slider, /guest-home-slider__dot--active/);
assert.match(slider, /aspect-ratio|guest-home-slider__media/);
assert.doesNotMatch(slider, /01-audio-practices\.webp/);
assert.doesNotMatch(slider, /setInterval|autoplay|guest-home-slider__arrow|Следующий слайд|Предыдущий слайд/);
assert.doesNotMatch(
  maxSlideSources,
  /next\/link|next\/navigation|useRouter|useSearchParams|router\.push|<a[\s>]|href=["']\/|\/catalog["']|\/auth\/|\/playlists\/|\/my-practices/,
);
assert.match(slideActions, /openMaxExternalLink\(url\)/);
assert.match(slideActions, /isMaxGuestHomeAuthorSlideUrl\(url\)/);
assert.ok(CATALOG_CLASS_FILTERS.includes("release"));

assert.deepEqual(resolveMaxGuestHomeSlideAction("01"), {
  type: "catalog",
  section: null,
  access: "all",
  publicationClass: "release",
});
assert.deepEqual(resolveMaxGuestHomeSlideAction("02"), {
  type: "catalog",
  section: null,
  access: "free",
  publicationClass: "all",
});
assert.deepEqual(resolveMaxGuestHomeSlideAction("03"), {
  type: "catalog",
  section: null,
  access: "all",
  publicationClass: "all",
});
assert.deepEqual(resolveMaxGuestHomeSlideAction("04"), { type: "playlists" });
assert.deepEqual(resolveMaxGuestHomeSlideAction("05"), {
  type: "catalog",
  section: null,
  access: "paid",
  publicationClass: "all",
});
assert.deepEqual(resolveMaxGuestHomeSlideAction("06"), { type: "library" });
assert.notEqual(resolveMaxGuestHomeSlideAction("06")?.type, "signup");
assert.equal(
  resolveMaxGuestHomeAuthorUrl(),
  "https://audiolad.ru/dlya-avtorov-meditatsiy",
);
assert.deepEqual(resolveMaxGuestHomeSlideAction("07"), {
  type: "external",
  url: "https://audiolad.ru/dlya-avtorov-meditatsiy",
});
assert.equal(
  new URL(resolveMaxGuestHomeSlideAction("07").url).pathname,
  "/dlya-avtorov-meditatsiy",
);
assert.equal(
  resolveMaxGuestHomeSlideAction("07").url.includes("become-author"),
  false,
);
assert.equal(resolveMaxGuestHomeSlideAction("07").url.includes("/auth/"), false);
assert.equal(resolveMaxGuestHomeSlideAction("08"), null);
for (const slide of GUEST_HOME_SLIDES) {
  assert.ok(resolveMaxGuestHomeSlideAction(slide.id), slide.id);
}

assert.equal(isMaxGuestHomeAuthorSlideUrl("https://audiolad.ru/dlya-avtorov-meditatsiy"), true);
for (const blocked of [
  "https://audiolad.ru/catalog",
  "https://audiolad.ru/catalog?access=free",
  "https://audiolad.ru/auth/sign-up",
  "https://audiolad.ru/become-author",
  "https://audiolad.ru/playlists/catalog",
  "https://audiolad.ru/dlya-avtorov-meditatsiy?next=/",
  "https://evil.example/dlya-avtorov-meditatsiy",
  "http://audiolad.ru/dlya-avtorov-meditatsiy",
  "javascript:alert(1)",
]) {
  assert.equal(isMaxGuestHomeAuthorSlideUrl(blocked), false, blocked);
  assert.equal(openMaxGuestHomeExternalSlide(blocked), false, blocked);
}

const tap = beginMaxGuestSlideGesture({ x: 10, y: 20 });
assert.equal(maxGuestSlideClickActivates(tap), true);
const held = moveMaxGuestSlideGesture(tap, { x: 18, y: 20 });
assert.equal(held.moved, false);
assert.equal(maxGuestSlideClickActivates(endMaxGuestSlidePointer(held)), true);
const swiped = moveMaxGuestSlideGesture(tap, { x: 19, y: 20 });
assert.equal(swiped.moved, true);
assert.equal(maxGuestSlideClickActivates(endMaxGuestSlidePointer(swiped)), false);
const diagonal = moveMaxGuestSlideGesture(tap, { x: 16, y: 26 });
assert.equal(diagonal.moved, true);
assert.equal(nearestMaxGuestSlideIndex([], 40), 0);
assert.equal(nearestMaxGuestSlideIndex([0, 100, 200], 0), 0);
assert.equal(nearestMaxGuestSlideIndex([0, 100, 200], 40), 0);
assert.equal(nearestMaxGuestSlideIndex([0, 100, 200], 90), 1);
assert.equal(nearestMaxGuestSlideIndex([0, 100, 200], 200), 2);

console.log("max-home-unit: ok");
