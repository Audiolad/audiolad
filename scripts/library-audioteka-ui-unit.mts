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
} from "../src/lib/library/filters";
import { unifiedCatalogEntryToCatalogCard } from "../src/lib/library/unified-catalog-card";
import {
  mapCatalogLibraryEntry,
  mapPersonalLibraryEntry,
  mapPlaylistLibraryEntry,
  mapPrivateAudioLibraryEntry,
} from "../src/lib/library/unified-entry";
import { matchesUnifiedLibraryFilter } from "../src/lib/library/unified-filter";
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

function testChips() {
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");

  assert.match(library, /id: "all", label: "Все"/);
  assert.match(library, /id: "saved", label: "Сохранённые"/);
  assert.match(library, /id: "gifts", label: "Подарки"/);
  assert.match(library, /id: "purchased", label: "Купленные"/);
  assert.match(library, /id: "uploads", label: "Мои записи"/);
  assert.doesNotMatch(library, /id: "downloaded"/);
  assert.doesNotMatch(library, /Скачанные/);
  assert.match(library, /params.set\("filter", filter\)/);
  assert.match(library, /-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-2/);
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
  assert.equal(matchesUnifiedLibraryFilter(playlist, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "gifts"), false);
  assert.equal(matchesUnifiedLibraryFilter(playlist, "uploads"), false);

  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "all"), true);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "uploads"), true);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "gifts"), false);
  assert.equal(matchesUnifiedLibraryFilter(privateAudio, "saved"), false);

  assert.equal(matchesUnifiedLibraryFilter(personal, "all"), true);
  assert.equal(matchesUnifiedLibraryFilter(personal, "uploads"), false);
  assert.equal(matchesUnifiedLibraryFilter(personal, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(personal, "gifts"), false);
  assert.equal(matchesUnifiedLibraryFilter(personal, "saved"), false);

  assert.equal(matchesUnifiedLibraryFilter(paidSave, "saved"), true);
  assert.equal(matchesUnifiedLibraryFilter(paidSave, "purchased"), false);
  assert.equal(matchesUnifiedLibraryFilter(purchased, "purchased"), true);
  assert.equal(matchesUnifiedLibraryFilter(purchased, "uploads"), false);
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

  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  assert.match(library, /getLibraryFilterEmptyMessage\(filter\)/);
  assert.match(library, /getLibraryFilterEmptyCta\(filter\)/);
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

testChips();
testBadges();
testUnifiedLoaderAndGrid();
testLockedPaidHasNoFullListen();
testFilterRules();
testFallbackCover();
testEmptySaved();
testSourceBoundaries();

console.log("library-audioteka-ui-unit: ok");
