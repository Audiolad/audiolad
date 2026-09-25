#!/usr/bin/env node
/**
 * MAX catalog search uses canonical published search, then the safe MAX DTO.
 */
import assert from "node:assert/strict";

import {
  CATALOG_SEARCH_MAX_LENGTH,
  searchPublishedCatalogProducts,
} from "../src/lib/catalog/search.ts";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "../src/lib/catalog/visibility-query.ts";
import {
  listMaxPublishedCatalog,
  MAX_CATALOG_LIMIT,
  setListMaxPublishedCatalogForTests,
} from "../src/lib/max/catalog.ts";

const SECRET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function catalogCard(index, extras = {}) {
  return {
    id: `${SECRET_ID}-${index}`,
    authorId: "author-secret",
    authorSlug: "author",
    slug: `product-${index}`,
    title: `Продукт ${index}`,
    subtitle: null,
    coverUrl: "https://cdn.example.test/cover.webp",
    authorName: "Автор",
    productTypeLabel: "Аудиопрактика",
    priceLabel: "490 ₽",
    isFree: false,
    description: "secret description",
    href: "/practice/author/product",
    ...extras,
  };
}

function assertSafeDto(items) {
  assert.ok(items.length > 0);
  for (const item of items) {
    assert.deepEqual(Object.keys(item).sort(), [
      "authorName",
      "authorSlug",
      "coverUrl",
      "formatLabel",
      "isFree",
      "priceLabel",
      "slug",
      "subtitle",
      "title",
    ]);
    assert.equal(JSON.stringify(item).includes(SECRET_ID), false);
    assert.equal(JSON.stringify(item).includes("audio_path"), false);
    assert.equal(JSON.stringify(item).includes("storage"), false);
  }
}

const searchCalls = [];
const listCalls = [];

const forwarded = await listMaxPublishedCatalog({
  query: "  деньги   и   спокойствие  ",
  getServiceClient: () => ({ from: () => { throw new Error("unused"); } }),
  searchCatalogProducts: async (_client, options) => {
    searchCalls.push(options);
    return [catalogCard(1), catalogCard(2, { authorSlug: "", slug: "missing-author" })];
  },
  getCatalogProducts: async () => {
    listCalls.push("list");
    return [];
  },
});

assert.equal(forwarded.ok, true);
assert.equal(searchCalls.length, 1);
assert.equal(listCalls.length, 0);
assert.equal(searchCalls[0].query, "деньги и спокойствие");
assert.deepEqual(searchCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);
assert.equal(searchCalls[0].limit, undefined);
assert.deepEqual(Object.keys(searchCalls[0]).sort(), ["query", "viewer"]);
assert.equal(forwarded.items.length, 1);
assert.equal(forwarded.items[0].slug, "product-1");
assert.equal(forwarded.items[0].formatLabel, "Аудиопрактика");
assertSafeDto(forwarded.items);

const longQuery = "я".repeat(CATALOG_SEARCH_MAX_LENGTH + 25);
searchCalls.length = 0;
const limitedQuery = await listMaxPublishedCatalog({
  query: longQuery,
  getServiceClient: () => ({}),
  searchCatalogProducts: async (_client, options) => {
    searchCalls.push(options);
    return [];
  },
});
assert.equal(limitedQuery.ok, true);
assert.equal(searchCalls[0].query.length, CATALOG_SEARCH_MAX_LENGTH);
assert.deepEqual(searchCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);

for (const query of [undefined, null, "", "   ", " \n\t "]) {
  searchCalls.length = 0;
  listCalls.length = 0;
  const listed = await listMaxPublishedCatalog({
    query,
    getServiceClient: () => ({}),
    searchCatalogProducts: async () => {
      searchCalls.push("search");
      return [];
    },
    getCatalogProducts: async (_client, options) => {
      listCalls.push(options);
      return [catalogCard(3, { isFree: true, priceLabel: "Подарок" })];
    },
  });
  assert.equal(searchCalls.length, 0, `search must not run for ${JSON.stringify(query)}`);
  assert.equal(listCalls.length, 1);
  assert.deepEqual(listCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);
  assert.equal(listCalls[0].throwOnStorageError, true);
  assert.equal(listed.ok, true);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].isFree, true);
}

