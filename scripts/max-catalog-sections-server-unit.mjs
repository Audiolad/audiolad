#!/usr/bin/env node
/**
 * MAX catalog sections reuse the public section filter and the safe catalog DTO.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PUBLIC_CATALOG_SECTION_CARDS } from "../src/lib/catalog/catalog-sections.ts";
import { searchPublishedCatalogProducts } from "../src/lib/catalog/search.ts";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "../src/lib/catalog/visibility-query.ts";
import { MAX_CATALOG_PATH, MAX_HOSTNAME, MAX_ORIGIN } from "../src/lib/max/host.ts";
import {
  MAX_CATALOG_LIMIT,
  listMaxPublishedCatalog,
  setListMaxPublishedCatalogForTests,
} from "../src/lib/max/catalog.ts";
import { getPublishedCatalogProducts } from "../src/lib/products/catalog.ts";
import {
  MAX_CATALOG_BODY_MAX_BYTES,
  POST,
  setListMaxPublishedCatalogForTests as setRouteCatalogForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/catalog/route.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

assert.deepEqual(
  PUBLIC_CATALOG_SECTION_CARDS.map((card) => card.value),
  ["music", "meditations", "education", "stories"],
);

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
    audio_path: "storage/secret.mp3",
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

setListMaxPublishedCatalogForTests(null);

const searchCalls = [];
const listCalls = [];

function deps(search, list) {
  return {
    getServiceClient: () => ({}),
    searchCatalogProducts: async (_client, options) => {
      searchCalls.push(options);
      return search;
    },
    getCatalogProducts: async (_client, options) => {
      listCalls.push(options);
      return list;
    },
  };
}

for (const query of [undefined, null]) {
  searchCalls.length = 0;
  listCalls.length = 0;
  const listed = await listMaxPublishedCatalog({
    query,
    ...deps([], [catalogCard(1)]),
  });
  assert.equal(listed.ok, true);
  assert.equal(searchCalls.length, 0, `search ran for query ${JSON.stringify(query)}`);
  assert.equal(listCalls.length, 1);
  assert.equal(listCalls[0].catalogSection, undefined);
  assert.equal(listCalls[0].throwOnStorageError, true);
  assert.deepEqual(listCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);
  assertSafeDto(listed.items);
}

searchCalls.length = 0;
listCalls.length = 0;
const nullSection = await listMaxPublishedCatalog({
  section: null,
  ...deps([], [catalogCard(2, { isFree: true, priceLabel: "Подарок" })]),
});
assert.equal(nullSection.ok, true);
assert.equal(searchCalls.length, 0);
assert.equal(listCalls.length, 1);
assert.equal(listCalls[0].catalogSection, undefined);
assert.equal(listCalls[0].throwOnStorageError, true);
assert.deepEqual(listCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);
assert.equal(nullSection.items[0].isFree, true);
assertSafeDto(nullSection.items);

for (const section of ["music", "meditations", "education", "stories"]) {
  searchCalls.length = 0;
  listCalls.length = 0;
  const listed = await listMaxPublishedCatalog({
    section,
    ...deps([], [catalogCard(3)]),
  });
  assert.equal(listed.ok, true);
  assert.equal(searchCalls.length, 0, section);
  assert.equal(listCalls.length, 1);
  assert.equal(listCalls[0].catalogSection, section);
  assert.equal(listCalls[0].throwOnStorageError, true);
  assert.deepEqual(listCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);
  assert.deepEqual(Object.keys(listCalls[0]).sort(), [
    "catalogSection",
    "throwOnStorageError",
    "viewer",
  ]);
  assertSafeDto(listed.items);
}

searchCalls.length = 0;
listCalls.length = 0;
const both = await listMaxPublishedCatalog({
  query: "  сон   и   тишина  ",
  section: "meditations",
  ...deps([catalogCard(4)], []),
});
assert.equal(both.ok, true);
assert.equal(listCalls.length, 0);
assert.equal(searchCalls.length, 1);
assert.equal(searchCalls[0].query, "сон и тишина");
assert.equal(searchCalls[0].catalogSection, "meditations");
assert.deepEqual(searchCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);
assert.deepEqual(Object.keys(searchCalls[0]).sort(), [
  "catalogSection",
  "query",
  "viewer",
]);
assertSafeDto(both.items);

const many = Array.from({ length: MAX_CATALOG_LIMIT + 8 }, (_, index) =>
  catalogCard(index + 1),
);
const capped = await listMaxPublishedCatalog({
  section: "stories",
  ...deps([], many),
});
assert.equal(capped.ok, true);
assert.equal(capped.items.length, MAX_CATALOG_LIMIT);
assert.equal(MAX_CATALOG_LIMIT, 24);
assertSafeDto(capped.items);

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
    catalog_section: overrides.catalog_section,
    updated_at: "2026-01-01T00:00:00.000Z",
    published_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    authors: overrides.authors,
  };
}

const dataset = {
  practices: [
    practiceRow({
      id: SECRET_ID,
      author_id: "author-ivan",
      title: "Сон и тишина",
      slug: "son-music",
      catalog_section: "music",
      authors: { name: "Иван", slug: "ivan" },
    }),
    practiceRow({
      id: "draft-secret-id",
      author_id: "author-ivan",
      title: "Сон черновик",
      slug: "son-draft",
      status: "draft",
      catalog_section: "music",
      authors: { name: "Иван", slug: "ivan" },
    }),
    practiceRow({
      id: "unlisted-secret-id",
      author_id: "author-ivan",
      title: "Сон скрытый",
      slug: "son-unlisted",
      catalog_visibility: "unlisted",
      is_catalog_listed: false,
      catalog_section: "music",
      authors: { name: "Иван", slug: "ivan" },
    }),
    practiceRow({
      id: "meditation-id",
      author_id: "author-ivan",
      title: "Сон практика",
      slug: "son-practice",
      catalog_section: "meditations",
      authors: { name: "Иван", slug: "ivan" },
    }),
  ],
  authors: [{ id: "author-ivan", name: "Иван" }],
};

const sectionOnly = createSearchSupabase(dataset);
const sectionOnlyResult = await listMaxPublishedCatalog({
  section: "music",
  getServiceClient: () => sectionOnly.client,
  getCatalogProducts: getPublishedCatalogProducts,
});
assert.equal(sectionOnlyResult.ok, true);
assert.deepEqual(
  sectionOnlyResult.items.map((item) => item.slug),
  ["son-music"],
);
assert.equal(JSON.stringify(sectionOnlyResult.items).includes(SECRET_ID), false);
assert.equal(JSON.stringify(sectionOnlyResult.items).includes("son-draft"), false);
assert.equal(JSON.stringify(sectionOnlyResult.items).includes("son-unlisted"), false);
assert.equal(JSON.stringify(sectionOnlyResult.items).includes("son-practice"), false);
const sectionPracticeCalls = sectionOnly.calls.filter((call) => call.table === "practices");
assert.ok(sectionPracticeCalls.length > 0);
for (const call of sectionPracticeCalls) {
  assert.ok(
    call.filters.some(
      (filter) =>
        filter.op === "eq" &&
        filter.args[0] === "catalog_section" &&
        filter.args[1] === "music",
    ),
  );
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
}

const sectionSearch = createSearchSupabase(dataset);
const sectionSearchResult = await listMaxPublishedCatalog({
  query: "сон",
  section: "music",
  getServiceClient: () => sectionSearch.client,
  searchCatalogProducts: searchPublishedCatalogProducts,
});
assert.equal(sectionSearchResult.ok, true);
assert.deepEqual(
  sectionSearchResult.items.map((item) => item.slug),
  ["son-music"],
);
assert.equal(JSON.stringify(sectionSearchResult.items).includes("son-practice"), false);
assert.equal(JSON.stringify(sectionSearchResult.items).includes("son-draft"), false);
assert.equal(JSON.stringify(sectionSearchResult.items).includes("son-unlisted"), false);
assert.ok(
  sectionSearch.calls.some(
    (call) =>
      call.table === "practices" &&
      call.filters.some(
        (filter) =>
          filter.op === "eq" &&
          filter.args[0] === "catalog_section" &&
          filter.args[1] === "music",
      ),
  ),
);

function signInitData(fields, token = FICTIONAL_BOT_TOKEN) {
  const entries = Object.entries(fields).filter(([key]) => key !== "hash");
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const launchParams = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(launchParams).digest("hex");
  return `${entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}&hash=${hash}`;
}

function currentInitData() {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "max-catalog-sections-test",
    user: '{"id":101,"first_name":"Catalog"}',
  });
}

function maxRequest(body, { host = MAX_HOSTNAME, headers = {} } = {}) {
  return new Request(`${MAX_ORIGIN}${MAX_CATALOG_PATH}`, {
    method: "POST",
    headers: {
      host,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function readJson(response) {
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: await response.json(),
  };
}

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;
const catalogCalls = [];
setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: USER_A }));
setRouteCatalogForTests(async (input) => {
  catalogCalls.push(input ?? {});
  return {
    ok: true,
    items: [catalogCard(9)].map((item) => ({
      authorSlug: item.authorSlug,
      slug: item.slug,
      title: item.title,
      subtitle: item.subtitle,
      coverUrl: item.coverUrl,
      authorName: item.authorName,
      formatLabel: item.productTypeLabel,
      priceLabel: item.priceLabel,
      isFree: item.isFree,
    })),
  };
});

try {
  const absent = await readJson(await POST(maxRequest({ initData: currentInitData() })));
  assert.equal(absent.status, 200);
  assert.equal(absent.cacheControl, "no-store");
  assert.deepEqual(catalogCalls.at(-1), {});
  assertSafeDto(absent.body.items);

  const explicitNull = await readJson(
    await POST(maxRequest({ initData: currentInitData(), section: null })),
  );
  assert.equal(explicitNull.status, 200);
  assert.equal(explicitNull.cacheControl, "no-store");
  assert.deepEqual(catalogCalls.at(-1), {});

  const canonicalMusic = await readJson(
    await POST(maxRequest({ initData: currentInitData(), section: " MUSIC " })),
  );
  assert.equal(canonicalMusic.status, 200);
  assert.equal(canonicalMusic.cacheControl, "no-store");
  assert.deepEqual(catalogCalls.at(-1), { section: "music" });

  for (const section of ["music", "meditations", "education", "stories"]) {
    const response = await readJson(
      await POST(maxRequest({ initData: currentInitData(), section })),
    );
    assert.equal(response.status, 200, section);
    assert.equal(response.cacheControl, "no-store");
    assert.deepEqual(catalogCalls.at(-1), { section });
    assertSafeDto(response.body.items);
  }

  const withQuery = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData(),
        query: "  сон  ",
        section: " Meditations ",
      }),
    ),
  );
  assert.equal(withQuery.status, 200);
  assert.equal(withQuery.cacheControl, "no-store");
  assert.deepEqual(catalogCalls.at(-1), {
    query: "  сон  ",
    section: "meditations",
  });

  async function assertRejected(section) {
    const before = catalogCalls.length;
    const response = await readJson(
      await POST(maxRequest({ initData: currentInitData(), section })),
    );
    assert.equal(response.status, 400, JSON.stringify(section));
    assert.equal(response.body.reason, "invalid_request");
    assert.equal(catalogCalls.length, before, JSON.stringify(section));
  }

  await assertRejected("books");
  await assertRejected("BOOKS");
  await assertRejected("not-a-section");
  await assertRejected("");
  await assertRejected("   ");
  await assertRejected(1);
  await assertRejected({ value: "music" });

  const beforeRejectedAuth = catalogCalls.length;
  const expired = await readJson(
    await POST(
      maxRequest({
        initData: signInitData({
          auth_date: String(Math.floor(Date.now() / 1000) - 4000),
          user: '{"id":101,"first_name":"Catalog"}',
        }),
        section: "music",
      }),
    ),
  );
  assert.equal(expired.status, 401);
  assert.equal(expired.body.reason, "expired");
  assert.equal(catalogCalls.length, beforeRejectedAuth);

  const invalidHash = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
        section: "stories",
      }),
    ),
  );
  assert.equal(invalidHash.status, 401);
  assert.equal(catalogCalls.length, beforeRejectedAuth);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  const unlinked = await readJson(
    await POST(maxRequest({ initData: currentInitData(), section: "education" })),
  );
  assert.equal(unlinked.status, 403);
  assert.equal(unlinked.body.reason, "unlinked");
  assert.equal(catalogCalls.length, beforeRejectedAuth);

  assert.equal(MAX_CATALOG_BODY_MAX_BYTES > 0, true);
} finally {
  setResolveMaxNativeUserForTests(null);
  setListMaxPublishedCatalogForTests(null);
  setRouteCatalogForTests(null);
  if (previousToken === undefined) {
    delete process.env.MAX_BOT_TOKEN;
  } else {
    process.env.MAX_BOT_TOKEN = previousToken;
  }
}

const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/catalog/route.ts"),
  "utf8",
);
const catalogSource = readFileSync(join(repoRoot, "src/lib/max/catalog.ts"), "utf8");
assert.match(routeSource, /parsePublicCatalogSection/);
assert.doesNotMatch(routeSource, /isCatalogSection\(/);
assert.match(catalogSource, /GUEST_ORDINARY_CATALOG_VIEWER/);
assert.match(catalogSource, /\.slice\(0, MAX_CATALOG_LIMIT\)/);
assert.match(catalogSource, /catalogSection/);
assert.match(routeSource, /"Cache-Control": "no-store"/);

console.log("max-catalog-sections-server-unit: ok");
