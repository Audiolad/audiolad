#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildStudioMusicCatalogCursorOrFilter,
  createSupabaseStudioMusicCatalogStore,
  decodeStudioMusicCatalogCursor,
  encodeStudioMusicCatalogCursor,
  handleStudioMusicCatalog,
  isStudioMusicListedVisibilityRow,
  studioMusicCatalogFetchLimit,
  studioMusicListedVisibilityOrFilter,
  takeStudioMusicCatalogPage,
  type StudioMusicCatalogPublication,
  type StudioMusicCatalogStore,
} from "../src/lib/studio-music/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogSource = readFileSync(
  join(root, "src/lib/studio-music/catalog.ts"),
  "utf8",
);

function uuidFromIndex(index: number): string {
  return `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`;
}

function publication(
  index: number,
  overrides: Partial<StudioMusicCatalogPublication> = {},
): StudioMusicCatalogPublication {
  const id = overrides.id ?? uuidFromIndex(index);
  return {
    id,
    author_id: "author-1",
    title: `Практика ${index}`,
    slug: `practice-${index}`,
    product_kind: "music",
    publication_class: "release",
    music_usage_permission: "platform_reuse_allowed",
    status: "published",
    deleted_at: null,
    is_free: false,
    price: 500,
    catalog_visibility: "listed",
    is_catalog_listed: true,
    cover_url: null,
    cover_image: null,
    updated_at: "2026-04-01T00:00:00.000Z",
    published_at: new Date(Date.UTC(2026, 3, 1, 0, 0, index)).toISOString(),
    created_at: new Date(Date.UTC(2026, 3, 1, 0, 0, index)).toISOString(),
    authors: { name: "Анна", slug: "anna" },
    ...overrides,
  };
}