const many = Array.from({ length: MAX_CATALOG_LIMIT + 6 }, (_, index) =>
  catalogCard(index + 1),
);
const capped = await listMaxPublishedCatalog({
  query: "практика",
  getServiceClient: () => ({}),
  searchCatalogProducts: async () => many,
});
assert.equal(capped.ok, true);
assert.equal(capped.items.length, MAX_CATALOG_LIMIT);
assert.equal(capped.items.at(-1).slug, `product-${MAX_CATALOG_LIMIT}`);
assertSafeDto(capped.items);

const storageFailure = await listMaxPublishedCatalog({
  query: "сон",
  getServiceClient: () => {
    throw new Error("published_catalog_storage_unavailable");
  },
});
assert.deepEqual(storageFailure, { ok: false, reason: "storage_unavailable" });

const searchFailure = await listMaxPublishedCatalog({
  query: "сон",
  getServiceClient: () => ({}),
  searchCatalogProducts: async () => {
    throw new Error("search_storage_unavailable");
  },
});
assert.deepEqual(searchFailure, { ok: false, reason: "storage_unavailable" });

function ilikeMatch(value, pattern) {
  const needle = String(pattern)
    .replaceAll("\\%", "%")
    .replaceAll("\\_", "_")
    .replaceAll("%", "")
    .toLowerCase();
  return String(value ?? "").toLowerCase().includes(needle);
}

function applyFilters(rows, filters) {
  let next = rows.slice();
  for (const filter of filters) {
    if (filter.op === "eq") {
      const [column, value] = filter.args;
      next = next.filter((row) => row[column] === value);
    } else if (filter.op === "not") {
      const [column, operator, value] = filter.args;
      if (operator === "is" && value === null) {
        next = next.filter((row) => row[column] != null);
      }
    } else if (filter.op === "in") {
      const [column, values] = filter.args;
      const allowed = new Set(values);
      next = next.filter((row) => allowed.has(row[column]));
    } else if (filter.op === "ilike") {
      const [column, pattern] = filter.args;
      next = next.filter((row) => ilikeMatch(row[column], pattern));
    } else if (filter.op === "or") {
      const expression = String(filter.args[0]);
      const needle = expression.match(/title\.ilike\."%([\s\S]*?)%"/)?.[1];
      if (needle) {
        const normalized = needle.replaceAll('""', '"').toLowerCase();
        next = next.filter((row) =>
          [row.title, row.subtitle, row.description, row.format]
            .filter(Boolean)
            .join("\n")
            .toLowerCase()
            .includes(normalized),
        );
      }
    }
  }
  const limit = filters.findLast((filter) => filter.op === "limit");
  if (limit) {
    next = next.slice(0, limit.args[0]);
  }
  return next;
}

function createSearchSupabase(dataset) {
  const calls = [];
  function builder(table) {
    const filters = [];
    const api = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve, reject) => {
              const snapshot = filters.map((filter) => ({
                op: filter.op,
                args: filter.args,
              }));
              calls.push({ table, filters: snapshot });
              const source =
                table === "practices"
                  ? dataset.practices
                  : table === "authors"
                    ? dataset.authors
                    : [];
              const data = applyFilters(source, snapshot);
              return Promise.resolve({ data, error: null }).then(resolve, reject);
            };
          }
          return (...args) => {
            filters.push({ op: String(prop), args });
            return api;
          };
        },
      },
    );
    return api;
  }

  return {
    calls,
    client: {
      from(table) {
        return builder(table);
      },
    },
  };
}

function practiceRow(overrides) {
  return {
    id: overrides.id,
    author_id: overrides.author_id,
    title: overrides.title,
    slug: overrides.slug,
    subtitle: overrides.subtitle ?? null,
    description: overrides.description ?? null,
    format: overrides.format ?? "Аудиопрактика",
    product_kind: "practice",
    publication_class: null,
    duration_minutes: 12,
    price: 0,
    is_free: true,
    cover_url: "https://cdn.example.test/cover.webp",
    cover_image: null,
    status: overrides.status ?? "published",
    is_catalog_listed: overrides.is_catalog_listed ?? true,
    catalog_visibility: overrides.catalog_visibility ?? "listed",
    updated_at: "2026-01-01T00:00:00.000Z",
    published_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    authors: overrides.authors,
  };
}

