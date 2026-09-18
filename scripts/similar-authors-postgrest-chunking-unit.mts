#!/usr/bin/env npx tsx
/**
 * findSimilarAuthors PostgREST `.in(...)` chunking — Content-Location / nginx 502 safety.
 * Preserves public-page fail-open scoring when a topics chunk errors.
 */
import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findSimilarAuthors } from "../src/lib/authors/similar-authors";
import { POSTGREST_IN_FILTER_CHUNK_SIZE } from "../src/lib/supabase/chunk";

function idAt(index: number, prefix = "00000000-0000-4000-8000-") {
  return `${prefix}${String(index).padStart(12, "0")}`;
}

assert.equal(POSTGREST_IN_FILTER_CHUNK_SIZE, 50);

type InCall = { table: string; column: string; ids: string[] };

type QueryResult = { data: unknown; error: unknown };

type PracticeSeed = {
  id: string;
  author_id: string;
  name: string;
  slug: string;
};

function createMockSupabase(options: {
  practices: PracticeSeed[];
  practicesError?: unknown;
  onIn: (call: InCall) => QueryResult;
}): SupabaseClient & { __calls: InCall[]; __fromTables: string[] } {
  const calls: InCall[] = [];
  const fromTables: string[] = [];

  function practicesBuilder() {
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      neq() {
        return builder;
      },
      then(
        onFulfilled?: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (options.practicesError) {
          return Promise.resolve({
            data: null,
            error: options.practicesError,
          }).then(onFulfilled, onRejected);
        }

        const data = options.practices.map((practice) => ({
          id: practice.id,
          author_id: practice.author_id,
          cover_image: null,
          authors: {
            id: practice.author_id,
            name: practice.name,
            slug: practice.slug,
            short_positioning: null,
            avatar_url: null,
            avatar_image: null,
          },
        }));

        return Promise.resolve({ data, error: null }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    return builder;
  }

  function inBuilder(table: string) {
    let column = "";
    let ids: string[] = [];
    const builder = {
      select() {
        return builder;
      },
      in(col: string, values: string[]) {
        column = col;
        ids = [...values];
        return builder;
      },
      then(
        onFulfilled?: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const call = { table, column, ids };
        calls.push(call);
        return Promise.resolve(options.onIn(call)).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      fromTables.push(table);
      if (table === "practices") {
        return practicesBuilder();
      }
      return inBuilder(table);
    },
    __calls: calls,
    __fromTables: fromTables,
  };

  return client as unknown as SupabaseClient & {
    __calls: InCall[];
    __fromTables: string[];
  };
}

function getCalls(client: SupabaseClient) {
  return (client as unknown as { __calls: InCall[] }).__calls;
}

function getFromTables(client: SupabaseClient) {
  return (client as unknown as { __fromTables: string[] }).__fromTables;
}

function practiceCalls(client: SupabaseClient) {
  return getCalls(client).filter((c) => c.table === "practice_topics");
}

function authorTopicCalls(client: SupabaseClient) {
  return getCalls(client).filter((c) => c.table === "author_topics");
}

function seedPractices(count: number): PracticeSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    id: idAt(i, "aaaaaaaa-aaaa-4aaa-8aaa-"),
    author_id: idAt(i, "bbbbbbbb-bbbb-4bbb-8bbb-"),
    name: `Author ${i}`,
    slug: `author-${i}`,
  }));
}

// --- no topic keys: no topics bulk reads ---
{
  const practices = seedPractices(3);
  const client = createMockSupabase({
    practices,
    onIn: () => {
      throw new Error("topics .in must not run without topic keys");
    },
  });
  const result = await findSimilarAuthors(
    client,
    "current-author",
    "current",
    [],
  );
  assert.equal(practiceCalls(client).length, 0);
  assert.equal(authorTopicCalls(client).length, 0);
  assert.ok(result.length >= 1);
  assert.ok(getFromTables(client).includes("practices"));
}

// --- practice_topics: 0 practice ids path (empty published list) ---
{
  const client = createMockSupabase({
    practices: [],
    onIn: () => {
      throw new Error("no .in expected when practices empty");
    },
  });
  const result = await findSimilarAuthors(
    client,
    "current-author",
    "current",
    ["sleep"],
  );
  assert.deepEqual(result, []);
  assert.equal(getCalls(client).length, 0);
}

