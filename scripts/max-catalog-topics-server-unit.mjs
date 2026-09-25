#!/usr/bin/env node
/**
 * MAX catalog topics reuse the canonical topic list and topic filter.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATALOG_TOPIC_FILTER_MAX,
  serializeCatalogTopicParam,
  toggleCatalogDraftTopics,
} from "../src/lib/catalog/topic-filter.ts";
import { CATALOG_LISTING_SEARCH_LIMIT } from "../src/lib/catalog/listing.ts";
import { GUEST_ORDINARY_CATALOG_VIEWER } from "../src/lib/catalog/visibility-query.ts";
import {
  listMaxPublishedCatalog,
  parseMaxCatalogAccessParam,
  parseMaxCatalogClassParam,
  parseMaxCatalogTopicParam,
  setListMaxPublishedCatalogForTests,
} from "../src/lib/max/catalog.ts";
import { listMaxCatalogTopics } from "../src/lib/max/catalog-topics.ts";
import {
  MAX_CATALOG_TOPICS_PATH,
  MAX_HOSTNAME,
  MAX_ORIGIN,
} from "../src/lib/max/host.ts";
import {
  POST as postCatalog,
  setListMaxPublishedCatalogForTests as setRouteCatalogForTests,
  setResolveMaxNativeUserForTests as setCatalogUserForTests,
} from "../src/app/api/max/catalog/route.ts";
import {
  POST as postTopics,
  setListMaxCatalogTopicsForTests,
  setResolveMaxNativeUserForTests as setTopicsUserForTests,
} from "../src/app/api/max/catalog/topics/route.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function signInitData(fields, token = FICTIONAL_BOT_TOKEN) {
  const entries = Object.entries(fields).filter(([key]) => key !== "hash");
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const launchParams = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(launchParams).digest("hex");
  return `${entries.map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`).join("&")}&hash=${hash}`;
}

function currentInitData() {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "max-catalog-topics-test",
    user: '{"id":101,"first_name":"Catalog"}',
  });
}

function request(path, body, { host = MAX_HOSTNAME } = {}) {
  return new Request(`${MAX_ORIGIN}${path}`, {
    method: "POST",
    headers: {
      host,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

assert.equal(CATALOG_TOPIC_FILTER_MAX, 3);
assert.deepEqual(toggleCatalogDraftTopics(["sleep", "energy", "focus"], "money"), [
  "sleep",
  "energy",
  "focus",
]);
assert.deepEqual(toggleCatalogDraftTopics(["sleep", "energy"], "focus"), [
  "sleep",
  "energy",
  "focus",
]);
assert.deepEqual(toggleCatalogDraftTopics(["sleep", "energy"], "sleep"), ["energy"]);
assert.equal(serializeCatalogTopicParam(["sleep", "energy"]), "sleep,energy");
assert.equal(serializeCatalogTopicParam([]), null);

assert.deepEqual(parseMaxCatalogTopicParam(undefined), { ok: true, topicKey: null });
assert.deepEqual(parseMaxCatalogTopicParam(null), { ok: true, topicKey: null });
assert.deepEqual(parseMaxCatalogTopicParam(""), { ok: true, topicKey: null });
assert.deepEqual(parseMaxCatalogTopicParam("   "), { ok: true, topicKey: null });
assert.deepEqual(parseMaxCatalogTopicParam(" For-Sleep "), {
  ok: true,
  topicKey: "for-sleep",
});
assert.deepEqual(parseMaxCatalogTopicParam("sleep,sleep"), { ok: true, topicKey: "sleep" });
assert.deepEqual(parseMaxCatalogTopicParam(" sleep , energy "), {
  ok: true,
  topicKey: "sleep,energy",
});
assert.equal(parseMaxCatalogTopicParam("sleep,energy,focus").ok, true);
assert.equal(parseMaxCatalogTopicParam("sleep,energy,focus,money").ok, false);
assert.equal(parseMaxCatalogTopicParam("not a key").ok, false);
assert.equal(parseMaxCatalogTopicParam("ключ").ok, false);
assert.equal(parseMaxCatalogTopicParam(1).ok, false);
assert.equal(parseMaxCatalogTopicParam({ key: "sleep" }).ok, false);

assert.deepEqual(parseMaxCatalogAccessParam(undefined), { ok: true, access: "all" });
assert.deepEqual(parseMaxCatalogAccessParam(" FREE "), { ok: true, access: "free" });
assert.deepEqual(parseMaxCatalogAccessParam("paid"), { ok: true, access: "paid" });
assert.equal(parseMaxCatalogAccessParam("gift").ok, false);
assert.equal(parseMaxCatalogAccessParam(1).ok, false);

assert.deepEqual(parseMaxCatalogClassParam(undefined), { ok: true, class: "all" });
assert.deepEqual(parseMaxCatalogClassParam(" RELEASE "), { ok: true, class: "release" });
assert.deepEqual(parseMaxCatalogClassParam("audiobook"), { ok: true, class: "audiobook" });
assert.equal(parseMaxCatalogClassParam("music").ok, false);
assert.equal(parseMaxCatalogClassParam({}).ok, false);

const topicsLib = readFileSync(join(repoRoot, "src/lib/max/catalog-topics.ts"), "utf8");
const topicsRoute = readFileSync(
  join(repoRoot, "src/app/api/max/catalog/topics/route.ts"),
  "utf8",
);
const catalogSource = readFileSync(join(repoRoot, "src/lib/max/catalog.ts"), "utf8");
assert.match(topicsLib, /listTopicsWithCatalogCountsSafe/);
assert.match(topicsLib, /catalogProductCount > 0/);
assert.match(topicsRoute, /verifyMaxInitData/);
assert.match(topicsRoute, /resolveMaxNativeUser/);
assert.match(topicsRoute, /"Cache-Control": "no-store"/);
assert.doesNotMatch(topicsRoute, /catalogProductCount|description|localStorage/);
assert.match(catalogSource, /getPublishedCatalogProducts/);
assert.match(catalogSource, /searchPublishedCatalogProducts/);
assert.match(catalogSource, /topicKey/);

const listed = await listMaxCatalogTopics({
  getServiceClient: () => ({ role: "service" }),
  listTopics: async (client) => {
    assert.equal(client.role, "service");
    return [
      {
        key: "sleep",
        title: "Для сна",
        catalogProductCount: 2,
        description: "secret",
        id: "secret-id",
      },
      {
        key: "empty",
        title: "Пусто",
        catalogProductCount: 0,
        description: "hidden",
      },
    ];
  },
});
assert.equal(listed.ok, true);
assert.deepEqual(listed.topics, [{ key: "sleep", title: "Для сна" }]);
assert.deepEqual(Object.keys(listed.topics[0]).sort(), ["key", "title"]);
assert.equal(JSON.stringify(listed.topics).includes("secret"), false);
assert.equal(JSON.stringify(listed.topics).includes("catalogProductCount"), false);

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

const card = {
  authorSlug: "author",
  slug: "product-1",
  title: "Продукт",
  subtitle: null,
  coverUrl: null,
  authorName: "Автор",
  productTypeLabel: "Аудиопрактика",
  priceLabel: "490 ₽",
  isFree: false,
};

searchCalls.length = 0;
listCalls.length = 0;
const filteredList = await listMaxPublishedCatalog({
  section: "music",
  topicKey: "for-sleep",
  ...deps([], [card]),
});
assert.equal(filteredList.ok, true);
assert.equal(searchCalls.length, 0);
assert.equal(listCalls.length, 1);
assert.equal(listCalls[0].catalogSection, "music");
assert.equal(listCalls[0].topicKey, "for-sleep");
assert.equal(listCalls[0].throwOnStorageError, true);
assert.deepEqual(listCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);

searchCalls.length = 0;
listCalls.length = 0;
const filteredSearch = await listMaxPublishedCatalog({
  query: "  джаз  ",
  section: "music",
  topicKey: "for-sleep,energy",
  ...deps([card], []),
});
assert.equal(filteredSearch.ok, true);
assert.equal(listCalls.length, 0);
assert.equal(searchCalls.length, 1);
assert.equal(searchCalls[0].query, "джаз");
assert.equal(searchCalls[0].catalogSection, "music");
assert.equal(searchCalls[0].topicKey, "for-sleep,energy");
assert.deepEqual(searchCalls[0].viewer, GUEST_ORDINARY_CATALOG_VIEWER);
assert.equal(searchCalls[0].limit, CATALOG_LISTING_SEARCH_LIMIT);

function catalogProduct(overrides) {
  const isFree = overrides.isFree ?? false;
  const price = isFree ? 0 : (overrides.price ?? 490);
  return {
    id: overrides.id,
    authorId: "author-id",
    title: overrides.title ?? overrides.id,
    slug: overrides.slug,
    subtitle: null,
    description: null,
    format: overrides.format ?? "Аудиопрактика",
    productKind: overrides.productKind ?? "practice",
    publicationClass: overrides.publicationClass ?? null,
    price,
    compareAtPrice: null,
    isFree,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    authorName: "Автор",
    authorSlug: "author",
    href: `/practice/author/${overrides.slug}`,
    meta: null,
    statsLabel: null,
    productTypeLabel: overrides.productTypeLabel ?? "Аудиопрактика",
    priceLabel: isFree ? "Бесплатно" : `${price} ₽`,
    sortTimestamp: overrides.sortTimestamp ?? 1,
    durationSeconds: 600,
    publishedAt: "2026-01-01T00:00:00.000Z",
    gallery: [],
  };
}

const canonicalProducts = [
  catalogProduct({
    id: "free-practice",
    slug: "free-practice",
    isFree: true,
    publicationClass: "practice",
  }),
  catalogProduct({
    id: "paid-music",
    slug: "paid-music",
    productKind: "music",
    publicationClass: "release",
    productTypeLabel: "Музыка",
    price: 790,
  }),
  catalogProduct({
    id: "paid-audiobook",
    slug: "paid-audiobook",
    publicationClass: "audiobook",
    productTypeLabel: "Аудиокнига",
    price: 990,
  }),
];

const accessFiltered = await listMaxPublishedCatalog({
  access: "free",
  ...deps([], canonicalProducts),
});
assert.equal(accessFiltered.ok, true);
assert.deepEqual(accessFiltered.items.map((item) => item.slug), ["free-practice"]);

const classFiltered = await listMaxPublishedCatalog({
  class: "release",
  ...deps([], canonicalProducts),
});
assert.equal(classFiltered.ok, true);
assert.deepEqual(classFiltered.items.map((item) => item.slug), ["paid-music"]);

const combinedFiltered = await listMaxPublishedCatalog({
  access: "paid",
  class: "audiobook",
  ...deps([], canonicalProducts),
});
assert.equal(combinedFiltered.ok, true);
assert.deepEqual(combinedFiltered.items.map((item) => item.slug), ["paid-audiobook"]);

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;
const catalogCalls = [];
setListMaxPublishedCatalogForTests(null);
setCatalogUserForTests(async () => ({ ok: true, userId: USER_A }));
setRouteCatalogForTests(async (input) => {
  catalogCalls.push(input ?? {});
  return { ok: true, items: [] };
});

try {
  const absent = await postCatalog(request("/api/max/catalog", { initData: currentInitData() }));
  assert.equal(absent.status, 200);
  assert.equal(absent.headers.get("cache-control"), "no-store");
  assert.deepEqual(catalogCalls.at(-1), {});

  const nullTopic = await postCatalog(
    request("/api/max/catalog", { initData: currentInitData(), topic: null }),
  );
  assert.equal(nullTopic.status, 200);
  assert.deepEqual(catalogCalls.at(-1), {});

  const canonical = await postCatalog(
    request("/api/max/catalog", {
      initData: currentInitData(),
      topic: " For-Sleep , Energy ",
    }),
  );
  assert.equal(canonical.status, 200);
  assert.deepEqual(catalogCalls.at(-1), { topicKey: "for-sleep,energy" });

  const combined = await postCatalog(
    request("/api/max/catalog", {
      initData: currentInitData(),
      query: "джаз",
      section: "music",
      topic: "for-sleep",
      access: "paid",
      class: "release",
    }),
  );
  assert.equal(combined.status, 200);
  assert.equal(combined.headers.get("cache-control"), "no-store");
  assert.deepEqual(catalogCalls.at(-1), {
    query: "джаз",
    section: "music",
    topicKey: "for-sleep",
    access: "paid",
    class: "release",
  });

  async function assertRejected(topic) {
    const before = catalogCalls.length;
    const response = await postCatalog(
      request("/api/max/catalog", { initData: currentInitData(), topic }),
    );
    const body = await response.json();
    assert.equal(response.status, 400, JSON.stringify(topic));
    assert.equal(body.reason, "invalid_request");
    assert.equal(catalogCalls.length, before);
  }

  await assertRejected("sleep,energy,focus,money");
  await assertRejected("not a key");
  await assertRejected("ключ");
  await assertRejected(2);
  await assertRejected(["sleep"]);

  async function assertRejectedFilter(bodyPatch) {
    const before = catalogCalls.length;
    const response = await postCatalog(
      request("/api/max/catalog", { initData: currentInitData(), ...bodyPatch }),
    );
    const body = await response.json();
    assert.equal(response.status, 400, JSON.stringify(bodyPatch));
    assert.equal(body.reason, "invalid_request");
    assert.equal(catalogCalls.length, before);
  }

  await assertRejectedFilter({ access: "gift" });
  await assertRejectedFilter({ access: 1 });
  await assertRejectedFilter({ class: "music" });
  await assertRejectedFilter({ class: ["release"] });

  const beforeAuth = catalogCalls.length;
  const expired = await postCatalog(
    request("/api/max/catalog", {
      initData: signInitData({
        auth_date: String(Math.floor(Date.now() / 1000) - 4000),
        user: '{"id":101,"first_name":"Catalog"}',
      }),
      topic: "sleep",
    }),
  );
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).reason, "expired");
  assert.equal(catalogCalls.length, beforeAuth);

  setCatalogUserForTests(async () => ({ ok: true, userId: null }));
  const unlinked = await postCatalog(
    request("/api/max/catalog", { initData: currentInitData(), topic: "sleep" }),
  );
  assert.equal(unlinked.status, 403);
  assert.equal((await unlinked.json()).reason, "unlinked");
  assert.equal(catalogCalls.length, beforeAuth);
} finally {
  setCatalogUserForTests(null);
  setRouteCatalogForTests(null);
  setListMaxPublishedCatalogForTests(null);
}

const topicLoads = [];
setTopicsUserForTests(async () => ({ ok: true, userId: USER_A }));
setListMaxCatalogTopicsForTests(async () => {
  topicLoads.push("load");
  return { ok: true, topics: [{ key: "sleep", title: "Для сна" }] };
});

try {
  const ok = await postTopics(
    request(MAX_CATALOG_TOPICS_PATH, { initData: currentInitData() }),
  );
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(topicLoads.length, 1);
  assert.deepEqual(body.topics, [{ key: "sleep", title: "Для сна" }]);
  assert.deepEqual(Object.keys(body.topics[0]).sort(), ["key", "title"]);

  const before = topicLoads.length;
  const expired = await postTopics(
    request(MAX_CATALOG_TOPICS_PATH, {
      initData: signInitData({
        auth_date: String(Math.floor(Date.now() / 1000) - 4000),
        user: '{"id":101,"first_name":"Catalog"}',
      }),
    }),
  );
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).reason, "expired");

  const invalid = await postTopics(
    request(MAX_CATALOG_TOPICS_PATH, {
      initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
    }),
  );
  assert.equal(invalid.status, 401);

  setTopicsUserForTests(async () => ({ ok: true, userId: null }));
  const unlinked = await postTopics(
    request(MAX_CATALOG_TOPICS_PATH, { initData: currentInitData() }),
  );
  assert.equal(unlinked.status, 403);
  assert.equal((await unlinked.json()).reason, "unlinked");
  assert.equal(topicLoads.length, before);

  const foreign = await postTopics(
    request(MAX_CATALOG_TOPICS_PATH, { initData: currentInitData() }, { host: "audiolad.ru" }),
  );
  assert.equal(foreign.status, 404);
  assert.equal(topicLoads.length, before);
} finally {
  setTopicsUserForTests(null);
  setListMaxCatalogTopicsForTests(null);
  if (previousToken === undefined) {
    delete process.env.MAX_BOT_TOKEN;
  } else {
    process.env.MAX_BOT_TOKEN = previousToken;
  }
}

console.log("max-catalog-topics-server-unit: ok");
