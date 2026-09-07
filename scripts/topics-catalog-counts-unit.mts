#!/usr/bin/env npx tsx
/**
 * Catalog topic-count query chunking + /catalog soft-fail (no DB).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mapCatalogProductToListingItem,
  type CatalogListingCandidate,
} from "../src/lib/catalog/listing";
import {
  PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE,
  chunkIds,
  listTopicsWithCatalogCounts,
  listTopicsWithCatalogCountsSafe,
} from "../src/lib/topics/queries";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

function practiceId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function topicRow(overrides: {
  id: string;
  key: string;
  title: string;
  sort_order: number;
  show_on_home?: boolean;
}) {
  return {
    id: overrides.id,
    key: overrides.key,
    slug: overrides.key,
    title: overrides.title,
    description: null,
    sort_order: overrides.sort_order,
    is_active: true,
    show_on_home: overrides.show_on_home ?? true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const ACTIVE_TOPICS = [
  topicRow({ id: "topic-money", key: "money", title: "Деньги", sort_order: 10 }),
  topicRow({ id: "topic-calm", key: "calm", title: "Спокойствие", sort_order: 30 }),
  topicRow({ id: "topic-sleep", key: "sleep", title: "Сон", sort_order: 35 }),
];

type AssignmentRow = {
  practice_id: string;
  topic_id: string;
  topics: { key: string };
};

function practiceIndexFromId(id: string) {
  return Number.parseInt(id.slice(-12), 10);
}

function assignmentsForPracticeIds(practiceIds: string[]): AssignmentRow[] {
  return practiceIds.flatMap((id) => {
    const index = practiceIndexFromId(id);

    if (index < 50) {
      return [
        { practice_id: id, topic_id: "topic-money", topics: { key: "money" } },
      ];
    }

    if (index < 100) {
      return [
        { practice_id: id, topic_id: "topic-calm", topics: { key: "calm" } },
      ];
    }

    if (index === 100) {
      return [
        { practice_id: id, topic_id: "topic-money", topics: { key: "money" } },
      ];
    }

    return [
      { practice_id: id, topic_id: "topic-sleep", topics: { key: "sleep" } },
    ];
  });
}

type QueryResult = { data: unknown; error: unknown };

function createThenBuilder(result: () => QueryResult) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    in() {
      return builder;
    },
    then(
      onFulfilled?: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result()).then(onFulfilled, onRejected);
    },
  };

  return builder;
}

function createCatalogCountsSupabase(options: {
  practiceCount: number;
  failAssignmentChunkIndex?: number;
  assignmentError?: Record<string, unknown>;
}) {
  const practiceIds = Array.from({ length: options.practiceCount }, (_, index) =>
    practiceId(index),
  );
  const inChunks: string[][] = [];
  const assignmentError = options.assignmentError ?? {
    code: "57014",
    message: "canceling statement due to statement timeout",
    details: "practice_topics in-filter too large",
    hint: "split the in() list",
    status: 502,
  };

  const supabase = {
    from(table: string) {
      if (table === "topics") {
        return createThenBuilder(() => ({ data: ACTIVE_TOPICS, error: null }));
      }

      if (table === "practices") {
        return createThenBuilder(() => ({
          data: practiceIds.map((id) => ({ id, cover_image: null })),
          error: null,
        }));
      }

      if (table === "practice_topics") {
        const builder = {
          select() {
            return builder;
          },
          in(_column: string, values: string[]) {
            const chunkIndex = inChunks.length;
            inChunks.push([...values]);

            if (chunkIndex === options.failAssignmentChunkIndex) {
              return createThenBuilder(() => ({
                data: null,
                error: assignmentError,
              }));
            }

            return createThenBuilder(() => ({
              data: assignmentsForPracticeIds(values),
              error: null,
            }));
          },
        };

        return builder;
      }

      throw new Error(`unexpected table ${table}`);
    },
    getInChunks() {
      return inChunks;
    },
  };

  return supabase as unknown as SupabaseClient & {
    getInChunks: () => string[][];
  };
}

assert.equal(
  PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE,
  50,
  "catalog count chunk size is 50",
);

const chunked = chunkIds(
  Array.from({ length: 105 }, (_, index) => practiceId(index)),
);
assert.equal(chunked.length, 3, "105 ids → 3 chunks");
assert.deepEqual(
  chunked.map((chunk) => chunk.length),
  [50, 50, 5],
  "chunks are 50/50/5",
);
assert.ok(
  chunked.every((chunk) => chunk.length <= 50),
  "no chunk exceeds 50",
);
assert.equal(chunkIds(Array.from({ length: 50 }, (_, i) => i)).length, 1);
assert.equal(chunkIds(Array.from({ length: 51 }, (_, i) => i)).length, 2);

const supabase105 = createCatalogCountsSupabase({ practiceCount: 105 });
const counts = await listTopicsWithCatalogCounts(supabase105);
const inChunks = supabase105.getInChunks();

assert.equal(inChunks.length, 3, "100+ practice IDs split practice_topics queries");
assert.ok(
  inChunks.every((chunk) => chunk.length <= 50),
  "each practice_topics .in() is ≤50",
);
assert.deepEqual(
  inChunks.map((chunk) => chunk.length),
  [50, 50, 5],
  "105 listed practices → 50 + 50 + 5",
);
assert.equal(
  counts.find((topic) => topic.key === "money")?.catalogProductCount,
  51,
  "money counts merge across chunk 1 and chunk 3",
);
assert.equal(
  counts.find((topic) => topic.key === "calm")?.catalogProductCount,
  50,
  "calm counts stay on chunk 2",
);
assert.equal(
  counts.find((topic) => topic.key === "sleep")?.catalogProductCount,
  4,
  "sleep counts stay on the remainder chunk",
);

const logs: unknown[][] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => {
  logs.push(args);
};

const failingSupabase = createCatalogCountsSupabase({
  practiceCount: 105,
  failAssignmentChunkIndex: 1,
});

await assert.rejects(
  () => listTopicsWithCatalogCounts(failingSupabase),
  (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "topics_catalog_counts_failed");
    const cause = error.cause as Record<string, unknown>;
    assert.equal(cause.code, "57014");
    assert.equal(cause.status, 502);
    return true;
  },
  "hard-fail preserves wrapped topics_catalog_counts_failed",
);

assert.ok(
  logs.some((entry) => {
    const payload = entry[1] as Record<string, unknown> | undefined;
    return (
      entry[0] === "[topics] topics_catalog_counts_failed" &&
      payload?.code === "57014" &&
      payload.message === "canceling statement due to statement timeout" &&
      payload.details === "practice_topics in-filter too large" &&
      payload.hint === "split the in() list" &&
      payload.status === 502 &&
      payload.chunkIndex === 1
    );
  }),
  "original PostgREST error object is logged before wrap",
);

const listingItems = [{ publication_id: "listed-ok" }];

await assert.rejects(
  () =>
    Promise.all([
      listTopicsWithCatalogCounts(
        createCatalogCountsSupabase({
          practiceCount: 105,
          failAssignmentChunkIndex: 1,
        }),
      ),
      Promise.resolve({ items: listingItems }),
    ]),
  /topics_catalog_counts_failed/,
  "bare Promise.all of the throwing query still rejects",
);

const [softTopics, listing] = await Promise.all([
  listTopicsWithCatalogCountsSafe(
    createCatalogCountsSupabase({
      practiceCount: 105,
      failAssignmentChunkIndex: 1,
    }),
  ),
  Promise.resolve({ items: listingItems }),
]);

console.error = originalError;

assert.deepEqual(softTopics, [], "failed topic counts fall back to empty chips");
assert.equal(listing.items.length, 1, "listing still resolves when topics fail");
assert.equal(
  listing.items[0]?.publication_id,
  "listed-ok",
  "catalog products stay available after topic-count soft-fail",
);

function listingProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    authorId: "a1",
    title: "Практика",
    slug: "practice",
    subtitle: null,
    description: null,
    format: "Аудиопрактика",
    productKind: "practice",
    price: 900,
    isFree: false,
    coverUrl: "/cover.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/practice",
    meta: null,
    statsLabel: "12 мин",
    productTypeLabel: "Аудиопрактика",
    priceLabel: "900 ₽",
    sortTimestamp: 1_700_000_000_000,
    audioCount: 1,
    durationSeconds: 720,
    publishedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function mapListingOrSkip(product: ReturnType<typeof listingProduct>) {
  try {
    return [mapCatalogProductToListingItem(product as never)];
  } catch {
    return [];
  }
}

const validItem = listingProduct();
const malformedMissingAuthor = listingProduct({
  id: "edge-olga-like",
  authorName: "",
  authorSlug: "",
  title: "Медитация Благодарности",
});
const mappedListing = [validItem, malformedMissingAuthor].flatMap(mapListingOrSkip);

assert.equal(mappedListing.length, 1, "malformed product is skipped");
assert.equal(
  (mappedListing[0] as CatalogListingCandidate).publication_id,
  "p1",
  "valid neighbors still map",
);
assert.throws(
  () => mapCatalogProductToListingItem(malformedMissingAuthor as never),
  /catalog_card_adapt_failed/,
  "edge product still fails in isolation",
);

const catalogPage = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
);
const catalogFilters = read(
  "src/components/catalog/CatalogMobileFiltersSlot.tsx",
);
const listingSource = read("src/lib/catalog/listing.ts");
const homeTopics = read("src/lib/home/topic-navigation.ts");

assert.match(
  catalogPage,
  /listTopicsWithCatalogCountsSafe\(supabase\)/,
  "catalog page uses the soft-fail topics loader inside Promise.all",
);
assert.doesNotMatch(
  catalogPage,
  /listTopicsWithCatalogCounts\(supabase\)/,
  "catalog page does not call the throwing counts query directly",
);
assert.match(
  catalogFilters,
  /listTopicsWithCatalogCountsSafe/,
  "mobile filters use the same soft-fail loader",
);
assert.match(
  listingSource,
  /products\.flatMap\(\(product\) => \{\s*try \{\s*return \[mapCatalogProductToListingItem\(product\)\];\s*\} catch \{\s*return \[\];/,
  "listing still skips a malformed product instead of taking down /catalog",
);
assert.match(
  homeTopics,
  /safeHomeSection\(\s*"home_topics"/,
  "home already soft-fails the same counts query",
);

console.log("topics-catalog-counts-unit: ok");
