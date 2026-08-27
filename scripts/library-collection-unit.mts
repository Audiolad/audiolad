import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIBRARY_COLLECTION_TABLES,
  loadLibraryCollection,
  mergeLibraryCollection,
  resolveLibraryCollectionAccess,
  type LibraryCollectionPractice,
} from "../src/lib/library/collection";
import {
  isLibraryFilterId,
  matchesLibraryFilter,
} from "../src/lib/library/filters";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PRACTICE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRACTICE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRACTICE_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "11111111-1111-4111-8111-111111111111";
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
    format: "meditation",
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

function merge(input: Parameters<typeof mergeLibraryCollection>[0]) {
  return mergeLibraryCollection(input);
}

function testSaveOnlyDoesNotGrantListen() {
  const items = merge({
    entitlements: [],
    saves: [{ practiceId: PRACTICE_A, createdAt: "2026-08-20T10:00:00.000Z" }],
    practices: new Map([[PRACTICE_A, practice(PRACTICE_A)]]),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.practiceId, PRACTICE_A);
  assert.equal(items[0]?.isSaved, true);
  assert.equal(items[0]?.canListen, false);
  assert.equal(items[0]?.accessSource, null);
  assert.equal(items[0]?.practice?.audioUrl, null);
}

function testSavePlusPurchaseKeepsListen() {
  const items = merge({
    entitlements: [
      {
        id: "up-1",
        practiceId: PRACTICE_A,
        accessSource: "purchase",
        grantedAt: "2026-08-10T00:00:00.000Z",
        expiresAt: null,
      },
    ],
    saves: [{ practiceId: PRACTICE_A, createdAt: "2026-08-20T10:00:00.000Z" }],
    practices: new Map([[PRACTICE_A, practice(PRACTICE_A)]]),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.isSaved, true);
  assert.equal(items[0]?.canListen, true);
  assert.equal(items[0]?.accessSource, "purchase");
  assert.equal(items[0]?.practice?.audioUrl, SECRET_AUDIO);
}

function testExpiredEntitlementPlusSaveDoesNotListen() {
  const items = merge({
    entitlements: [
      {
        id: "up-expired",
        practiceId: PRACTICE_A,
        accessSource: "subscription",
        grantedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
      },
    ],
    saves: [{ practiceId: PRACTICE_A, createdAt: "2026-08-20T10:00:00.000Z" }],
    practices: new Map([[PRACTICE_A, practice(PRACTICE_A)]]),
    now: new Date("2026-08-24T00:00:00.000Z"),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.isSaved, true);
  assert.equal(items[0]?.canListen, false);
  assert.equal(items[0]?.accessSource, null);
  assert.equal(items[0]?.practice?.audioUrl, null);
}

function testPurchaseOnlyAndExpiredWithoutSave() {
  const items = merge({
    entitlements: [
      {
        id: "up-buy",
        practiceId: PRACTICE_A,
        accessSource: "purchase",
        grantedAt: "2026-08-10T00:00:00.000Z",
        expiresAt: null,
      },
      {
        id: "up-old",
        practiceId: PRACTICE_B,
        accessSource: "subscription",
        grantedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-02-01T00:00:00.000Z",
      },
    ],
    saves: [],
    practices: new Map([
      [PRACTICE_A, practice(PRACTICE_A)],
      [PRACTICE_B, practice(PRACTICE_B)],
    ]),
    now: new Date("2026-08-24T00:00:00.000Z"),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.practiceId, PRACTICE_A);
  assert.equal(items[0]?.isSaved, false);
  assert.equal(items[0]?.canListen, true);
  assert.equal(items[0]?.accessSource, "purchase");
}

function testMergeDedupesByPracticeId() {
  const items = merge({
    entitlements: [
      {
        id: "up-1",
        practiceId: PRACTICE_A,
        accessSource: "purchase",
        grantedAt: "2026-08-10T00:00:00.000Z",
        expiresAt: null,
      },
    ],
    saves: [{ practiceId: PRACTICE_A, createdAt: "2026-08-22T00:00:00.000Z" }],
    practices: new Map([[PRACTICE_A, practice(PRACTICE_A)]]),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "up-1");
}

function testSortUsesMaxSaveOrGrantedAt() {
  const items = merge({
    entitlements: [
      {
        id: "up-old",
        practiceId: PRACTICE_A,
        accessSource: "purchase",
        grantedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: null,
      },
      {
        id: "up-new",
        practiceId: PRACTICE_B,
        accessSource: "gift",
        grantedAt: "2026-08-21T00:00:00.000Z",
        expiresAt: null,
      },
    ],
    saves: [
      { practiceId: PRACTICE_C, createdAt: "2026-08-23T00:00:00.000Z" },
      { practiceId: PRACTICE_A, createdAt: "2026-08-22T00:00:00.000Z" },
    ],
    practices: new Map([
      [PRACTICE_A, practice(PRACTICE_A)],
      [PRACTICE_B, practice(PRACTICE_B)],
      [PRACTICE_C, practice(PRACTICE_C)],
    ]),
  });

  assert.deepEqual(
    items.map((item) => item.practiceId),
    [PRACTICE_C, PRACTICE_A, PRACTICE_B],
  );
}

function testSavedFilterUsesIsSavedOnly() {
  assert.equal(isLibraryFilterId("saved"), true);

  const savedOnly = {
    accessSource: null,
    isSaved: true,
    canListen: false,
    practice: { isFree: false, price: 990 },
  };
  const purchasedOnly = {
    accessSource: "purchase",
    isSaved: false,
    canListen: true,
    practice: { isFree: false, price: 990 },
  };

  assert.equal(matchesLibraryFilter(savedOnly, "saved"), true);
  assert.equal(matchesLibraryFilter(purchasedOnly, "saved"), false);
  assert.equal(matchesLibraryFilter(savedOnly, "purchased"), false);
  assert.equal(matchesLibraryFilter(savedOnly, "gifts"), false);
}

function testCanListenNeverEqualsIsSaved() {
  const saveOnly = resolveLibraryCollectionAccess({
    entitlement: null,
    isSaved: true,
  });
  assert.equal(saveOnly.isSaved, true);
  assert.equal(saveOnly.canListen, false);
  assert.notEqual(saveOnly.canListen, saveOnly.isSaved);

  const purchased = resolveLibraryCollectionAccess({
    entitlement: { accessSource: "purchase", expiresAt: null },
    isSaved: false,
  });
  assert.equal(purchased.isSaved, false);
  assert.equal(purchased.canListen, true);
}

type QueryCall = {
  table: string;
  select?: string;
  eq?: { column: string; value: unknown };
  in?: { column: string; values: unknown };
};

function createCollectionSupabase(input: {
  entitlements?: unknown[];
  saves?: Array<{
    user_id: string;
    practice_id: string;
    created_at: string;
  }>;
  savedPractices?: unknown[];
}) {
  const calls: QueryCall[] = [];

  const supabase = {
    from(table: string) {
      let select: string | undefined;
      const builder = {
        select(columns: string) {
          select = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          calls.push({ table, select, eq: { column, value } });
          if (table === LIBRARY_COLLECTION_TABLES.saves) {
            return Promise.resolve({
              data: (input.saves ?? []).filter((row) =>
                column === "user_id" ? row.user_id === value : true,
              ),
              error: null,
            });
          }

          return {
            order() {
              return Promise.resolve({
                data: input.entitlements ?? [],
                error: null,
              });
            },
          };
        },
        in(column: string, values: unknown) {
          calls.push({ table, select, in: { column, values } });
          return Promise.resolve({
            data: input.savedPractices ?? [],
            error: null,
          });
        },
      };

      return builder;
    },
  };

  return { supabase, calls };
}

async function testLoaderSaveOnlyDoesNotExposeAudioUrl() {
  const { supabase, calls } = createCollectionSupabase({
    entitlements: [],
    saves: [
      {
        user_id: USER,
        practice_id: PRACTICE_A,
        created_at: "2026-08-20T10:00:00.000Z",
      },
    ],
    savedPractices: [
      {
        id: PRACTICE_A,
        title: "Saved paid",
        slug: "saved-paid",
        format: "meditation",
        duration_minutes: 10,
        price: 990,
        is_free: false,
        cover_url: null,
        cover_image: null,
        updated_at: "2026-08-01T00:00:00.000Z",
        audio_url: SECRET_AUDIO,
        authors: { name: "Автор", slug: "author" },
      },
    ],
  });

  const result = await loadLibraryCollection(supabase as never, USER);

  assert.equal(result.error, false);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.isSaved, true);
  assert.equal(result.items[0]?.canListen, false);
  assert.equal(result.items[0]?.practice?.audioUrl, null);

  const savedPracticeSelect = calls.find(
    (call) => call.table === "practices",
  )?.select;
  assert.ok(savedPracticeSelect, "save-only practices are loaded for card data");
  assert.doesNotMatch(
    savedPracticeSelect ?? "",
    /audio_url/,
    "save-only practice select does not request audio_url",
  );
}

function testSourceBoundaries() {
  const collection = read("src/lib/library/collection.ts");
  const page = read(
    "src/app/(platform)/(listener)/(library)/my-practices/page.tsx",
  );
  const card = read("src/components/my-practices/LibraryCard.tsx");
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  const play = read("src/components/products/CatalogProductPlayButton.tsx");
  const player = read("src/components/audio/GlobalAudioPlayerProvider.tsx");

  assert.match(collection, /export async function loadLibraryCollection/);
  assert.match(collection, /canListen: Boolean\(active\)/);
  assert.doesNotMatch(collection, /canListen\s*=\s*isSaved/);
  assert.doesNotMatch(collection, /access_source\s*[:=]\s*["']saved["']/);
  assert.doesNotMatch(collection, /favorites/i);
  assert.doesNotMatch(collection, /claim_free_practice/);
  assert.doesNotMatch(collection, /createCheckout|fulfillTochka|from\("orders"\)/);

  assert.match(page, /loadUnifiedLibrary\(supabase, user.id\)/);
  assert.doesNotMatch(page, /loadLibraryCollection\(/);
  assert.doesNotMatch(page, /function mapLibraryItems/);
  assert.match(page, /purchasedSlug/);
  assert.doesNotMatch(page, /listPrivateAudioItems/);

  assert.match(card, /practiceId: string/);
  assert.match(card, /isSaved: boolean/);
  assert.match(card, /canListen: boolean/);
  assert.match(card, /accessSource: string \| null/);
  assert.match(
    card,
    /absolute bottom-3 right-3 z-\[2\] flex items-center gap-1/,
    "Play cluster stays bottom-right",
  );
  assert.doesNotMatch(card, /Избранн/);

  assert.match(library, /parseLibraryFilter/);
  assert.match(library, /applyUnifiedLibraryView/);

  assert.doesNotMatch(play, /library\/collection|loadLibraryCollection/);
  assert.doesNotMatch(player, /library\/collection|loadLibraryCollection/);
}

testSaveOnlyDoesNotGrantListen();
testSavePlusPurchaseKeepsListen();
testExpiredEntitlementPlusSaveDoesNotListen();
testPurchaseOnlyAndExpiredWithoutSave();
testMergeDedupesByPracticeId();
testSortUsesMaxSaveOrGrantedAt();
testSavedFilterUsesIsSavedOnly();
testCanListenNeverEqualsIsSaved();
await testLoaderSaveOnlyDoesNotExposeAudioUrl();
testSourceBoundaries();

console.log("library-collection-unit: ok");
