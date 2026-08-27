import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readPaidCatalogOfferPriceLabel } from "../src/lib/catalog/offer";
import {
  canShowLibraryPaidSaveOffer,
  canUseLibraryFullListen,
  resolveLibraryCardBadge,
} from "../src/lib/library/card-ui";
import {
  mergeLibraryCollection,
  type LibraryCollectionItem,
  type LibraryCollectionPractice,
} from "../src/lib/library/collection";
import {
  getLibraryFilterEmptyCta,
  getLibraryFilterEmptyMessage,
  isLibraryFilterId,
  LIBRARY_COLLECTION_FILTERS,
} from "../src/lib/library/filters";
import { unifiedCatalogEntryToCatalogCard } from "../src/lib/library/unified-catalog-card";
import {
  mapCatalogLibraryEntry,
  mapPersonalLibraryEntry,
  mapPlaylistLibraryEntry,
  mapPrivateAudioLibraryEntry,
} from "../src/lib/library/unified-entry";
import { matchesUnifiedLibraryFilter } from "../src/lib/library/unified-filter";
import {
  applyUnifiedLibraryView,
  buildMyPracticesHref,
  compareUnifiedLibrarySort,
  formatLibraryMaterialsCount,
  matchesUnifiedLibrarySearch,
  parseLibrarySort,
} from "../src/lib/library/unified-query";
import type { MyPersonalMaterialListItemDto } from "../src/lib/personal-materials/client-library/types";
import type { PrivateAudioListItemDto } from "../src/lib/private-audio/types";
import { LIBRARY_FALLBACK_COVER_SRC } from "../src/components/my-practices/LibraryFallbackCover";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PRACTICE_PAID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRACTICE_PURCHASED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAYLIST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRIVATE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSONAL_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function practice(
  id: string,
  overrides: Partial<LibraryCollectionPractice> = {},
): LibraryCollectionPractice {
  return {
    id,
    title: `Practice ${id.slice(0, 8)}`,
    slug: `practice-${id.slice(0, 8)}`,
    format: "Медитация",
    durationMinutes: 12,
    coverUrl: null,
    coverImage: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    audioUrl: "https://cdn.example/full-audio.mp3",
    isFree: false,
    price: 990,
    authorName: "Автор",
    authorSlug: "author",
    ...overrides,
  };
}

function catalogItem(
  input: Parameters<typeof mergeLibraryCollection>[0],
): LibraryCollectionItem {
  const items = mergeLibraryCollection(input);
  assert.ok(items[0], "collection merge produced an item");
  return items[0];
}

function paidWishListItem(): LibraryCollectionItem {
  return catalogItem({
    entitlements: [],
    saves: [{ practiceId: PRACTICE_PAID, createdAt: "2026-08-20T10:00:00.000Z" }],
    practices: new Map([[PRACTICE_PAID, practice(PRACTICE_PAID)]]),
  });
}

function purchasedItem(): LibraryCollectionItem {
  return catalogItem({
    entitlements: [
      {
        id: "up-buy",
        practiceId: PRACTICE_PURCHASED,
        accessSource: "purchase",
        grantedAt: "2026-08-18T00:00:00.000Z",
        expiresAt: null,
      },
    ],
    saves: [],
    practices: new Map([[PRACTICE_PURCHASED, practice(PRACTICE_PURCHASED)]]),
  });
}

function playlistEntry() {
  return mapPlaylistLibraryEntry({
    id: PLAYLIST_ID,
    slug: "evening",
    href: "/playlists/evening",
    title: "Вечер",
    coverUrl: null,
    creator: "АудиоЛад",
    durationSeconds: 600,
    savedAt: "2026-08-21T00:00:00.000Z",
  });
}

function privateEntry(coverUrl: string | null = null) {
  const item: PrivateAudioListItemDto = {
    id: PRIVATE_ID,
    sourceType: "upload",
    title: "Мой файл",
    authorText: "Я",
    durationSeconds: 90,
    audioSizeBytes: 1024,
    hasCover: Boolean(coverUrl),
    coverUrl,
    progress: {
      positionSeconds: 0,
      durationSeconds: 90,
      completed: false,
      updatedAt: null,
    },
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
  };

  return mapPrivateAudioLibraryEntry(item);
}

