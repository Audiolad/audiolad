import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  mergeLibraryCollection,
  type LibraryCollectionItem,
  type LibraryCollectionPractice,
} from "../src/lib/library/collection";
import {
  assembleUnifiedLibrary,
  deriveCatalogDefaultOffer,
  mapCatalogLibraryEntry,
  mapPersonalLibraryEntry,
  mapPlaylistLibraryEntry,
  mapPrivateAudioLibraryEntry,
  unifiedEntryToLibraryFilterItem,
  UNIFIED_LIBRARY_PLAYLIST_LABEL,
  UNIFIED_LIBRARY_PRIVATE_AUDIO_LABEL,
  type UnifiedLibraryEntry,
} from "../src/lib/library/unified-entry";
import type { MyPersonalMaterialListItemDto } from "../src/lib/personal-materials/client-library/types";
import type { PrivateAudioListItemDto } from "../src/lib/private-audio/types";
import { isProductFree } from "../src/lib/products/price-format";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PRACTICE_PAID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRACTICE_FREE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRACTICE_PURCHASED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAYLIST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PRIVATE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSONAL_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SECRET_AUDIO = "https://cdn.example/full-audio.mp3";

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
    audioUrl: SECRET_AUDIO,
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

function freeSavedItem(): LibraryCollectionItem {
  return catalogItem({
    entitlements: [
      {
        id: "up-free",
        practiceId: PRACTICE_FREE,
        accessSource: "free_claim",
        grantedAt: "2026-08-15T00:00:00.000Z",
        expiresAt: null,
      },
    ],
    saves: [{ practiceId: PRACTICE_FREE, createdAt: "2026-08-19T00:00:00.000Z" }],
    practices: new Map([
      [
        PRACTICE_FREE,
        practice(PRACTICE_FREE, {
          isFree: true,
          price: 0,
          audioUrl: SECRET_AUDIO,
        }),
      ],
    ]),
  });
}

function playlistSource() {
  return {
    id: PLAYLIST_ID,
    slug: "morning-mix",
    href: "/p/morning-mix",
    title: "Утренний микс",
    coverUrl: "https://cdn.example/playlist.jpg",
    creator: "Редакция АудиоЛада",
    durationSeconds: 1800,
    savedAt: "2026-08-22T12:00:00.000Z",
  };
}

function privateAudioItem(
  overrides: Partial<PrivateAudioListItemDto> = {},
): PrivateAudioListItemDto {
  return {
    id: PRIVATE_ID,
    sourceType: "upload",
    title: "Мой голос",
    authorText: "Я",
    durationSeconds: 95,
    audioSizeBytes: 1024,
    hasCover: false,
    coverUrl: null,
    progress: {
      positionSeconds: 0,
      durationSeconds: 95,
      completed: false,
      updatedAt: null,
    },
    createdAt: "2026-08-21T08:00:00.000Z",
    updatedAt: "2026-08-21T08:00:00.000Z",
    ...overrides,
  };
}

function personalItem(
  overrides: Partial<MyPersonalMaterialListItemDto> = {},
): MyPersonalMaterialListItemDto {
  return {
    id: PERSONAL_ID,
    materialType: "diagnostic",
    title: "Разбор сна",
    author: {
      id: "author-1",
      name: "Мария",
      slug: "maria",
      avatarUrl: null,
    },
    diagnosticDate: "2026-08-10",
    claimedAt: "2026-08-17T00:00:00.000Z",
    progress: {
      positionSeconds: 0,
      durationSeconds: 600,
      completed: false,
      updatedAt: null,
    },
    availability: "available",
    hasAudio: true,
    hasPdf: false,
    pdfOriginalFilename: null,
    ...overrides,
  };
}

function testSavedPaidNotPurchased() {
  const source = paidWishListItem();
  assert.equal(source.isSaved, true);
  assert.equal(source.canListen, false);
  assert.equal(source.accessSource, null);
  assert.equal(source.practice?.price, 990);
  assert.equal(source.practice?.audioUrl, null);

  const entry = mapCatalogLibraryEntry(source);

  assert.equal(entry.kind, "catalog");
  assert.equal(entry.id, `catalog:${PRACTICE_PAID}`);
  assert.equal(entry.practiceId, PRACTICE_PAID);
  assert.equal(entry.isSaved, true);
  assert.equal(entry.canListen, false);
  assert.notEqual(entry.canListen, entry.isSaved);
  assert.equal(entry.accessSource, null);
  assert.equal(entry.price, 990);
  assert.equal(entry.practice?.price, 990);
  assert.equal(entry.practice?.audioUrl, null);
  assert.equal(entry.defaultOffer?.access, "paid");
  if (entry.defaultOffer?.access === "paid") {
    assert.equal(entry.defaultOffer.price.amount_minor, 99000);
  }
  assert.equal(entry.href, `/practice/author/practice-${PRACTICE_PAID.slice(0, 8)}`);
  assert.equal(entry.duration?.unit, "minutes");
}

