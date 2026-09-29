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

import { MaxHomeScreen } from "../src/components/max/MaxHome.tsx";
import { readMaxHomeShelves, MAX_HOME_SHELVES } from "../src/lib/max/home.ts";
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
  shell.indexOf("<MaxTabPlaceholder"),
);
assert.match(homePane, /<MaxHome/);
assert.doesNotMatch(homePane, /guestMode/);
assert.match(shell, /activeTab === "catalog" \|\| activeTab === "profile" \|\| activeTab === "home"/);
assert.match(shell, /<MaxTabPlaceholder title=\{activeTabLabel\} \/>/);

assert.match(home, /MAX_HOME_PATH/);
assert.match(home, /method: "POST"/);
assert.match(home, /cache: "no-store"/);
assert.match(home, /JSON\.stringify\(\{ initData \}\)/);
assert.match(home, /\{MAX_HOME_TITLE\}/);
assert.match(home, /\{MAX_HOME_SUBTITLE\}/);
assert.match(home, /\{MAX_HOME_OPEN_CATALOG_LABEL\}/);
assert.match(home, /\{MAX_HOME_LISTEN_FREE_LABEL\}/);
assert.match(home, /\{shelf\.title\}/);
assert.match(home, /\{MAX_HOME_SEE_ALL_LABEL\}/);
assert.match(home, /PUBLIC_CATALOG_SECTION_CARDS/);
assert.match(home, /data-max-home-section=\{section\.value\}/);
assert.match(home, /MaxCatalogProductCard/);
assert.doesNotMatch(home, /MaxProductDetailView/);
assert.doesNotMatch(home, /guestMode|localStorage|sessionStorage|useRouter|next\/link|next\/navigation/);
assert.doesNotMatch(home, /user_id|max_user_id|initDataUnsafe|for-you|listen history/i);

assert.match(shell, /function openHomeProduct\(product: MaxCatalogProduct\)/);
assert.match(shell, /setActiveTab\("catalog"\)/);
assert.match(shell, /openCatalogProduct\(product\)/);
assert.match(shell, /<MaxProductDetailView/);
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
assert.match(shell, /publicationClass: "all"/);
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
assert.match(selectFn, /if \(activeTab === "catalog"\)/);
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

const markup = renderToStaticMarkup(
  createElement(MaxHomeScreen, {
    status: "ready",
    shelves: parsed,
    onOpenCatalog: () => {},
    onListenFree: () => {},
    onOpenSection: () => {},
    onOpenShelf: () => {},
    onSelectProduct: () => {},
  }),
);
assert.match(markup, /АудиоЛад/);
assert.match(markup, /Музыка, медитации, аудиопрактики и аудиокурсы/);
assert.match(markup, /Открыть каталог/);
assert.match(markup, /Слушать бесплатно/);
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
assert.doesNotMatch(markup, /<a[\s>]|\/catalog\?|\/practice\//);

const loading = renderToStaticMarkup(
  createElement(MaxHomeScreen, {
    status: "loading",
    shelves: null,
    onOpenCatalog: () => {},
    onListenFree: () => {},
    onOpenSection: () => {},
    onOpenShelf: () => {},
    onSelectProduct: () => {},
  }),
);
assert.match(loading, /Открыть каталог/);
assert.match(loading, /Собираем подборки/);
assert.doesNotMatch(loading, /data-max-home-shelf=/);

console.log("max-home-unit: ok");
