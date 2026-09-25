#!/usr/bin/env node
/**
 * MAX catalog: exact host/origin, HMAC, linked MAX identity, safe DTO.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_CATALOG_PATH, MAX_HOSTNAME, MAX_ORIGIN } from "../src/lib/max/host.ts";
import {
  MAX_CATALOG_BODY_MAX_BYTES,
  POST,
  setListMaxPublishedCatalogForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/catalog/route.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICTIONAL_BOT_TOKEN = "test-max-bot-token-not-real-0001";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function signInitData(fields, token = FICTIONAL_BOT_TOKEN) {
  const entries = Object.entries(fields).filter(([key]) => key !== "hash");
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const launchParams = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey).update(launchParams).digest("hex");
  return `${entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}&hash=${hash}`;
}

function currentInitData(extra = {}) {
  return signInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "max-catalog-test-query",
    user: '{"id":101,"first_name":"Catalog"}',
    ...extra,
  });
}

function maxRequest(body, { host = MAX_HOSTNAME, headers = {}, raw } = {}) {
  const payload =
    raw !== undefined
      ? raw
      : typeof body === "string"
        ? body
        : JSON.stringify(body);
  return new Request(`${MAX_ORIGIN}${MAX_CATALOG_PATH}`, {
    method: "POST",
    headers: {
      host,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: payload,
  });
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;

const nativeCalls = [];
const catalogCalls = [];
setResolveMaxNativeUserForTests(async (provider, providerUserId) => {
  nativeCalls.push({ provider, providerUserId });
  return { ok: true, userId: USER_A };
});
setListMaxPublishedCatalogForTests(async (input) => {
  catalogCalls.push(input ?? {});
  return {
    ok: true,
    items: [
      {
        slug: "published-product",
        title: "Опубликованный продукт",
        subtitle: "Короткое описание",
        coverUrl: "https://cdn.example.test/cover.webp",
        authorName: "Автор",
        formatLabel: "Аудиопрактика",
        priceLabel: "Бесплатно",
        isFree: true,
      },
    ],
  };
});

try {
  const successResponse = await POST(
    maxRequest({
      initData: currentInitData(),
      user_id: "browser-selected-user",
      max_user_id: "browser-selected-max",
      maxAuthenticated: true,
    }),
  );
  const success = {
    status: successResponse.status,
    body: await successResponse.json(),
  };
  assert.equal(success.status, 200);
  assert.equal(success.body.ok, true);
  assert.deepEqual(success.body.items, [
    {
      slug: "published-product",
      title: "Опубликованный продукт",
      subtitle: "Короткое описание",
      coverUrl: "https://cdn.example.test/cover.webp",
      authorName: "Автор",
      formatLabel: "Аудиопрактика",
      priceLabel: "Бесплатно",
      isFree: true,
    },
  ]);
  assert.equal(success.body.user_id, undefined);
  assert.equal(success.body.max_user_id, undefined);
  assert.equal(success.body.initData, undefined);
  assert.equal(JSON.stringify(success.body).includes(USER_A), false);
  assert.equal(JSON.stringify(success.body).includes("101"), false);
  assert.equal(nativeCalls.length, 1);
  assert.deepEqual(nativeCalls[0], {
    provider: MAX_EXTERNAL_IDENTITY_PROVIDER,
    providerUserId: "101",
  });
  assert.equal(catalogCalls.length, 1);
  assert.deepEqual(catalogCalls[0], {});
  assert.equal(successResponse.headers.get("cache-control"), "no-store");

  const callsAfterSuccess = {
    native: nativeCalls.length,
    catalog: catalogCalls.length,
  };
  const invalid = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
      }),
    ),
  );
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.reason, "invalid_hash");
  assert.equal(nativeCalls.length, callsAfterSuccess.native);
  assert.equal(catalogCalls.length, callsAfterSuccess.catalog);

  const expired = await readJson(
    await POST(
      maxRequest({
        initData: signInitData({
          auth_date: String(Math.floor(Date.now() / 1000) - 4000),
          user: '{"id":101,"first_name":"Catalog"}',
        }),
      }),
    ),
  );
  assert.equal(expired.status, 401);
  assert.equal(expired.body.reason, "expired");
  assert.equal(nativeCalls.length, callsAfterSuccess.native);
  assert.equal(catalogCalls.length, callsAfterSuccess.catalog);

  setResolveMaxNativeUserForTests(async (provider, providerUserId) => {
    nativeCalls.push({ provider, providerUserId });
    return { ok: true, userId: null };
  });
  const unlinked = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(unlinked.status, 403);
  assert.deepEqual(unlinked.body, { ok: false, reason: "unlinked" });
  assert.equal(catalogCalls.length, callsAfterSuccess.catalog);

  setResolveMaxNativeUserForTests(async (provider, providerUserId) => {
    nativeCalls.push({ provider, providerUserId });
    return { ok: false, reason: "storage_unavailable" };
  });
  const nativeFailure = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(nativeFailure.status, 503);
  assert.deepEqual(nativeFailure.body, {
    ok: false,
    reason: "storage_unavailable",
  });

  setResolveMaxNativeUserForTests(async (provider, providerUserId) => {
    nativeCalls.push({ provider, providerUserId });
    return { ok: true, userId: USER_A };
  });
  setListMaxPublishedCatalogForTests(async () => ({
    ok: false,
    reason: "storage_unavailable",
  }));
  const storageFailure = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(storageFailure.status, 503);
  assert.deepEqual(storageFailure.body, {
    ok: false,
    reason: "storage_unavailable",
  });

  const searchItems = [
    {
      authorSlug: "author",
      slug: "found-product",
      title: "Найденный продукт",
      subtitle: null,
      coverUrl: "https://cdn.example.test/found.webp",
      authorName: "Автор",
      formatLabel: "Аудиопрактика",
      priceLabel: "490 ₽",
      isFree: false,
    },
  ];
  setListMaxPublishedCatalogForTests(async (input) => {
    catalogCalls.push(input ?? {});
    return { ok: true, items: searchItems };
  });
  const beforeSearch = catalogCalls.length;
  const searchResponse = await POST(
    maxRequest({
      initData: currentInitData(),
      query: "  сон  ",
      user_id: USER_A,
      max_user_id: "101",
      maxAuthenticated: true,
    }),
  );
  const search = {
    status: searchResponse.status,
    body: await searchResponse.json(),
  };
  assert.equal(search.status, 200);
  assert.equal(search.body.ok, true);
  assert.deepEqual(search.body.items, searchItems);
  assert.equal(search.body.user_id, undefined);
  assert.equal(search.body.initData, undefined);
  assert.equal(JSON.stringify(search.body).includes(USER_A), false);
  assert.equal(JSON.stringify(search.body).includes("storage"), false);
  assert.equal(searchResponse.headers.get("cache-control"), "no-store");
  assert.equal(catalogCalls.length, beforeSearch + 1);
  assert.deepEqual(catalogCalls.at(-1), { query: "  сон  " });

  const blankResponse = await POST(
    maxRequest({ initData: currentInitData(), query: "   \n\t  " }),
  );
  assert.equal(blankResponse.status, 200);
  assert.deepEqual(catalogCalls.at(-1), { query: "   \n\t  " });

  const callsBeforeRejectedSearch = catalogCalls.length;
  const expiredSearch = await readJson(
    await POST(
      maxRequest({
        initData: signInitData({
          auth_date: String(Math.floor(Date.now() / 1000) - 4000),
          user: '{"id":101,"first_name":"Catalog"}',
        }),
        query: "сон",
      }),
    ),
  );
  assert.equal(expiredSearch.status, 401);
  assert.equal(expiredSearch.body.reason, "expired");
  assert.equal(catalogCalls.length, callsBeforeRejectedSearch);

  const invalidSearch = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
        query: "сон",
      }),
    ),
  );
  assert.equal(invalidSearch.status, 401);
  assert.equal(catalogCalls.length, callsBeforeRejectedSearch);

  setResolveMaxNativeUserForTests(async (provider, providerUserId) => {
    nativeCalls.push({ provider, providerUserId });
    return { ok: true, userId: null };
  });
  const unlinkedSearch = await readJson(
    await POST(maxRequest({ initData: currentInitData(), query: "сон" })),
  );
  assert.equal(unlinkedSearch.status, 403);
  assert.equal(catalogCalls.length, callsBeforeRejectedSearch);

  setResolveMaxNativeUserForTests(async (provider, providerUserId) => {
    nativeCalls.push({ provider, providerUserId });
    return { ok: true, userId: USER_A };
  });
  setListMaxPublishedCatalogForTests(async () => ({
    ok: false,
    reason: "storage_unavailable",
  }));
  const searchStorage = await readJson(
    await POST(maxRequest({ initData: currentInitData(), query: "сон" })),
  );
  assert.equal(searchStorage.status, 503);
  assert.deepEqual(searchStorage.body, {
    ok: false,
    reason: "storage_unavailable",
  });

  const badQuery = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData(),
        query: { q: "сон" },
        user_id: USER_A,
      }),
    ),
  );
  assert.equal(badQuery.status, 400);
  assert.equal(badQuery.body.reason, "invalid_request");

  const oversize = await readJson(
    await POST(maxRequest("x".repeat(MAX_CATALOG_BODY_MAX_BYTES + 1))),
  );
  assert.equal(oversize.status, 413);

  const blockedHost = await readJson(
    await POST(
      maxRequest(
        { initData: currentInitData() },
        { host: "audiolad.ru", headers: { origin: "https://audiolad.ru" } },
      ),
    ),
  );
  assert.equal(blockedHost.status, 404);
} finally {
  setResolveMaxNativeUserForTests(null);
  setListMaxPublishedCatalogForTests(null);
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
const catalogSource = readFileSync(
  join(repoRoot, "src/lib/max/catalog.ts"),
  "utf8",
);
assert.match(routeSource, /verifyMaxInitData/);
assert.match(routeSource, /resolveMaxNativeUser/);
assert.match(routeSource, /listMaxPublishedCatalog/);
assert.ok(
  routeSource.indexOf("verifyMaxInitData(") <
    routeSource.indexOf("resolveMaxNativeUser("),
);
assert.doesNotMatch(routeSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(routeSource, /auth\.getUser|createClientFromRequest|linkExternalIdentity|auth\.admin/);
assert.doesNotMatch(routeSource, /access_token|refresh_token/);
assert.match(catalogSource, /getPublishedCatalogProducts/);
assert.match(catalogSource, /searchPublishedCatalogProducts/);
assert.match(catalogSource, /normalizeCatalogSearchQuery/);
assert.match(catalogSource, /GUEST_ORDINARY_CATALOG_VIEWER/);
assert.match(catalogSource, /\.slice\(0, MAX_CATALOG_LIMIT\)/);
assert.doesNotMatch(catalogSource, /CATALOG_SEARCH_SUGGEST_MIN_LENGTH/);
assert.doesNotMatch(catalogSource, /userId|visitorId|localStorage|auth\.admin/);
assert.doesNotMatch(routeSource, /searchParams|localStorage|body\.user_id|max_user_id|maxAuthenticated/);

console.log("max-catalog-route-unit: ok");