function testPurchased() {
  const entry = mapCatalogLibraryEntry(purchasedItem());

  assert.equal(entry.kind, "catalog");
  assert.equal(entry.canListen, true);
  assert.equal(entry.accessSource, "purchase");
  assert.equal(entry.isSaved, false);
  assert.equal(entry.practice?.audioUrl, SECRET_AUDIO);
}

function testFreeSaved() {
  const source = freeSavedItem();
  const entry = mapCatalogLibraryEntry(source);

  assert.equal(entry.kind, "catalog");
  assert.equal(entry.isSaved, true);
  assert.equal(entry.canListen, source.canListen);
  assert.equal(isProductFree(entry.isFree, entry.price), true);
  assert.equal(entry.defaultOffer?.access, "free");
  assert.notEqual(entry.defaultOffer?.access, "paid");
}

function testPlaylistSaved() {
  const entry = mapPlaylistLibraryEntry(playlistSource());

  assert.equal(entry.kind, "playlist");
  assert.equal(entry.id, `playlist:${PLAYLIST_ID}`);
  assert.equal(entry.playlistId, PLAYLIST_ID);
  assert.equal(entry.isSaved, true);
  assert.equal(entry.canListen, true);
  assert.equal(entry.displayLabel, UNIFIED_LIBRARY_PLAYLIST_LABEL);
  assert.equal(entry.href, "/p/morning-mix");
  assert.equal(entry.duration?.unit, "seconds");
  assert.equal("price" in entry, false);
  assert.equal("defaultOffer" in entry, false);
  assert.equal("accessSource" in entry, false);
}

function testPrivateAudio() {
  const entry = mapPrivateAudioLibraryEntry(privateAudioItem());

  assert.equal(entry.kind, "private_audio");
  assert.equal(entry.id, `private:${PRIVATE_ID}`);
  assert.equal(entry.privateAudioId, PRIVATE_ID);
  assert.equal(entry.canListen, true);
  assert.equal(entry.isSaved, false);
  assert.equal(entry.displayLabel, UNIFIED_LIBRARY_PRIVATE_AUDIO_LABEL);
  assert.equal(entry.href, `/my-library/private-audio/${PRIVATE_ID}`);
  assert.equal(entry.cover.url, null);
  assert.equal("price" in entry, false);
}

function testPersonalMaterial() {
  const entry = mapPersonalLibraryEntry(personalItem());

  assert.equal(entry.kind, "personal");
  assert.equal(entry.id, `personal:${PERSONAL_ID}`);
  assert.equal(entry.personalMaterialId, PERSONAL_ID);
  assert.equal(entry.isSaved, false);
  assert.equal(entry.canListen, true);
  assert.equal(entry.href, `/my-materials/${PERSONAL_ID}`);
  assert.equal(entry.displayLabel, "Диагностика");
  assert.equal(entry.cover.url, null);
  assert.equal("price" in entry, false);
  assert.equal("defaultOffer" in entry, false);
  assert.equal("practiceId" in entry, false);
}

function testMergeIncludesAllFourKinds() {
  const { entries, error } = assembleUnifiedLibrary({
    catalogItems: [paidWishListItem(), purchasedItem(), freeSavedItem()],
    playlistItems: [playlistSource()],
    privateAudioItems: [privateAudioItem()],
    personalItems: [personalItem()],
  });

  assert.equal(error, false);
  assert.deepEqual(
    [...new Set(entries.map((entry) => entry.kind))].sort(),
    ["catalog", "personal", "playlist", "private_audio"],
  );
  assert.equal(entries.some((entry) => entry.kind === "catalog"), true);
  assert.equal(entries.some((entry) => entry.kind === "playlist"), true);
  assert.equal(entries.some((entry) => entry.kind === "private_audio"), true);
  assert.equal(entries.some((entry) => entry.kind === "personal"), true);

  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);

  const newest = entries[0];
  assert.equal(newest?.kind, "playlist");
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [...entries].sort((left, right) => {
      if (left.sortAt !== right.sortAt) {
        return right.sortAt - left.sortAt;
      }
      return left.id.localeCompare(right.id);
    }).map((entry) => entry.id),
  );
}

function testSaveNeverSetsCanListen() {
  const saveOnly = mapCatalogLibraryEntry(paidWishListItem());
  assert.equal(saveOnly.isSaved, true);
  assert.equal(saveOnly.canListen, false);

  const purchased = mapCatalogLibraryEntry(purchasedItem());
  assert.equal(purchased.isSaved, false);
  assert.equal(purchased.canListen, true);

  const playlist = mapPlaylistLibraryEntry(playlistSource());
  assert.equal(playlist.isSaved, true);
  assert.equal(playlist.canListen, true);

  const privateAudio = mapPrivateAudioLibraryEntry(privateAudioItem());
  assert.equal(privateAudio.isSaved, false);
  assert.equal(privateAudio.canListen, true);
}