function personalEntry() {
  const item: MyPersonalMaterialListItemDto = {
    id: PERSONAL_ID,
    materialType: "diagnostic",
    title: "Разбор",
    author: {
      id: "author-1",
      name: "Автор",
      slug: "author",
      avatarUrl: null,
    },
    diagnosticDate: null,
    claimedAt: "2026-08-09T00:00:00.000Z",
    progress: {
      positionSeconds: 0,
      durationSeconds: 120,
      completed: false,
      updatedAt: null,
    },
    availability: "available",
    hasAudio: true,
    hasPdf: false,
    pdfOriginalFilename: null,
  };

  return mapPersonalLibraryEntry(item);
}

function testCollectionFilters() {
  assert.deepEqual(
    LIBRARY_COLLECTION_FILTERS.map((filter) => filter.id),
    ["all", "saved", "purchased", "gifts", "playlists", "uploads", "personal"],
  );
  assert.deepEqual(
    LIBRARY_COLLECTION_FILTERS.map((filter) => filter.label),
    [
      "Все",
      "Сохранённые",
      "Купленные",
      "Подарки",
      "Плейлисты",
      "Моё аудио",
      "Личное",
    ],
  );
  assert.equal(isLibraryFilterId("playlists"), true);
  assert.equal(isLibraryFilterId("personal"), true);
  assert.equal(isLibraryFilterId("uploads"), true);
  assert.equal(isLibraryFilterId("downloaded"), true);

  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  const chrome = read("src/components/my-practices/MyPracticesLibraryChrome.tsx");
  const filters = read("src/components/my-practices/MyPracticesLibraryFilters.tsx");
  const search = read("src/components/my-practices/MyPracticesLibrarySearch.tsx");
  const page = read(
    "src/app/(platform)/(listener)/(library)/my-practices/page.tsx",
  );
  const layout = read(
    "src/app/(platform)/(listener)/(library)/my-practices/layout.tsx",
  );
  const mobileHeader = read("src/components/listener/LibraryMobileHeader.tsx");
  const shellSearch = read("src/components/listener/DesktopShellSearch.tsx");

  assert.match(chrome, /MyPracticesLibrarySearch/);
  assert.match(chrome, /MyPracticesLibraryFilters/);
  assert.match(library, /MyPracticesLibrarySort/);
  assert.match(library, /buildMyPracticesHref/);
  assert.match(chrome, /buildMyPracticesHref/);
  assert.match(library, /scroll:\s*false/);
  assert.match(chrome, /scroll:\s*false/);
  assert.doesNotMatch(library, /Мои записи/);
  assert.doesNotMatch(library, /В библиотеке/);
  assert.doesNotMatch(library, /overflow-x-auto px-5 pb-2/);
  assert.doesNotMatch(library, /PlatformSearchCombobox/);
  assert.doesNotMatch(library, /buildCatalogHref|\/api\/catalog\/search/);
  assert.match(library, /В аудиотеке:/);
  assert.match(library, /formatLibraryMaterialsCount/);

  assert.match(search, /Поиск по аудиотеке/);
  assert.match(filters, /Коллекция/);
  assert.match(filters, /Фильтры/);
  assert.match(filters, /LIBRARY_COLLECTION_FILTERS/);
  assert.match(filters, /createPortal/);
  assert.match(filters, /catalog-sheet-lock/);
  assert.doesNotMatch(filters, /document\.body\.style\.overflow/);
  assert.doesNotMatch(filters, /topic=|access=/);
  assert.doesNotMatch(filters, /CatalogMobileFilters|buildCatalogHref/);

  assert.match(layout, /MyPracticesLibraryChrome/);
  assert.match(
    chrome,
    /Всё, что вы сохранили, купили, получили или добавили/,
  );
  assert.match(chrome, /Аудиотека/);
  assert.match(
    mobileHeader,
    /Всё, что вы сохранили, купили, получили или добавили/,
  );
  assert.doesNotMatch(page, /Ваши подарки, купленные и личные материалы/);
  assert.doesNotMatch(mobileHeader, /Ваши подарки и купленные материалы/);

  assert.match(
    shellSearch,
    /pathname === ["']\/my-practices["'] \|\| pathname\.startsWith\(["']\/my-practices\//,
  );
  assert.match(shellSearch, /PlatformSearchCombobox/);
  assert.match(shellSearch, /isPublicPlaylistCatalogPath/);
}