// --- practice_topics: ≤50 → one .in ---
{
  const practices = seedPractices(40);
  const client = createMockSupabase({
    practices,
    onIn: (call) => {
      assert.ok(call.ids.length <= 50);
      if (call.table === "practice_topics") {
        return {
          data: call.ids.map((practice_id) => ({
            practice_id,
            topics: { key: "sleep" },
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });
  const result = await findSimilarAuthors(
    client,
    "current-author",
    "current",
    ["sleep"],
  );
  assert.equal(practiceCalls(client).length, 1);
  assert.equal(practiceCalls(client)[0]?.ids.length, 40);
  assert.equal(result[0]?.overlapScore, 1);
}

// --- practice_topics: 51 → 50 + 1 ---
{
  const practices = seedPractices(51);
  const client = createMockSupabase({
    practices,
    onIn: (call) => {
      assert.ok(call.ids.length <= 50);
      if (call.table === "practice_topics") {
        return {
          data: call.ids.map((practice_id) => ({
            practice_id,
            topics: { key: "sleep" },
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });
  await findSimilarAuthors(client, "current-author", "current", ["sleep"]);
  assert.deepEqual(
    practiceCalls(client).map((c) => c.ids.length),
    [50, 1],
  );
}

// --- practice_topics: 131 → 50 + 50 + 31; never >50; scores merge ---
{
  const practices = seedPractices(131);
  const client = createMockSupabase({
    practices,
    onIn: (call) => {
      assert.ok(call.ids.length <= 50, `in size ${call.ids.length} > 50`);
      if (call.table === "practice_topics") {
        // Only first practice of each chunk overlaps → 3 authors score +1
        return {
          data: [
            {
              practice_id: call.ids[0],
              topics: { key: "sleep" },
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });
  const result = await findSimilarAuthors(
    client,
    "current-author",
    "current",
    ["sleep"],
  );
  assert.deepEqual(
    practiceCalls(client).map((c) => c.ids.length),
    [50, 50, 31],
  );
  const scored = result.filter((r) => r.overlapScore > 0);
  assert.equal(scored.length, 3);
  assert.ok(scored.every((r) => r.overlapScore === 1));
}

// --- author_topics: 50 candidates → one chunk; 51 → two; merge scoring ---
{
  const practices = seedPractices(50);
  const client = createMockSupabase({
    practices,
    onIn: (call) => {
      assert.ok(call.ids.length <= 50);
      if (call.table === "author_topics") {
        return {
          data: call.ids.map((author_id) => ({
            author_id,
            topics: { key: "focus" },
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });
  const result = await findSimilarAuthors(
    client,
    "current-author",
    "current",
    ["focus"],
  );
  assert.equal(authorTopicCalls(client).length, 1);
  assert.equal(authorTopicCalls(client)[0]?.ids.length, 50);
  assert.equal(authorTopicCalls(client)[0]?.column, "author_id");
  assert.ok(result.every((r) => r.overlapScore === 1));
}

{
  const practices = seedPractices(51);
  const client = createMockSupabase({
    practices,
    onIn: (call) => {
      assert.ok(call.ids.length <= 50);
      if (call.table === "author_topics") {
        return {
          data: call.ids.slice(0, 1).map((author_id) => ({
            author_id,
            topics: { key: "focus" },
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });
  const result = await findSimilarAuthors(
    client,
    "current-author",
    "current",
    ["focus"],
  );
  assert.deepEqual(
    authorTopicCalls(client).map((c) => c.ids.length),
    [50, 1],
  );
  assert.equal(result.filter((r) => r.overlapScore === 1).length, 2);
}

// --- partial error fail-open: first practice_topics chunk fails, second succeeds ---
{
  const practices = seedPractices(60);
  const logs: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };

  try {
    const client = createMockSupabase({
      practices,
      onIn: (call) => {
        assert.ok(call.ids.length <= 50);
        if (call.table === "author_topics") {
          return { data: [], error: null };
        }
        if (call.table === "practice_topics" && call.ids.length === 50) {
          return {
            data: null,
            error: { code: "502", message: "upstream sent too big header" },
          };
        }
        return {
          data: call.ids.map((practice_id) => ({
            practice_id,
            topics: { key: "sleep" },
          })),
          error: null,
        };
      },
    });
    const result = await findSimilarAuthors(
      client,
      "current-author",
      "current",
      ["sleep"],
    );
    assert.equal(practiceCalls(client).length, 2);
    // Only the successful second chunk (10 practices) contributes scores.
    // mergeAuthorRecommendations caps output at SIMILAR_AUTHORS_LIMIT.
    const scored = result.filter((r) => r.overlapScore > 0);
    assert.ok(scored.length >= 1, "fail-open must keep successful chunk scores");
    assert.ok(
      scored.every((r) => r.overlapScore === 1),
      "scores come only from the successful chunk",
    );
    const successfulPracticeAuthorIds = new Set(
      practices.slice(50).map((p) => p.author_id),
    );
    assert.ok(
      scored.every((r) => successfulPracticeAuthorIds.has(r.id)),
      "scored authors must belong to the successful practice chunk",
    );
    assert.ok(
      logs.some(
        (entry) =>
          Array.isArray(entry) &&
          entry[0] === "[similar-authors] topics_chunk_failed",
      ),
      "expected structured chunk error log",
    );
    const payload = logs.find(
      (entry) =>
        Array.isArray(entry) &&
        entry[0] === "[similar-authors] topics_chunk_failed",
    ) as [string, Record<string, unknown>];
    assert.equal(payload[1].table, "practice_topics");
    assert.equal(payload[1].chunkIndex, 0);
    assert.equal(payload[1].chunkSize, 50);
    assert.equal(payload[1].totalIds, 60);
    assert.equal(payload[1].code, "502");
    assert.equal(typeof payload[1].message, "string");
    assert.equal(
      Object.prototype.hasOwnProperty.call(payload[1], "ids"),
      false,
    );
  } finally {
    console.error = originalError;
  }
}

console.log("similar-authors-postgrest-chunking-unit: ok");
