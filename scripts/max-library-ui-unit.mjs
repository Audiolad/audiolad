#!/usr/bin/env node
/**
 * MAX Аудиотека tab: guest gate, canonical chips, native product and playlist open.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MaxLibrary,
  MaxLibraryGuest,
  MaxLibraryView,
  MAX_LIBRARY_ERROR_LABEL,
  MAX_LIBRARY_GUEST_MESSAGE,
  MAX_LIBRARY_LOADING_LABEL,
  MAX_LIBRARY_RETRY_LABEL,
  MAX_LIBRARY_SEARCH_PLACEHOLDER,
  MAX_LIBRARY_TITLE,
} from "../src/components/max/MaxLibrary.tsx";
import { LIBRARY_COLLECTION_FILTERS } from "../src/lib/library/filters.ts";
import { LIBRARY_SEARCH_DEBOUNCE_MS, LIBRARY_SORT_OPTIONS } from "../src/lib/library/unified-query.ts";
import {
  maxLibraryCatalogToProduct,
  maxLibraryFilterOptions,
  selectMaxLibraryItems,
} from "../src/lib/max/library-dto.ts";
import { MAX_SHELL_LOGIN_CTA, MAX_SHELL_SIGNUP_CTA } from "../src/lib/max/session-shell.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");

const library = read("src/components/max/MaxLibrary.tsx");
const home = read("src/components/max/MaxAuthenticatedHome.tsx");
const playlists = read("src/components/max/MaxPlaylists.tsx");
const detail = read("src/components/max/MaxPlaylistDetail.tsx");

assert.equal(MAX_LIBRARY_TITLE, "Аудиотека");
assert.equal(MAX_LIBRARY_SEARCH_PLACEHOLDER, "Поиск в аудиотеке");
assert.equal(MAX_LIBRARY_LOADING_LABEL, "Загружаем аудиотеку…");
assert.equal(MAX_LIBRARY_ERROR_LABEL, "Не удалось загрузить аудиотеку.");
assert.equal(MAX_LIBRARY_RETRY_LABEL, "Повторить");
assert.equal(
  MAX_LIBRARY_GUEST_MESSAGE,
  "Войдите в АудиоЛад, чтобы открыть свою Аудиотеку",
);
assert.equal(LIBRARY_SEARCH_DEBOUNCE_MS, 300);

assert.match(library, /LIBRARY_SEARCH_DEBOUNCE_MS/);
assert.match(library, /LIBRARY_SORT_OPTIONS/);
assert.match(library, /selectMaxLibraryItems/);
assert.match(library, /getLibraryFilterEmptyMessage/);
assert.match(library, /MAX_LIBRARY_PATH/);
assert.match(library, /method: "POST"/);
assert.match(library, /cache: "no-store"/);
assert.match(library, /JSON\.stringify\(\{ initData \}\)/);
assert.match(library, /grid-cols-2/);
assert.doesNotMatch(library, /Моё аудио|Личное|Скачанные/);
assert.doesNotMatch(library, /href=["']\/catalog|\/my-practices|window\.location|next\/link|next\/navigation/);
assert.doesNotMatch(library, /MaxPlaylistDetail|MaxAudioPlayer|onUnlink|signOut/);

const guestSource = library.slice(
  library.indexOf("export function MaxLibraryGuest"),
  library.indexOf("export function MaxLibraryView"),
);
assert.doesNotMatch(guestSource, /fetch\(|MAX_LIBRARY_PATH/);
assert.match(library, /if \(guestMode\) \{\s*return \(\s*<MaxLibraryGuest/);

const opener = library.slice(
  library.indexOf("function openCatalogEntry"),
  library.indexOf("function openPlaylistEntry"),
);
assert.match(opener, /maxLibraryCatalogToProduct\(item\)/);
assert.match(opener, /onOpenProduct\(product\)/);
assert.doesNotMatch(opener, /canListen/);
assert.match(library, /onOpenPlaylist\(slug\)/);
assert.doesNotMatch(library, /MaxPlaylistDetail/);

assert.match(home, /activeTab === "library" \? \(/);
assert.match(home, /<MaxLibrary/);
assert.match(home, /guestMode=\{guestMode\}/);
assert.match(home, /onOpenProduct=\{openCatalogProduct\}/);
assert.match(home, /onOpenPlaylist=\{openLibraryPlaylist\}/);
assert.match(home, /onBrowseCatalog=\{\(\) => selectMaxTab\("catalog"\)\}/);
assert.match(home, /onOpenPlaylists=\{\(\) => selectMaxTab\("playlists"\)\}/);
assert.match(home, /activeTab === "library" && selected && !promoTarget/);
assert.match(home, /← Назад в аудиотеку/);
assert.match(home, /← Назад в каталог/);
assert.match(home, /requestedSlug=\{playlistRequest\}/);
assert.doesNotMatch(home, /practiceId|audio_path|audioUrl/);
assert.doesNotMatch(home, /<MaxTabPlaceholder/);

assert.match(playlists, /requestedSlug/);
assert.match(playlists, /MaxPlaylistDetail/);
assert.match(playlists, /setSlug\(requestedSlug\.slug\)/);
assert.match(detail, /MAX_PLAYLISTS_DETAIL_PATH/);
assert.match(detail, /MAX_PLAYBACK_SESSION_PATH/);
assert.equal(home.split("<MaxAudioPlayer").length - 1, 1);

const filters = maxLibraryFilterOptions();
assert.deepEqual(
  filters.map((item) => item.id),
  ["all", "saved", "purchased", "gifts", "playlists"],
);
assert.deepEqual(
  filters.map((item) => item.label),
  LIBRARY_COLLECTION_FILTERS.filter((item) =>
    ["all", "saved", "purchased", "gifts", "playlists"].includes(item.id),
  ).map((item) => item.label),
);
assert.deepEqual(LIBRARY_SORT_OPTIONS.map((item) => item.label), [
  "Сначала новые",
  "Сначала старые",
  "По алфавиту А–Я",
]);

const savedPaid = {
  kind: "catalog",
  practiceId: "practice-saved",
  title: "Сохранённая тишина",
  coverUrl: "https://cdn.example.test/saved.webp",
  authorName: "Анна Автор",
  authorSlug: "anna",
  productSlug: "sohranennaya-tishina",
  displayLabel: "Медитация",
  duration: { unit: "minutes", value: 8 },
  isSaved: true,
  canListen: false,
  accessSource: null,
  isFree: false,
  price: 700,
  priceLabel: "700 ₽",
  sortAt: 3,
};
const product = maxLibraryCatalogToProduct(savedPaid);
assert.equal(product.authorSlug, "anna");
assert.equal(product.slug, "sohranennaya-tishina");
assert.equal(product.isFree, false);
assert.equal(
  selectMaxLibraryItems([savedPaid], { filter: "purchased", query: "", sort: "new" }).length,
  0,
);
assert.equal(
  selectMaxLibraryItems([savedPaid], { filter: "saved", query: "Анна", sort: "alpha" }).length,
  1,
);

const guestHtml = renderToStaticMarkup(
  createElement(MaxLibraryGuest, {
    onRequestLogin: () => {},
    onRequestSignup: () => {},
  }),
);
assert.match(guestHtml, new RegExp(MAX_LIBRARY_TITLE));
assert.match(guestHtml, new RegExp(MAX_LIBRARY_GUEST_MESSAGE));
assert.match(guestHtml, new RegExp(MAX_SHELL_LOGIN_CTA));
assert.match(guestHtml, new RegExp(MAX_SHELL_SIGNUP_CTA));
assert.doesNotMatch(guestHtml, /Поиск в аудиотеке|Загружаем аудиотеку/);

const linkedLoading = renderToStaticMarkup(
  createElement(MaxLibrary, {
    guestMode: false,
    onOpenProduct: () => {},
    onOpenPlaylist: () => {},
    onBrowseCatalog: () => {},
    onOpenPlaylists: () => {},
  }),
);
assert.match(linkedLoading, new RegExp(MAX_LIBRARY_LOADING_LABEL));
assert.doesNotMatch(linkedLoading, new RegExp(MAX_LIBRARY_GUEST_MESSAGE));

const viewHtml = renderToStaticMarkup(
  createElement(MaxLibraryView, {
    items: [
      savedPaid,
      {
        kind: "playlist",
        slug: "morning-list",
        title: "Утренний плейлист",
        coverUrl: null,
        creator: "АудиоЛад",
        duration: { unit: "seconds", value: 600 },
        sortAt: 2,
      },
    ],
    onOpenProduct: () => {},
    onOpenPlaylist: () => {},
    onBrowseCatalog: () => {},
    onOpenPlaylists: () => {},
  }),
);
assert.match(viewHtml, /Поиск в аудиотеке/);
assert.match(viewHtml, /Все/);
assert.match(viewHtml, /Сохранённые/);
assert.match(viewHtml, /Купленные/);
assert.match(viewHtml, /Подарки/);
assert.match(viewHtml, /Плейлисты/);
assert.match(viewHtml, /Сначала новые/);
assert.match(viewHtml, /Сначала старые/);
assert.match(viewHtml, /По алфавиту А–Я/);
assert.match(viewHtml, /grid-cols-2/);
assert.match(viewHtml, /Сохранённая тишина/);
assert.match(viewHtml, /Утренний плейлист/);
assert.match(viewHtml, /data-max-library-kind="catalog"/);
assert.match(viewHtml, /data-max-library-can-listen="false"/);
assert.match(viewHtml, /data-max-library-kind="playlist"/);
assert.match(viewHtml, /data-max-library-slug="morning-list"/);
assert.doesNotMatch(viewHtml, /Моё аудио|Личное|Скачанные/);

const emptyHtml = renderToStaticMarkup(
  createElement(MaxLibraryView, {
    items: [],
    onOpenProduct: () => {},
    onOpenPlaylist: () => {},
    onBrowseCatalog: () => {},
    onOpenPlaylists: () => {},
  }),
);
assert.match(emptyHtml, /В Аудиотеке пока пусто/);
assert.match(emptyHtml, /Перейти в каталог/);
assert.match(emptyHtml, /data-max-library-cta="catalog"/);
assert.doesNotMatch(emptyHtml, /href=/);

console.log("max-library-ui-unit: ok");