const publishedListed = practiceRow({
  id: SECRET_ID,
  author_id: "author-ivan",
  title: "Сон и тишина",
  slug: "son-i-tishina",
  authors: { name: "Иван", slug: "ivan" },
});
const draft = practiceRow({
  id: "draft-secret-id",
  author_id: "author-ivan",
  title: "Сон черновик",
  slug: "son-draft",
  status: "draft",
  authors: { name: "Иван", slug: "ivan" },
});
const unlisted = practiceRow({
  id: "unlisted-secret-id",
  author_id: "author-ivan",
  title: "Сон из библиотеки",
  slug: "son-unlisted",
  catalog_visibility: "unlisted",
  is_catalog_listed: false,
  authors: { name: "Иван", slug: "ivan" },
});
const authorMatch = practiceRow({
  id: "author-match-id",
  author_id: "author-maria",
  title: "Утренний свет",
  slug: "utrenniy-svet",
  authors: { name: "Мария Ладова", slug: "maria" },
});
const limitPractices = Array.from({ length: 30 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return practiceRow({
    id: `limit-${number}`,
    author_id: "author-ivan",
    title: `Лимит практика ${number}`,
    slug: `limit-${number}`,
    authors: { name: "Иван", slug: "ivan" },
  });
});

const dataset = {
  practices: [draft, unlisted, publishedListed, authorMatch, ...limitPractices],
  authors: [
    { id: "author-ivan", name: "Иван" },
    { id: "author-maria", name: "Мария Ладова" },
  ],
};

setListMaxPublishedCatalogForTests(null);

const canonical = createSearchSupabase(dataset);
const canonicalResult = await listMaxPublishedCatalog({
  query: "сон",
  getServiceClient: () => canonical.client,
  searchCatalogProducts: searchPublishedCatalogProducts,
});

assert.equal(canonicalResult.ok, true, "canonical search should succeed");
assert.deepEqual(
  canonicalResult.items.map((item) => item.slug),
  ["son-i-tishina"],
);
assert.equal(canonicalResult.items[0].authorName, "Иван");
assert.equal(canonicalResult.items[0].authorSlug, "ivan");
assert.equal(canonicalResult.items[0].isFree, true);
assert.equal(JSON.stringify(canonicalResult.items).includes(SECRET_ID), false);
assert.equal(JSON.stringify(canonicalResult.items).includes("son-draft"), false);
assert.equal(JSON.stringify(canonicalResult.items).includes("son-unlisted"), false);

const practiceCalls = canonical.calls.filter((call) => call.table === "practices");
assert.ok(practiceCalls.length > 0);
for (const call of practiceCalls) {
  assert.ok(
    call.filters.some(
      (filter) =>
        filter.op === "eq" && filter.args[0] === "status" && filter.args[1] === "published",
    ),
  );
  assert.ok(
    call.filters.some(
      (filter) =>
        filter.op === "eq" &&
        filter.args[0] === "catalog_visibility" &&
        filter.args[1] === "listed",
    ),
  );
  assert.equal(
    call.filters.some(
      (filter) => filter.op === "or" && String(filter.args[0]).includes("selected_users"),
    ),
    false,
  );
}

const authorName = createSearchSupabase(dataset);
const authorResult = await listMaxPublishedCatalog({
  query: "Мария",
  getServiceClient: () => authorName.client,
});
assert.equal(authorResult.ok, true);
assert.deepEqual(
  authorResult.items.map((item) => item.slug),
  ["utrenniy-svet"],
);
assert.equal(authorResult.items[0].authorName, "Мария Ладова");
assert.ok(
  authorName.calls.some(
    (call) =>
      call.table === "authors" &&
      call.filters.some(
        (filter) =>
          filter.op === "ilike" &&
          filter.args[0] === "name" &&
          String(filter.args[1]).includes("Мария"),
      ),
  ),
);

const cappedCanonical = createSearchSupabase(dataset);
const cappedCanonicalResult = await listMaxPublishedCatalog({
  query: "Лимит",
  getServiceClient: () => cappedCanonical.client,
});
assert.equal(cappedCanonicalResult.ok, true);
assert.equal(cappedCanonicalResult.items.length, MAX_CATALOG_LIMIT);
assert.equal(cappedCanonicalResult.items[0].slug, "limit-01");
assert.equal(cappedCanonicalResult.items.at(-1).slug, `limit-${String(MAX_CATALOG_LIMIT).padStart(2, "0")}`);
assert.equal(
  cappedCanonicalResult.items.some((item) => item.slug === "limit-30"),
  false,
);

console.log("max-catalog-search-server-unit: ok");
