#!/usr/bin/env npx tsx
/**
 * PostgREST `.in(...)` ID chunking for Content-Location / nginx 502 safety.
 */
import assert from "node:assert/strict";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadPublishedAudioItemsByPracticeIds,
  loadPublishedAudioSummaries,
} from "../src/lib/products/public-audio-items";
import {
  loadPersonalPromotionStartsForPractices,
  loadPricePromotionsForPractices,
} from "../src/lib/pricing/queries";
import {
  POSTGREST_IN_FILTER_CHUNK_SIZE,
  chunkIds,
} from "../src/lib/supabase/chunk";
import {
  PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE,
  chunkIds as topicsChunkIds,
} from "../src/lib/topics/queries";

function idAt(index: number, prefix = "00000000-0000-4000-8000-") {
  return `${prefix}${String(index).padStart(12, "0")}`;
}

assert.equal(POSTGREST_IN_FILTER_CHUNK_SIZE, 50);
assert.equal(PRACTICE_TOPICS_CATALOG_COUNT_CHUNK_SIZE, 50);
assert.deepEqual(chunkIds([]), []);
assert.deepEqual(chunkIds([1, 2, 3]), [[1, 2, 3]]);
assert.equal(chunkIds(Array.from({ length: 50 }, (_, i) => i)).length, 1);
assert.equal(chunkIds(Array.from({ length: 51 }, (_, i) => i)).length, 2);
assert.deepEqual(
  chunkIds(Array.from({ length: 131 }, (_, i) => i)).map((c) => c.length),
  [50, 50, 31],
);
assert.deepEqual(
  topicsChunkIds(Array.from({ length: 131 }, (_, i) => i)).map((c) => c.length),
  [50, 50, 31],
);

type InCall = { table: string; column: string; ids: string[] };

type QueryResult = { data: unknown; error: unknown };

function createMockSupabase(options: {
  onIn: (call: InCall) => QueryResult;
}): SupabaseClient {
  const calls: InCall[] = [];

  function builderFor(table: string) {
    let column = "";
    let ids: string[] = [];
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
      or() {
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
      return builderFor(table);
    },
    __calls: calls,
  };

  return client as unknown as SupabaseClient & { __calls: InCall[] };
}

function getCalls(client: SupabaseClient) {
  return (client as unknown as { __calls: InCall[] }).__calls;
}

// --- loadPublishedAudioSummaries ---
{
  const empty = createMockSupabase({
    onIn: () => ({ data: [], error: null }),
  });
  const emptyResult = await loadPublishedAudioSummaries(empty, []);
  assert.deepEqual(emptyResult, []);
  assert.equal(getCalls(empty).length, 0);
}

{
  const ids = Array.from({ length: 40 }, (_, i) => idAt(i));
  const client = createMockSupabase({
    onIn: (call) => {
      assert.equal(call.table, "audio_items");
      assert.equal(call.column, "practice_id");
      assert.ok(call.ids.length <= 50);
      return {
        data: call.ids.map((practice_id) => ({
          practice_id,
          duration_seconds: 12,
        })),
        error: null,
      };
    },
  });
  const rows = await loadPublishedAudioSummaries(client, ids);
  assert.equal(getCalls(client).length, 1);
  assert.equal(rows.length, 40);
  assert.equal(rows[0]?.practiceId, ids[0]);
}

{
  const ids = Array.from({ length: 131 }, (_, i) => idAt(i));
  const client = createMockSupabase({
    onIn: (call) => {
      assert.ok(call.ids.length <= 50);
      return {
        data: call.ids.map((practice_id) => ({
          practice_id,
          duration_seconds: 1,
        })),
        error: null,
      };
    },
  });
  const rows = await loadPublishedAudioSummaries(client, ids);
  assert.deepEqual(
    getCalls(client).map((c) => c.ids.length),
    [50, 50, 31],
  );
  assert.equal(rows.length, 131);
}

{
  const ids = Array.from({ length: 60 }, (_, i) => idAt(i));
  const client = createMockSupabase({
    onIn: (call) => {
      if (call.ids.length === 50) {
        return { data: null, error: { message: "boom", code: "502" } };
      }
      return {
        data: call.ids.map((practice_id) => ({
          practice_id,
          duration_seconds: 3,
        })),
        error: null,
      };
    },
  });
  await assert.rejects(
    () => loadPublishedAudioSummaries(client, ids),
    /published_audio_summaries_lookup_failed/,
  );
}

