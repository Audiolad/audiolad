#!/usr/bin/env npx tsx
/**
 * Catalog topic assignment query chunking (no DB).
 *
 * A PostgREST/nginx request carrying more than 50 UUIDs is deliberately
 * rejected by this mock, reproducing the production URL-size failure class.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPublishedPracticeIdsForTopicKey } from "../src/lib/products/catalog";
import { PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE } from "../src/lib/topics/queries";

function practiceId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
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
    or() {
      return builder;
    },
    not() {
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

function createSupabase(options: {
  publishedPracticeCount: number;
  topicAssignments: Map<string, string[]>;
  failAtChunkIndex?: number;
}) {
  const publishedIds = Array.from(
    { length: options.publishedPracticeCount },
    (_, index) => practiceId(index),
  );
  const assignmentChunks: string[][] = [];
  const practiceFilters: Array<[string, string | boolean]> = [];

  const supabase = {
    from(table: string) {
      if (table === "topics") {
        return createThenBuilder(() => ({
          data: [
            { id: "topic-relationships", key: "relationships" },
            { id: "topic-money", key: "money" },
          ],
          error: null,
        }));
      }

      if (table === "practices") {
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: string | boolean) {
            practiceFilters.push([column, value]);
            return builder;
          },
          or() {
            return builder;
          },
          not() {
            return builder;
          },
          then(
            onFulfilled?: (value: QueryResult) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) {
            return Promise.resolve({
              data: publishedIds.map((id) => ({ id })),
              error: null,
            }).then(onFulfilled, onRejected);
          },
        };
        return builder;
      }

      if (table === "practice_topics") {
        let topicIds: string[] = [];
        const builder = {
          select() {
            return builder;
          },
          in(column: string, values: string[]) {
            if (column === "topic_id") {
              topicIds = [...values];
              return builder;
            }

            assert.equal(column, "practice_id", "assignment uses practice_id");
            const chunkIndex = assignmentChunks.length;
            assignmentChunks.push([...values]);

            return createThenBuilder(() => {
              if (chunkIndex === options.failAtChunkIndex) {
                return {
                  data: null,
                  error: {
                    code: "502",
                    message: "upstream request too large",
                    status: 502,
                  },
                };
              }

              return {
                data: values.flatMap((practice_id) =>
                  (options.topicAssignments.get(practice_id) ?? [])
                    .filter((topic_id) => topicIds.includes(topic_id))
                    .map(() => ({ practice_id })),
                ),
                error: null,
              };
            });
          },
        };
        return builder;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    assignmentChunks,
    practiceFilters,
  };

  return supabase as unknown as SupabaseClient & {
    assignmentChunks: string[][];
    practiceFilters: Array<[string, string | boolean]>;
  };
}

function expectedAssignments(ids: number[]): Map<string, string[]> {
  return new Map(
    ids.map((index) => [practiceId(index), ["topic-relationships"]]),
  );
}

assert.equal(PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE, 50);

for (const publishedPracticeCount of [93, 120]) {
  const assigned = [0, 49, 50, 92];
  if (publishedPracticeCount === 120) {
    assigned.push(119);
  }

  const supabase = createSupabase({
    publishedPracticeCount,
    topicAssignments: expectedAssignments(assigned),
  });
  const result = await getPublishedPracticeIdsForTopicKey(
    supabase,
    "relationships",
  );

  assert.deepEqual(result, assigned.map(practiceId), `${publishedPracticeCount}: assigned IDs merge`);
  assert.ok(
    supabase.assignmentChunks.every(
      (chunk) => chunk.length <= PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE,
    ),
    `${publishedPracticeCount}: every assignment query is bounded to 50`,
  );
  assert.deepEqual(
    supabase.assignmentChunks.map((chunk) => chunk.length),
    publishedPracticeCount === 93 ? [50, 43] : [50, 50, 20],
    `${publishedPracticeCount}: expected chunk layout`,
  );
  assert.ok(
    supabase.practiceFilters.some(
      ([column, value]) => column === "status" && value === "published",
    ),
    "published visibility filter remains applied",
  );
  assert.ok(
    supabase.practiceFilters.some(
      ([column, value]) => column === "catalog_visibility" && value === "listed",
    ),
    "guest listed visibility filter remains applied",
  );
}

const duplicateAssignments = new Map([
  [practiceId(0), ["topic-relationships", "topic-money"]],
  [practiceId(50), ["topic-relationships"]],
]);
const multiTopicSupabase = createSupabase({
  publishedPracticeCount: 120,
  topicAssignments: duplicateAssignments,
});
assert.deepEqual(
  await getPublishedPracticeIdsForTopicKey(
    multiTopicSupabase,
    "relationships,money",
  ),
  [practiceId(0), practiceId(50)],
  "multi-topic union is merged and deduplicated",
);

const emptyTopicSupabase = createSupabase({
  publishedPracticeCount: 120,
  topicAssignments: new Map(),
});
assert.deepEqual(
  await getPublishedPracticeIdsForTopicKey(emptyTopicSupabase, "abundance"),
  [],
  "an empty topic remains an empty result without an error",
);

const logs: unknown[][] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => logs.push(args);
const failingSupabase = createSupabase({
  publishedPracticeCount: 93,
  topicAssignments: expectedAssignments([0]),
  failAtChunkIndex: 1,
});
assert.deepEqual(
  await getPublishedPracticeIdsForTopicKey(failingSupabase, "relationships"),
  [],
  "a failed chunk keeps the existing empty-result contract",
);
console.error = originalError;
assert.deepEqual(logs, [
  [
    "[catalog] topic_practice_assignments_failed",
    {
      stage: "get_published_practice_ids_for_topic_key",
      chunkIndex: 1,
      chunkSize: 43,
      totalPracticeCount: 93,
      code: "502",
      message: "upstream request too large",
      status: 502,
    },
  ],
]);

const catalogSource = readFileSync("src/lib/products/catalog.ts", "utf8");
const catalogRoute = readFileSync("src/app/api/catalog/route.ts", "utf8");
assert.match(
  catalogSource,
  /chunkIds\(\s*\[\.\.\.publishedPracticeIds\],\s*PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE/,
  "the production topic assignment path chunks published practice IDs",
);
assert.match(
  catalogRoute,
  /listPublishedCatalog\(supabase, query, \{ visitorId \}\)/,
  "/api/catalog retains the same listing path and topic semantics",
);

console.log("catalog-topic-assignment-chunking-unit: ok");