function testBadges() {
  const saveOnly = resolveLibraryCardBadge({
    isSaved: true,
    canListen: false,
    accessSource: null,
    practice: { isFree: false, price: 990 },
  });
  assert.deepEqual(saveOnly, { id: "saved", label: "Сохранено" });

  const purchase = resolveLibraryCardBadge({
    isSaved: false,
    canListen: true,
    accessSource: "purchase",
    practice: { isFree: false, price: 990 },
  });
  assert.deepEqual(purchase, { id: "available", label: "Доступно" });

  const gift = resolveLibraryCardBadge({
    isSaved: false,
    canListen: true,
    accessSource: "gift",
    practice: { isFree: true, price: 0 },
  });
  assert.deepEqual(gift, { id: "gift", label: "Подарок" });

  const savePlusPurchase = resolveLibraryCardBadge({
    isSaved: true,
    canListen: true,
    accessSource: "purchase",
    practice: { isFree: false, price: 990 },
  });
  assert.deepEqual(savePlusPurchase, { id: "available", label: "Доступно" });
}

function testUnifiedLoaderAndGrid() {
  const page = read(
    "src/app/(platform)/(listener)/(library)/my-practices/page.tsx",
  );
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  const layout = read(
    "src/app/(platform)/(listener)/(library)/my-practices/layout.tsx",
  );
  const css = read("src/app/globals.css");
  const catalogLayout = read(
    "src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx",
  );

  assert.match(page, /loadUnifiedLibrary\(supabase, user.id\)/);
  assert.doesNotMatch(page, /loadLibraryCollection\(/);
  assert.doesNotMatch(page, /listPrivateAudioItems/);
  assert.match(library, /entries:\s*UnifiedLibraryEntry\[\]/);
  assert.match(library, /catalog-product-grid/);
  assert.match(library, /listener-library-grid/);
  assert.doesNotMatch(library, /<LibraryCard/);
  assert.doesNotMatch(library, /<PrivateAudioCard/);
  assert.doesNotMatch(library, /className="mt-5 space-y-4"/);

  assert.match(
    layout,
    /listener-library-content px-5 lg:px-10 xl:px-6/,
    "library outer padding stays px-5 / lg:px-10 / xl:px-6",
  );
  assert.doesNotMatch(layout, /px-2\.5/);

  assert.match(
    css,
    /@media \(max-width:\s*767px\) \{\s*\.listener-library-grid \{\s*margin-left:\s*-0\.625rem;[\s\S]*?margin-right:\s*-0\.625rem;/,
    "mobile library grid pulls 10px out of parent px-5",
  );
  assert.match(
    css,
    /\.listener-library-content \.catalog-product-grid \{\s*gap:\s*0\.375rem;/,
    "mobile library grid gap is 0.375rem",
  );
  assert.match(
    css,
    /\.catalog-product-grid \{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    "library reuses 2-column catalog-product-grid",
  );
  assert.match(
    css,
    /@media \(min-width:\s*1280px\) \{[\s\S]*?\.catalog-product-grid \{\s*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/,
    "desktop catalog-product-grid stays 4 columns",
  );
  assert.match(
    css,
    /\.listener-library-content \.catalog-product-grid \{\s*gap:\s*0\.5rem;/,
    "desktop library grid gap is 0.5rem",
  );
  assert.match(
    catalogLayout,
    /listener-catalog-content px-2\.5 md:px-5 lg:px-10 xl:px-6/,
    "/catalog layout padding is unchanged",
  );
}

function testLockedPaidHasNoFullListen() {
  const item = {
    isSaved: true,
    canListen: false,
    practice: { isFree: false, price: 990 },
  };

  assert.equal(canUseLibraryFullListen(item), false);
  assert.equal(canShowLibraryPaidSaveOffer(item), true);

  const entry = mapCatalogLibraryEntry(paidWishListItem());
  const card = unifiedCatalogEntryToCatalogCard(entry);
  const priceLabel = readPaidCatalogOfferPriceLabel(card.default_offer);

  assert.equal(entry.isSaved, true);
  assert.equal(entry.canListen, false);
  assert.equal(card.default_offer?.access, "paid");
  assert.ok(priceLabel, "paid save-only catalog tile exposes a price");
  assert.equal(card.viewer.has_grant, false);
  assert.equal(card.viewer.can_listen, false);

  const tile = read("src/components/my-practices/LibraryCatalogTile.tsx");
  const shell = read("src/components/catalog/cards/CatalogCardShell.tsx");
  const catalogGrid = read("src/components/products/CatalogProductGrid.tsx");
  const cardFile = read("src/components/my-practices/LibraryCard.tsx");
  const preview = read(
    "src/components/my-practices/LibraryCardPreviewPlayButton.tsx",
  );
  const play = read("src/components/my-practices/LibraryCardPlayButton.tsx");

  assert.match(tile, /playback=\{entry\.canListen \? "default" : "none"\}/);
  assert.match(shell, /playback = "default"/);
  assert.match(shell, /playback !== "none"/);
  assert.doesNotMatch(
    catalogGrid,
    /playback=/,
    "/catalog grid does not override playback",
  );

  assert.match(cardFile, /canUseLibraryFullListen\(item\)/);
  assert.match(cardFile, /LibraryCardPreviewPlayButton/);
  assert.doesNotMatch(cardFile, /CatalogProductGridCard/);
  assert.doesNotMatch(
    preview,
    /buildListenPath|href=.*\/listen/,
    "preview play has no /listen link",
  );
  assert.match(preview, /variant="preview"/);
  assert.match(play, /entrySurface: "library"/);
}

function testFilterRules() {
  const paidSave = mapCatalogLibraryEntry(paidWishListItem());
  const purchased = mapCatalogLibraryEntry(purchasedItem());
  const playlist = playlistEntry();
  const privateAudio = privateEntry();
  const personal = personalEntry();

  assert.equal(matchesUnifiedLibraryFilter(playlist, "all"), true);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "saved"), true);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "playlists"), true);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "gifts"), false);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "uploads"), false);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "personal"), false);

  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "all"), true);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "uploads"), true);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "gifts"), false);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "saved"), false);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "playlists"), false);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "personal"), false);

  assert.equal(matchesUnifiedLibraryFilter(personal, "all"), true);
  assert.equal(matchesUnifiedLibraryFilter(personal, "personal"), true);
  assert.equal(matchesUnifiedLibraryFilter(personal, "uploads"), false);
  assert.equal(matchesUnifiedLibraryFilter(personal, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(personal, "gifts"), false);
  assert.equal(matchesUnifiedLibraryFilter(personal, "saved"), false);
  assert.equal(matchesUnifiedLibraryFilter(personal, "playlists"), false);

  assert.equal(matchesUnifiedLibraryFilter(paidSave, "saved"), true);
  assert.equal(matchesUnifiedLibraryFilter(paidSave, "playlists"), false);
  assert.equal(matchesUnifiedLibraryFilter(paidSave, "personal"), false);
  assert.equal(matchesUnifiedLibraryFilter(paidSave, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(purchased, "purchased"), true);
  assert.equal(matchesUnifiedLibraryFilter(purchased, "uploads"), false);
}

function testSearchMatch() {
  const playlist = playlistEntry();
  const privateAudio = privateEntry();
  const personal = personalEntry();
  const paidSave = mapCatalogLibraryEntry(paidWishListItem());

  assert.equal(matchesUnifiedLibrarySearch(playlist, ""), true);
  assert.equal(matchesUnifiedLibrarySearch(playlist, "  "), true);
  assert.equal(matchesUnifiedLibrarySearch(playlist, "вечер"), true);
  assert.equal(matchesUnifiedLibrarySearch(playlist, "АУДИОЛАД"), true);
  assert.equal(matchesUnifiedLibrarySearch(playlist, "утро"), false);
  assert.equal(matchesUnifiedLibrarySearch(privateAudio, "мой файл"), true);
  assert.equal(matchesUnifiedLibrarySearch(personal, "автор"), true);
  assert.equal(matchesUnifiedLibrarySearch(paidSave, "Practice"), true);
  assert.equal(matchesUnifiedLibrarySearch(paidSave, "990"), false);
  assert.equal(matchesUnifiedLibrarySearch(playlist, playlist.slug), false);
}

function testSortOrder() {
  assert.equal(parseLibrarySort(null), "new");
  assert.equal(parseLibrarySort("old"), "old");
  assert.equal(parseLibrarySort("alpha"), "alpha");
  assert.equal(parseLibrarySort("price"), "new");

  const newer = {
    id: "b",
    title: "Яблоко",
    sortAt: 200,
  };
  const older = {
    id: "a",
    title: "Абрикос",
    sortAt: 100,
  };
  const sameTitleNewer = {
    id: "c",
    title: "Абрикос",
    sortAt: 150,
  };

  assert.ok(compareUnifiedLibrarySort(newer, older, "new") < 0);
  assert.ok(compareUnifiedLibrarySort(newer, older, "old") > 0);
  assert.ok(compareUnifiedLibrarySort(older, newer, "alpha") < 0);
  assert.ok(compareUnifiedLibrarySort(sameTitleNewer, older, "alpha") < 0);

  const playlist = playlistEntry();
  const privateAudio = privateEntry();
  const personal = personalEntry();
  const paidSave = mapCatalogLibraryEntry(paidWishListItem());
  const visible = applyUnifiedLibraryView(
    [personal, privateAudio, paidSave, playlist],
    { filter: "all", query: "", sort: "new" },
  );

  assert.deepEqual(
    visible.map((entry) => entry.id),
    [...visible].sort((left, right) =>
      compareUnifiedLibrarySort(left, right, "new"),
    ).map((entry) => entry.id),
  );

  const alpha = applyUnifiedLibraryView(
    [personal, privateAudio, paidSave, playlist],
    { filter: "all", query: "", sort: "alpha" },
  );
  const titles = alpha.map((entry) => entry.title);
  assert.deepEqual(
    titles,
    [...titles].sort((left, right) => left.localeCompare(right, "ru")),
  );

  const found = applyUnifiedLibraryView(
    [personal, privateAudio, paidSave, playlist],
    { filter: "all", query: "вечер", sort: "new" },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]?.kind, "playlist");

  assert.equal(formatLibraryMaterialsCount(1), "1 материал");
  assert.equal(formatLibraryMaterialsCount(2), "2 материала");
  assert.equal(formatLibraryMaterialsCount(5), "5 материалов");
  assert.equal(
    buildMyPracticesHref({ q: "сон", filter: "saved", sort: "old" }),
    "/my-practices?q=%D1%81%D0%BE%D0%BD&filter=saved&sort=old",
  );
  assert.equal(buildMyPracticesHref({ q: "  ", filter: "all", sort: "new" }), "/my-practices");
}