function testSourceFailureKeepsOthers() {
  const result = assembleUnifiedLibrary({
    catalogItems: [purchasedItem()],
    catalogError: false,
    playlistItems: [],
    playlistError: true,
    privateAudioItems: [privateAudioItem()],
    privateAudioError: false,
    personalItems: [personalItem()],
    personalError: false,
  });

  assert.equal(result.error, true);
  assert.equal(result.entries.some((entry) => entry.kind === "catalog"), true);
  assert.equal(result.entries.some((entry) => entry.kind === "private_audio"), true);
  assert.equal(result.entries.some((entry) => entry.kind === "personal"), true);
  assert.equal(result.entries.some((entry) => entry.kind === "playlist"), false);
}

function testFilterAdapterDoesNotChangeCatalogMeaning() {
  const paidSave = unifiedEntryToLibraryFilterItem(
    mapCatalogLibraryEntry(paidWishListItem()),
  );
  assert.equal(paidSave.isSaved, true);
  assert.equal(paidSave.canListen, false);
  assert.equal(paidSave.accessSource, null);
  assert.equal(paidSave.practice?.price, 990);

  const playlist = unifiedEntryToLibraryFilterItem(
    mapPlaylistLibraryEntry(playlistSource()),
  );
  assert.equal(playlist.accessSource, null);
  assert.equal(playlist.practice, null);
  assert.equal(playlist.isSaved, true);
}

function testDeriveOffer() {
  const paid = deriveCatalogDefaultOffer({ isFree: false, price: 990 });
  assert.equal(paid?.access, "paid");

  const free = deriveCatalogDefaultOffer({ isFree: true, price: 0 });
  assert.equal(free?.access, "free");
}

function testSourceBoundaries() {
  const unified = read("src/lib/library/unified.ts");
  const contract = read("src/lib/library/unified-entry.ts");
  const collection = read("src/lib/library/collection.ts");
  const page = read(
    "src/app/(platform)/(listener)/(library)/my-practices/page.tsx",
  );
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  const card = read("src/components/my-practices/LibraryCard.tsx");
  const privateCard = read("src/components/private-audio/PrivateAudioCard.tsx");
  const filters = read("src/lib/library/filters.ts");

  assert.match(unified, /loadLibraryCollection/);
  assert.match(unified, /listSavedPlaylists/);
  assert.match(unified, /listPrivateAudioItems/);
  assert.match(unified, /listMyPersonalMaterials/);
  assert.match(unified, /assembleUnifiedLibrary/);
  assert.match(unified, /if \(!userId\)/);
  assert.doesNotMatch(unified, /from\("orders"\)|from\("cart"\)/);
  assert.doesNotMatch(unified, /CREATE TABLE|ALTER TABLE|user_practices/);

  assert.match(contract, /canListen: item.canListen/);
  assert.doesNotMatch(contract, /canListen:\s*item\.isSaved/);
  assert.doesNotMatch(contract, /canListen\s*=\s*isSaved/);
  assert.doesNotMatch(contract, /viewer\.granted|granted:\s*true/);
  assert.doesNotMatch(contract, /from\("orders"\)|createCheckout|fulfillTochka/);

  assert.match(collection, /export function mergeLibraryCollection/);
  assert.match(collection, /canListen: Boolean\(active\)/);
  assert.doesNotMatch(collection, /unified-entry|loadUnifiedLibrary/);

  assert.match(page, /loadLibraryCollection\(supabase, user.id\)/);
  assert.doesNotMatch(page, /loadUnifiedLibrary/);
  assert.doesNotMatch(library, /loadUnifiedLibrary|unified-entry/);
  assert.doesNotMatch(card, /loadUnifiedLibrary|unified-entry/);
  assert.doesNotMatch(privateCard, /loadUnifiedLibrary|unified-entry/);
  assert.doesNotMatch(filters, /loadUnifiedLibrary|unified-entry/);
}

function assertNoCatalogPrice(entry: UnifiedLibraryEntry) {
  if (entry.kind === "catalog") {
    throw new Error("expected non-catalog entry");
  }
}

testSavedPaidNotPurchased();
testPurchased();
testFreeSaved();
testPlaylistSaved();
testPrivateAudio();
testPersonalMaterial();
testMergeIncludesAllFourKinds();
testSaveNeverSetsCanListen();
testSourceFailureKeepsOthers();
testFilterAdapterDoesNotChangeCatalogMeaning();
testDeriveOffer();
testSourceBoundaries();
assertNoCatalogPrice(mapPlaylistLibraryEntry(playlistSource()));

console.log("library-unified-entry-unit: ok");