// --- loadPublishedAudioItemsByPracticeIds ---
{
  const ids = Array.from({ length: 51 }, (_, i) => idAt(i));
  const client = createMockSupabase({
    onIn: (call) => {
      assert.ok(call.ids.length <= 50);
      return {
        data: call.ids.map((practice_id, index) => ({
          id: idAt(index, "11111111-1111-4111-8111-"),
          practice_id,
          title: "Track",
          position: index,
          duration_seconds: 10,
          cover_url: null,
          cover_image: null,
          updated_at: null,
        })),
        error: null,
      };
    },
  });
  const rows = await loadPublishedAudioItemsByPracticeIds(client, ids);
  assert.deepEqual(
    getCalls(client).map((c) => c.ids.length),
    [50, 1],
  );
  assert.equal(rows.length, 51);
}

// --- loadPricePromotionsForPractices ---
{
  const ids = Array.from({ length: 131 }, (_, i) => idAt(i));
  const client = createMockSupabase({
    onIn: (call) => {
      assert.equal(call.table, "practice_price_promotions");
      assert.ok(call.ids.length <= 50);
      return {
        data: call.ids.map((practice_id) => ({
          id: idAt(Number(practice_id.slice(-4)), "22222222-2222-4222-8222-"),
          practice_id,
          name: "Sale",
          promotion_type: "calendar",
          sale_price: 100,
          starts_at: null,
          ends_at: null,
          duration_seconds: null,
          above_timer_text: null,
          below_button_text: null,
          is_active: true,
          start_token: "token",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        })),
        error: null,
      };
    },
  });
  const map = await loadPricePromotionsForPractices(client, ids);
  assert.deepEqual(
    getCalls(client).map((c) => c.ids.length),
    [50, 50, 31],
  );
  assert.equal(map.size, 131);
  assert.equal(map.get(ids[0])?.length, 1);
}

{
  // fail-open: first chunk errors, second succeeds → keep second
  const ids = Array.from({ length: 60 }, (_, i) => idAt(i));
  let call = 0;
  const client = createMockSupabase({
    onIn: (callInfo) => {
      call += 1;
      if (call === 1) {
        return { data: null, error: { message: "chunk1", code: "PGRST" } };
      }
      return {
        data: callInfo.ids.map((practice_id) => ({
          id: idAt(7, "33333333-3333-4333-8333-"),
          practice_id,
          name: "Sale",
          promotion_type: "calendar",
          sale_price: 200,
          starts_at: null,
          ends_at: null,
          duration_seconds: null,
          above_timer_text: null,
          below_button_text: null,
          is_active: true,
          start_token: "token",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        })),
        error: null,
      };
    },
  });
  const map = await loadPricePromotionsForPractices(client, ids);
  assert.equal(map.size, 10);
  assert.equal(map.has(ids[50]), true);
  assert.equal(map.has(ids[0]), false);
}

// --- personal promotion starts: practice_id + promotion_id chunking ---
{
  const ids = Array.from({ length: 51 }, (_, i) => idAt(i));
  const client = createMockSupabase({
    onIn: (call) => {
      assert.ok(call.ids.length <= 50);
      if (call.table === "practice_price_promotions") {
        return {
          data: call.ids.map((practice_id) => {
            const n = Number.parseInt(practice_id.slice(-12), 10);
            return {
              id: idAt(n, "44444444-4444-4444-8444-"),
              practice_id,
            };
          }),
          error: null,
        };
      }
      if (call.table === "practice_price_promotion_starts") {
        return {
          data: call.ids.map((promotion_id) => {
            const n = Number.parseInt(promotion_id.slice(-12), 10);
            return {
              id: idAt(n, "55555555-5555-4555-8555-"),
              promotion_id,
              visitor_id: "visitor",
              user_id: null,
              started_at: "2026-01-01T00:00:00.000Z",
              expires_at: "2026-01-02T00:00:00.000Z",
              sale_price_snapshot: 99,
            };
          }),
          error: null,
        };
      }
      return { data: [], error: null };
    },
  });
  const map = await loadPersonalPromotionStartsForPractices({
    supabase: client,
    practiceIds: ids,
    visitorId: "visitor",
    userId: null,
  });
  const calls = getCalls(client);
  const promoCalls = calls.filter((c) => c.table === "practice_price_promotions");
  const startCalls = calls.filter(
    (c) => c.table === "practice_price_promotion_starts",
  );
  assert.deepEqual(
    promoCalls.map((c) => c.ids.length),
    [50, 1],
  );
  assert.deepEqual(
    startCalls.map((c) => c.ids.length),
    [50, 1],
  );
  assert.equal(map.size, 51);
}

console.log("postgrest-in-chunking-unit: ok");