function testFallbackCover() {
  const owned = read("src/components/my-practices/LibraryOwnedCard.tsx");
  const fallback = read("src/components/my-practices/LibraryFallbackCover.tsx");
  const privateAudio = privateEntry(null);
  const personal = personalEntry();

  assert.equal(privateAudio.cover.url, null);
  assert.equal(personal.cover.url, null);
  assert.equal(LIBRARY_FALLBACK_COVER_SRC, "/brand/audiolad-fallback-mark.png");
  assert.match(fallback, /#f4ecfb/);
  assert.match(fallback, /audiolad-fallback-mark\.png/);
  assert.doesNotMatch(fallback, /ProductCoverThumbnail|hashed|gradient\+symbol/);
  assert.match(owned, /LibraryFallbackCover/);
  assert.match(owned, /entry\.cover\.url/);
  assert.doesNotMatch(owned, /publication_id|CatalogCard/);
}

function testEmptySaved() {
  assert.equal(
    getLibraryFilterEmptyMessage("saved"),
    "Листайте каталог и нажимайте сердце — здесь соберётся ваше.",
  );
  assert.deepEqual(getLibraryFilterEmptyCta("saved"), {
    href: "/catalog",
    label: "Перейти в каталог",
  });
  assert.equal(
    getLibraryFilterEmptyMessage("purchased"),
    "Здесь появятся купленные материалы.",
  );
  assert.deepEqual(getLibraryFilterEmptyCta("purchased"), {
    href: "/catalog",
    label: "Перейти в каталог",
  });
  assert.equal(
    getLibraryFilterEmptyMessage("gifts"),
    "Подарки появятся здесь, когда вы сохраните или откроете бесплатное.",
  );
  assert.deepEqual(getLibraryFilterEmptyCta("gifts"), {
    href: "/catalog?access=free",
    label: "Перейти в каталог",
  });
  assert.match(
    getLibraryFilterEmptyMessage("all"),
    /В Аудиотеке пока пусто/,
  );
  assert.equal(
    getLibraryFilterEmptyMessage("playlists"),
    "Здесь появятся плейлисты, которые вы сохраните.",
  );
  assert.deepEqual(getLibraryFilterEmptyCta("playlists"), {
    href: "/playlists/catalog",
    label: "Перейти к плейлистам",
  });
  assert.equal(
    getLibraryFilterEmptyMessage("personal"),
    "Личные материалы появятся здесь, когда автор отправит их вам.",
  );

  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  assert.match(library, /getLibraryFilterEmptyMessage\(filter\)/);
  assert.match(library, /getLibraryFilterEmptyCta\(filter\)/);
}

function testLibrarySearchScrollRoot() {
  const chrome = read("src/components/my-practices/MyPracticesLibraryChrome.tsx");
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  const filters = read("src/components/my-practices/MyPracticesLibraryFilters.tsx");
  const search = read("src/components/my-practices/MyPracticesLibrarySearch.tsx");
  const layout = read(
    "src/app/(platform)/(listener)/(library)/my-practices/layout.tsx",
  );
  const page = read(
    "src/app/(platform)/(listener)/(library)/my-practices/page.tsx",
  );
  const bottomNav = read("src/components/BottomNav.tsx");
  const css = read("src/app/globals.css");

  const replaceCalls = [
    ...chrome.matchAll(/router\.replace\(([\s\S]*?)\);/g),
    ...library.matchAll(/router\.replace\(([\s\S]*?)\);/g),
  ];
  assert.ok(replaceCalls.length >= 2, "library chrome and grid both replace query");
  for (const match of replaceCalls) {
    assert.match(
      match[1] ?? "",
      /scroll:\s*false/,
      "every library router.replace for q/filter/sort keeps scroll: false",
    );
  }
  assert.doesNotMatch(chrome, /router\.push/);
  assert.doesNotMatch(library, /router\.push/);

  assert.doesNotMatch(chrome, /body\.style\.overflow/);
  assert.doesNotMatch(library, /body\.style\.overflow/);
  assert.doesNotMatch(filters, /body\.style\.overflow/);
  assert.doesNotMatch(search, /body\.style\.overflow/);
  assert.doesNotMatch(layout, /body\.style\.overflow/);
  assert.match(filters, /catalog-sheet-lock/);
  assert.doesNotMatch(filters, /document\.body\.style\.overflow/);

  assert.match(
    layout,
    /MyPracticesLibraryChrome/,
    "search+filters chrome is layout-owned so the input survives q= refresh",
  );
  assert.doesNotMatch(
    page,
    /MyPracticesLibrarySearch|MyPracticesLibraryFilters|MyPracticesLibraryChrome/,
    "navigating page slot does not own the search+filters row",
  );
  assert.doesNotMatch(
    library,
    /MyPracticesLibrarySearch|MyPracticesLibraryFilters/,
    "page grid tree does not mount the in-flow search input",
  );
  assert.match(
    chrome,
    /listener-catalog-mobile-search[^"]*fixed top-0 inset-x-0 z-30/,
    "mobile search+filters reuse catalog fixed top-0 chrome",
  );
  assert.match(
    chrome,
    /listener-catalog-mobile-search[^"]*xl:hidden/,
    "fixed library search chrome stays mobile-only",
  );
  assert.match(
    chrome,
    /listener-catalog-mobile-search-spacer[^"]*xl:hidden/,
    "fixed library search has the catalog spacer",
  );
  assert.match(chrome, /LibraryMobileHeader/, "fixed stack keeps the Аудиотека title");
  assert.match(
    chrome,
    /pt-\[max\(0\.25rem,env\(safe-area-inset-top,0px\)\)\] pb-0/,
    "fixed library chrome reuses catalog safe-area padding",
  );
  assert.doesNotMatch(
    chrome,
    /listener-catalog-mobile-search[^"]*sticky/,
    "mobile library search stays fixed, not sticky",
  );
  assert.doesNotMatch(chrome, /body\.style\.overflow|:has\(/);
  assert.doesNotMatch(layout, /overflow:\s*hidden|body\.style/);

  assert.match(
    bottomNav,
    /createPortal\(nav, document\.body\)/,
    "BottomNav still portals to document.body",
  );
  assert.match(
    css,
    /\.bottom-nav \{\s*position:\s*fixed;/,
    "BottomNav stays position:fixed",
  );
}

function testSourceBoundaries() {
  const card = read("src/components/my-practices/LibraryCard.tsx");
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  const play = read("src/components/products/CatalogProductPlayButton.tsx");
  const collection = read("src/lib/library/collection.ts");
  const catalogPlay = read("src/lib/catalog/fetch-catalog-play-session.ts");
  const catalogGrid = read("src/components/products/CatalogProductGrid.tsx");
  const shell = read("src/components/catalog/cards/CatalogCardShell.tsx");

  assert.match(card, /relative flex gap-4/);
  assert.match(card, /aspect-square w-\[116px\]/);
  assert.match(card, /CatalogProductHeartButton/);
  assert.match(card, /BuyPracticeButton/);
  assert.doesNotMatch(card, /CatalogProductGridCard/);
  assert.doesNotMatch(card, /Избранн|Favorites/);
  assert.doesNotMatch(library, /Избранн|Favorites/);
  assert.match(library, /CatalogProductGridCard|LibraryCatalogTile/);
  assert.match(library, /PlaylistCard/);
  assert.match(library, /LibraryOwnedCard/);

  assert.match(play, /entrySurface: "catalog"/);
  assert.doesNotMatch(play, /entrySurface: "library"/);
  assert.doesNotMatch(play, /LibraryCard|my-practices/);

  assert.doesNotMatch(collection, /Сохранено|Доступно|Сохранённые/);
  assert.doesNotMatch(catalogPlay, /my-practices|LibraryCard/);
  assert.doesNotMatch(catalogGrid, /playback=/);
  assert.match(shell, /playback = "default"/);
}

testCollectionFilters();
testBadges();
testUnifiedLoaderAndGrid();
testLockedPaidHasNoFullListen();
testFilterRules();
testSearchMatch();
testSortOrder();
testFallbackCover();
testEmptySaved();
testLibrarySearchScrollRoot();
testSourceBoundaries();

console.log("library-audioteka-ui-unit: ok");