function splitPostgrestList(filter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of filter) {
    if (char === "(") {
      depth += 1;
    }
    if (char === ")") {
      depth -= 1;
    }
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function unwrapQuoted(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  return value;
}

function matchPostgrestClause(
  row: Record<string, unknown>,
  clause: string,
): boolean {
  if (clause.startsWith("and(") && clause.endsWith(")")) {
    return splitPostgrestList(clause.slice(4, -1)).every((part) =>
      matchPostgrestClause(row, part),
    );
  }

  const inMatch = clause.match(/^([a-z_]+)\.in\.\((.+)\)$/);
  if (inMatch) {
    const values = inMatch[2].split(",").map((value) => value.trim());
    return values.includes(String(row[inMatch[1]] ?? ""));
  }

  const match = clause.match(/^([a-z_]+)\.(eq|is|lt)\.(.+)$/);
  if (!match) {
    return false;
  }

  const [, column, operator, rawValue] = match;
  const actual = row[column];

  if (operator === "is") {
    return rawValue === "null"
      ? actual == null
      : rawValue === "true"
        ? actual === true
        : rawValue === "false"
          ? actual === false
          : false;
  }

  const expected = unwrapQuoted(rawValue);
  if (operator === "eq") {
    if (expected === "true") {
      return actual === true;
    }
    if (expected === "false") {
      return actual === false;
    }
    return String(actual ?? "") === expected;
  }

  return String(actual ?? "") < expected;
}

function applyEq(row: Record<string, unknown>, column: string, value: unknown) {
  return row[column] === value;
}

function applyIs(row: Record<string, unknown>, column: string, value: unknown) {
  return value === null ? row[column] == null : row[column] === value;
}

type RecordingQuery = {
  table: string;
  eqs: Array<[string, unknown]>;
  iss: Array<[string, unknown]>;
  ors: string[];
  ins: Array<[string, string[]]>;
  orders: Array<[string, { ascending: boolean }]>;
  limitValue: number | null;
};

type RecordingSupabase = {
  client: SupabaseClient;
  practiceLimits: number[];
  materializedPracticeCounts: number[];
  practiceOrFilters: string[][];
  trackPracticeIds: string[][];
  pricePracticeIds: string[];
};

function createRecordingSupabase(input: {
  practices: StudioMusicCatalogPublication[];
  entitlements?: Array<{
    practice_id: string;
    grant_source?: string | null;
    revoked_at?: string | null;
    user_id?: string;
  }>;
  authorMembers?: Array<{ author_id: string; user_id: string }>;
}): RecordingSupabase {
  const practiceLimits: number[] = [];
  const materializedPracticeCounts: number[] = [];
  const practiceOrFilters: string[][] = [];
  const trackPracticeIds: string[][] = [];
  const pricePracticeIds: string[] = [];

  function executePractices(query: RecordingQuery) {
    if (query.limitValue != null) {
      practiceLimits.push(query.limitValue);
    }
    practiceOrFilters.push([...query.ors]);

    let rows = input.practices.filter((practice) => {
      const row = practice as Record<string, unknown>;
      if (!query.eqs.every(([column, value]) => applyEq(row, column, value))) {
        return false;
      }
      if (!query.iss.every(([column, value]) => applyIs(row, column, value))) {
        return false;
      }
      if (!query.ors.every((filter) =>
        splitPostgrestList(filter).some((clause) =>
          matchPostgrestClause(row, clause),
        ),
      )) {
        return false;
      }
      if (
        !query.ins.every(([column, values]) =>
          values.includes(String(row[column] ?? "")),
        )
      ) {
        return false;
      }
      return true;
    });

    for (const [column, options] of [...query.orders].reverse()) {
      rows = [...rows].sort((left, right) => {
        const leftValue = String(
          (left as Record<string, unknown>)[column] ?? "",
        );
        const rightValue = String(
          (right as Record<string, unknown>)[column] ?? "",
        );
        const compared = leftValue.localeCompare(rightValue);
        return options.ascending ? compared : -compared;
      });
    }

    const fetched =
      query.limitValue == null ? rows : rows.slice(0, query.limitValue);
    materializedPracticeCounts.push(fetched.length);
    return { data: fetched, error: null };
  }

  function createBuilder(table: string) {
    const query: RecordingQuery = {
      table,
      eqs: [],
      iss: [],
      ors: [],
      ins: [],
      orders: [],
      limitValue: null,
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        query.eqs.push([column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        query.iss.push([column, value]);
        return builder;
      },
      or(filter: string) {
        query.ors.push(filter);
        return builder;
      },
      in(column: string, values: unknown[]) {
        const ids = values.map(String);
        query.ins.push([column, ids]);
        if (table === "audio_items" && column === "practice_id") {
          trackPracticeIds.push(ids);
        }
        return builder;
      },
      order(column: string, options: { ascending: boolean }) {
        query.orders.push([column, options]);
        return builder;
      },
      limit(value: number) {
        query.limitValue = value;
        return builder;
      },
      then(
        onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        let result: { data: unknown; error: null };
        if (table === "practices") {
          result = executePractices(query);
        } else if (table === "audio_items") {
          const practiceIds =
            query.ins.find(([column]) => column === "practice_id")?.[1] ?? [];
          result = {
            data: practiceIds.map((practiceId) => ({
              id: `${practiceId}-t1`,
              practice_id: practiceId,
              title: "Трек",
              position: 0,
              duration_seconds: 60,
              cover_url: null,
              cover_image: null,
              updated_at: null,
            })),
            error: null,
          };
        } else if (table === "studio_music_entitlements") {
          result = { data: input.entitlements ?? [], error: null };
        } else if (table === "author_members") {
          result = { data: input.authorMembers ?? [], error: null };
        } else {
          result = { data: [], error: null };
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  const client = {
    from(table: string) {
      return createBuilder(table);
    },
    rpc(name: string, args: { p_practice_id?: string }) {
      if (name === "resolve_practice_effective_price" && args.p_practice_id) {
        pricePracticeIds.push(args.p_practice_id);
        return Promise.resolve({
          data: {
            is_free: false,
            base_price: 500,
            sale_price: null,
            final_price: 500,
            promotion_id: null,
            promotion_name: null,
            promotion_type: null,
            ends_at: null,
            expires_at: null,
            base_price_minor: 50000,
            sale_price_minor: null,
            final_price_minor: 50000,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;

  return {
    client,
    practiceLimits,
    materializedPracticeCounts,
    practiceOrFilters,
    trackPracticeIds,
    pricePracticeIds,
  };
}

function assertNoDuplicates(ids: string[]) {
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(",")}`);
}

{
  assert.equal(studioMusicCatalogFetchLimit(20), 21);
  assert.equal(studioMusicCatalogFetchLimit(50), 51);
  assert.equal(studioMusicCatalogFetchLimit(99), 51);
  assert.equal(
    studioMusicListedVisibilityOrFilter(),
    "catalog_visibility.eq.listed,and(catalog_visibility.is.null,is_catalog_listed.eq.true),and(catalog_visibility.is.null,is_catalog_listed.is.null)",
  );
  assert.match(catalogSource, /studioMusicListedVisibilityOrFilter\(\)/);
  assert.match(catalogSource, /applyStudioMusicCatalogKeyset/);
  assert.match(catalogSource, /studioMusicCatalogFetchLimit\(limit\)/);
  assert.doesNotMatch(
    catalogSource,
    /\.eq\(\s*["']catalog_visibility["']\s*,\s*["']listed["']\s*\)/,
  );
}

{
  const fetched = Array.from({ length: 21 }, (_, index) => publication(index));
  const page = takeStudioMusicCatalogPage(fetched, 20);
  assert.equal(page.practices.length, 20);
  assert.ok(page.nextCursor);
  const second = takeStudioMusicCatalogPage(fetched.slice(20), 20);
  assert.equal(second.practices.length, 1);
  assert.equal(second.nextCursor, null);
}

{
  const listedMatrix: Array<{
    catalog_visibility: StudioMusicCatalogPublication["catalog_visibility"];
    is_catalog_listed: boolean | null;
    listed: boolean;
    label: string;
  }> = [
    {
      catalog_visibility: "listed",
      is_catalog_listed: true,
      listed: true,
      label: "explicit listed",
    },
    {
      catalog_visibility: null,
      is_catalog_listed: true,
      listed: true,
      label: "legacy null + is_catalog_listed true",
    },
    {
      catalog_visibility: null,
      is_catalog_listed: null,
      listed: true,
      label: "legacy both unset",
    },
    {
      catalog_visibility: null,
      is_catalog_listed: false,
      listed: false,
      label: "legacy null + is_catalog_listed false",
    },
    {
      catalog_visibility: "unlisted",
      is_catalog_listed: true,
      listed: false,
      label: "explicit unlisted",
    },
    {
      catalog_visibility: "selected_users",
      is_catalog_listed: true,
      listed: false,
      label: "selected_users",
    },
  ];

  for (const row of listedMatrix) {
    assert.equal(
      isStudioMusicListedVisibilityRow(row),
      row.listed,
      row.label,
    );
  }

  const visibilityRows = listedMatrix.map((row, index) =>
    publication(index + 1, {
      catalog_visibility: row.catalog_visibility,
      is_catalog_listed: row.is_catalog_listed,
      title: row.label,
    }),
  );
  const recording = createRecordingSupabase({ practices: visibilityRows });
  const store = createSupabaseStudioMusicCatalogStore(recording.client);
  const page = await store.listPublicInventory({
    filter: "all",
    cursor: null,
    limit: 20,
  });
  assert.deepEqual(
    [...page.practices.map((practice) => practice.title)].sort(),
    listedMatrix
      .filter((row) => row.listed)
      .map((row) => row.label)
      .sort(),
  );
  assert.equal(page.nextCursor, null);
  assert.deepEqual(recording.practiceLimits, [21]);
  assert.ok(
    recording.materializedPracticeCounts[0] <= 21,
    "listed matrix query must not materialize more than limit+1",
  );
}

{
  const eligible = Array.from({ length: 100 }, (_, index) => publication(index));
  const recording = createRecordingSupabase({ practices: eligible });
  const store = createSupabaseStudioMusicCatalogStore(recording.client);

  const first = await handleStudioMusicCatalog({
    filter: "all",
    cursor: null,
    limit: "20",
    userId: null,
    store,
  });
  assert.equal(first.status, 200);
  assert.ok("items" in first.body);
  assert.equal(first.body.items.length, 20);
  assert.ok(first.body.nextCursor);
  assert.deepEqual(recording.practiceLimits, [21]);
  assert.equal(recording.materializedPracticeCounts[0], 21);
  assert.ok(
    recording.materializedPracticeCounts[0] < eligible.length,
    "page 1 must not materialize all 100 eligible rows",
  );

  const firstIds = first.body.items.map((item) => item.publication_id);
  assert.deepEqual(recording.trackPracticeIds[0], firstIds);
  assert.deepEqual(recording.pricePracticeIds, firstIds);
  assert.equal(recording.trackPracticeIds[0]?.length, 20);
  assert.equal(recording.pricePracticeIds.length, 20);

  const second = await handleStudioMusicCatalog({
    filter: "all",
    cursor: first.body.nextCursor,
    limit: "20",
    userId: null,
    store,
  });
  assert.equal(second.status, 200);
  assert.ok("items" in second.body);
  assert.equal(second.body.items.length, 20);
  assert.ok(second.body.nextCursor);
  assert.deepEqual(recording.practiceLimits, [21, 21]);
  assert.equal(recording.materializedPracticeCounts[1], 21);
  const secondIds = second.body.items.map((item) => item.publication_id);
  assertNoDuplicates([...firstIds, ...secondIds]);
  assert.deepEqual(recording.trackPracticeIds[1], secondIds);
  assert.deepEqual(recording.pricePracticeIds.slice(20), secondIds);
}

{
  const eligible = Array.from({ length: 100 }, (_, index) =>
    publication(index + 200, { is_free: true, price: 0 }),
  );
  const recording = createRecordingSupabase({ practices: eligible });
  const store = createSupabaseStudioMusicCatalogStore(recording.client);

  const first = await handleStudioMusicCatalog({
    filter: "free",
    cursor: null,
    limit: "20",
    userId: null,
    store,
  });
  assert.equal(first.status, 200);
  assert.ok("items" in first.body);
  assert.equal(first.body.items.length, 20);
  assert.ok(first.body.nextCursor);
  assert.equal(first.body.items.every((item) => item.is_free), true);
  assert.deepEqual(recording.practiceLimits, [21]);
  assert.equal(recording.materializedPracticeCounts[0], 21);

  const second = await handleStudioMusicCatalog({
    filter: "free",
    cursor: first.body.nextCursor,
    limit: "20",
    userId: null,
    store,
  });
  assert.equal(second.status, 200);
  assert.ok("items" in second.body);
  assert.equal(second.body.items.length, 20);
  assert.equal(recording.materializedPracticeCounts[1], 21);
  assertNoDuplicates([
    ...first.body.items.map((item) => item.publication_id),
    ...second.body.items.map((item) => item.publication_id),
  ]);
}

{
  const eligible = Array.from({ length: 100 }, (_, index) => publication(index + 400));
  const loadedIds: string[][] = [];
  const pricedIds: string[][] = [];
  let fetchedCount = 0;

  const store: StudioMusicCatalogStore = {
    async listPublicInventory({ cursor, limit }) {
      const fetchLimit = studioMusicCatalogFetchLimit(limit);
      const after = eligible.filter((practice) => {
        if (!cursor) {
          return true;
        }
        const [sortTimestamp, id] = cursor.split(":");
        const created = Date.parse(String(practice.created_at));
        if (created < Number(sortTimestamp)) {
          return true;
        }
        return created === Number(sortTimestamp) && String(practice.id) < id;
      });
      const sorted = [...after].sort((left, right) => {
        const time = String(right.created_at).localeCompare(String(left.created_at));
        if (time !== 0) {
          return time;
        }
        return String(right.id).localeCompare(String(left.id));
      });
      const fetched = sorted.slice(0, fetchLimit);
      fetchedCount += fetched.length;
      assert.ok(fetched.length <= fetchLimit);
      assert.ok(fetched.length < eligible.length);
      return takeStudioMusicCatalogPage(fetched, limit);
    },
    async listMine() {
      return {
        practices: [],
        nextCursor: null,
        entitlements: [],
        authorMemberAuthorIds: [],
      };
    },
    async loadPublishedTracks(practiceIds) {
      loadedIds.push([...practiceIds]);
      return practiceIds.map((practiceId) => ({
        id: `${practiceId}-t1`,
        practiceId,
        title: "Трек",
        position: 0,
        durationSeconds: 60,
        coverUrl: null,
        coverImage: null,
        updatedAt: null,
      }));
    },
    async loadTracksForMine(practiceIds) {
      return this.loadPublishedTracks(practiceIds);
    },
    async resolveCheckoutPrices(practiceIds) {
      pricedIds.push([...practiceIds]);
      return new Map(
        practiceIds.map((practiceId) => [
          practiceId,
          { listenerEffectiveMinor: 50000 },
        ]),
      );
    },
  };

  const first = await handleStudioMusicCatalog({
    filter: "all",
    cursor: null,
    limit: "20",
    userId: null,
    store,
  });
  assert.equal(first.status, 200);
  assert.ok("items" in first.body);
  assert.equal(fetchedCount, 21);
  assert.deepEqual(
    loadedIds[0],
    first.body.items.map((item) => item.publication_id),
  );
  assert.deepEqual(pricedIds[0], loadedIds[0]);
}

{
  const mineRows = Array.from({ length: 100 }, (_, index) =>
    publication(index + 600, {
      status: "unpublished",
      music_usage_permission: "listen_only",
    }),
  );
  const recording = createRecordingSupabase({
    practices: mineRows,
    entitlements: mineRows.map((practice) => ({
      practice_id: String(practice.id),
      grant_source: "purchase",
      revoked_at: null,
      user_id: "user-1",
    })),
  });
  const store = createSupabaseStudioMusicCatalogStore(recording.client);
  const first = await handleStudioMusicCatalog({
    filter: "mine",
    cursor: null,
    limit: "20",
    userId: "user-1",
    store,
  });
  assert.equal(first.status, 200);
  assert.ok("items" in first.body);
  assert.equal(first.body.items.length, 20);
  assert.ok(first.body.nextCursor);
  assert.deepEqual(recording.practiceLimits, [21]);
  assert.equal(recording.materializedPracticeCounts[0], 21);
}

{
  const validId = uuidFromIndex(1);
  const generated = encodeStudioMusicCatalogCursor(
    Date.parse("2026-04-01T00:00:00.000Z"),
    validId,
  );
  const decoded = decodeStudioMusicCatalogCursor(generated);
  assert.ok(decoded);
  assert.equal(decoded.id, validId);
  const filter = buildStudioMusicCatalogCursorOrFilter(decoded);
  assert.ok(filter);
  assert.match(filter, new RegExp(`id\\.lt\\.${validId}`));
}

{
  const rejected = [
    encodeStudioMusicCatalogCursor(Date.parse("2026-04-01T00:00:00.000Z"), "not-a-uuid"),
    `${Date.parse("2026-04-01T00:00:00.000Z")}:pub-1,id.eq.other`,
    `${Date.parse("2026-04-01T00:00:00.000Z")}:foo)or(id.eq.bar`,
    `${Date.parse("2026-04-01T00:00:00.000Z")}:aaaa,and(id.eq.bbbb)`,
    `${Number.MAX_VALUE}:${uuidFromIndex(2)}`,
    `${8.64e15 + 1}:${uuidFromIndex(3)}`,
  ];
  for (const cursor of rejected) {
    assert.equal(
      decodeStudioMusicCatalogCursor(cursor),
      null,
      `expected reject: ${cursor}`,
    );
    assert.equal(buildStudioMusicCatalogCursorOrFilter(decodeStudioMusicCatalogCursor(cursor)), null);
  }
  assert.equal(
    buildStudioMusicCatalogCursorOrFilter({
      sortTimestamp: Date.parse("2026-04-01T00:00:00.000Z"),
      id: "evil,or(id.eq.x)",
    }),
    null,
  );
  assert.doesNotThrow(() => {
    decodeStudioMusicCatalogCursor(`${Number.MAX_VALUE}:${uuidFromIndex(4)}`);
    buildStudioMusicCatalogCursorOrFilter({
      sortTimestamp: Number.MAX_VALUE,
      id: uuidFromIndex(4),
    });
  });
}

{
  const eligible = Array.from({ length: 40 }, (_, index) => publication(index + 800));
  const store = createSupabaseStudioMusicCatalogStore(
    createRecordingSupabase({ practices: eligible }).client,
  );
  const invalid = await handleStudioMusicCatalog({
    filter: "all",
    cursor: `${Date.parse("2026-04-01T00:00:00.000Z")}:not-a-uuid`,
    limit: "20",
    userId: null,
    store,
  });
  assert.deepEqual(invalid, { status: 400, body: { error: "invalid_cursor" } });

  const huge = await handleStudioMusicCatalog({
    filter: "all",
    cursor: `${Number.MAX_VALUE}:${uuidFromIndex(1)}`,
    limit: "20",
    userId: null,
    store,
  });
  assert.deepEqual(huge, { status: 400, body: { error: "invalid_cursor" } });
}

{
  const evilId = "11111111-1111-4111-8111-000000000001,id.eq.hacked";
  const recording = createRecordingSupabase({
    practices: Array.from({ length: 5 }, (_, index) => publication(index + 900)),
  });
  const store = createSupabaseStudioMusicCatalogStore(recording.client);
  await store.listPublicInventory({
    filter: "all",
    cursor: `${Date.parse("2026-04-01T00:00:00.000Z")}:${evilId}`,
    limit: 20,
  });
  const joined = recording.practiceOrFilters.flat().join("\n");
  assert.equal(joined.includes(evilId), false);
  assert.equal(joined.includes("id.eq.hacked"), false);
  assert.match(joined, /catalog_visibility\.eq\.listed/);
}

console.log("studio-music-catalog-pagination-unit: ok");
