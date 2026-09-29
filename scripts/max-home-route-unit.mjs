#!/usr/bin/env node
/**
 * POST /api/max/home: exact host/origin, HMAC, then guest catalog shelves.
 * A linked AudioLad account is not required. The DTO stays small.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_HOME_PATH, MAX_HOSTNAME, MAX_ORIGIN } from "../src/lib/max/host.ts";
import { MAX_HOME_SHELF_LIMIT, MAX_HOME_SHELVES } from "../src/lib/max/home.ts";
import {
  MAX_HOME_BODY_MAX_BYTES,
  POST,
  setListMaxPublishedCatalogForTests,
} from "../src/app/api/max/home/route.ts";

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
    query_id: "max-home-test-query",
    user: '{"id":101,"first_name":"Home"}',
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
  return new Request(`${MAX_ORIGIN}${MAX_HOME_PATH}`, {
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

function product(index, extra = {}) {
  return {
    id: `11111111-1111-4111-8111-11111111111${index}`,
    storagePath: `private/audio/${index}.mp3`,
    user_id: USER_A,
    access_token: "secret-token",
    authorSlug: "author",
    slug: `product-${index}`,
    title: `Продукт ${index}`,
    subtitle: "Коротко",
    coverUrl: `https://cdn.example.test/${index}.webp`,
    authorName: "Автор",
    formatLabel: "Аудиопрактика",
    priceLabel: index % 2 === 0 ? "Бесплатно" : "490 ₽",
    isFree: index % 2 === 0,
    ...extra,
  };
}

const previousToken = process.env.MAX_BOT_TOKEN;
process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;

const catalogCalls = [];
setListMaxPublishedCatalogForTests(async (input) => {
  catalogCalls.push(input ?? {});
  if (input?.access === "free") {
    return { ok: true, items: Array.from({ length: 8 }, (_, index) => product(index)) };
  }
  if (input?.section === "music") {
    return { ok: true, items: [product(20, { slug: "music-track", title: "Музыкальный трек" })] };
  }
  if (input?.section === "meditations") {
    return { ok: true, items: [] };
  }
  return { ok: true, items: [product(99, { title: "Лишний продукт" })] };
});

try {
  const successResponse = await POST(
    maxRequest({
      initData: currentInitData(),
      user_id: USER_A,
      max_user_id: "101",
      maxAuthenticated: true,
    }),
  );
  const success = {
    status: successResponse.status,
    body: await successResponse.json(),
  };
  assert.equal(success.status, 200);
  assert.equal(success.body.ok, true);
  assert.equal(successResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(catalogCalls, [
    { access: "free" },
    { section: "music" },
    { section: "meditations" },
  ]);
  for (const call of catalogCalls) {
    assert.equal(call.viewer, undefined);
    assert.equal(call.userId, undefined);
    assert.equal(call.query, undefined);
    assert.equal(Object.hasOwn(call, "user_id"), false);
  }
  assert.equal(success.body.shelves.free.length, MAX_HOME_SHELF_LIMIT);
  assert.equal(success.body.shelves.free.length, 6);
  assert.equal(success.body.shelves.music.length, 1);
  assert.equal(success.body.shelves.music[0].title, "Музыкальный трек");
  assert.deepEqual(success.body.shelves.meditations, []);
  assert.equal(success.body.shelves.free[0].slug, "product-0");
  assert.equal(success.body.shelves.free[0].authorSlug, "author");
  assert.equal(success.body.user_id, undefined);
  assert.equal(success.body.initData, undefined);
  const encoded = JSON.stringify(success.body);
  assert.equal(encoded.includes(USER_A), false);
  assert.equal(encoded.includes("storagePath"), false);
  assert.equal(encoded.includes("access_token"), false);
  assert.equal(encoded.includes("secret-token"), false);
  assert.equal(encoded.includes("11111111-1111-4111-8111"), false);
  assert.equal(encoded.includes("101"), false);
  assert.equal(success.body.shelves.free[0].id, undefined);

  const callsAfterSuccess = catalogCalls.length;
  const invalid = await readJson(
    await POST(
      maxRequest({
        initData: currentInitData().replace(/hash=[0-9a-f]+/, "hash=ff"),
      }),
    ),
  );
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.reason, "invalid_hash");
  assert.equal(invalid.body.shelves, undefined);
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const expired = await readJson(
    await POST(
      maxRequest({
        initData: signInitData({
          auth_date: String(Math.floor(Date.now() / 1000) - 4000),
          user: '{"id":101,"first_name":"Home"}',
        }),
      }),
    ),
  );
  assert.equal(expired.status, 401);
  assert.equal(expired.body.reason, "expired");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const emptyInit = await readJson(await POST(maxRequest({ initData: "" })));
  assert.equal(emptyInit.status, 400);
  assert.equal(emptyInit.body.reason, "empty_init_data");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const missingInit = await readJson(await POST(maxRequest({})));
  assert.equal(missingInit.status, 400);
  assert.equal(missingInit.body.reason, "invalid_request");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const blockedHost = await readJson(
    await POST(
      maxRequest(
        { initData: currentInitData() },
        { host: "audiolad.ru", headers: { origin: "https://audiolad.ru" } },
      ),
    ),
  );
  assert.equal(blockedHost.status, 404);
  assert.equal(blockedHost.body.reason, "forbidden_host");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const blockedOrigin = await readJson(
    await POST(
      maxRequest(
        { initData: currentInitData() },
        { headers: { origin: "https://evil.example" } },
      ),
    ),
  );
  assert.equal(blockedOrigin.status, 403);
  assert.equal(blockedOrigin.body.reason, "forbidden_origin");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  const oversize = await readJson(
    await POST(maxRequest("x".repeat(MAX_HOME_BODY_MAX_BYTES + 1))),
  );
  assert.equal(oversize.status, 413);
  assert.equal(oversize.body.reason, "payload_too_large");
  assert.equal(catalogCalls.length, callsAfterSuccess);

  delete process.env.MAX_BOT_TOKEN;
  const missingToken = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(missingToken.status, 503);
  assert.equal(missingToken.body.reason, "service_unavailable");
  assert.equal(catalogCalls.length, callsAfterSuccess);
  process.env.MAX_BOT_TOKEN = FICTIONAL_BOT_TOKEN;

  setListMaxPublishedCatalogForTests(async (input) => {
    catalogCalls.push(input ?? {});
    if (input?.section === "music") {
      return { ok: false, reason: "storage_unavailable" };
    }
    return { ok: true, items: [product(1)] };
  });
  const storageFailure = await readJson(
    await POST(maxRequest({ initData: currentInitData() })),
  );
  assert.equal(storageFailure.status, 503);
  assert.deepEqual(storageFailure.body, {
    ok: false,
    reason: "storage_unavailable",
  });
  assert.equal(storageFailure.body.shelves, undefined);
} finally {
  setListMaxPublishedCatalogForTests(null);
  if (previousToken === undefined) {
    delete process.env.MAX_BOT_TOKEN;
  } else {
    process.env.MAX_BOT_TOKEN = previousToken;
  }
}

const routeSource = readFileSync(
  join(repoRoot, "src/app/api/max/home/route.ts"),
  "utf8",
);
const catalogSource = readFileSync(join(repoRoot, "src/lib/max/catalog.ts"), "utf8");
const homeSource = readFileSync(join(repoRoot, "src/lib/max/home.ts"), "utf8");
assert.match(routeSource, /verifyMaxInitData/);
assert.match(routeSource, /Promise\.all/);
assert.match(routeSource, /listMaxPublishedCatalog/);
assert.ok(
  routeSource.indexOf("verifyMaxInitData(") < routeSource.indexOf("listMaxPublishedCatalog("),
);
assert.doesNotMatch(routeSource, /resolveMaxNativeUser|getPublishedCatalogProducts|searchPublishedCatalogProducts/);
assert.doesNotMatch(routeSource, /"unlinked"|auth\.getUser|createClientFromRequest|linkExternalIdentity|auth\.admin/);
assert.doesNotMatch(routeSource, /access_token|refresh_token|body\.user_id|max_user_id|maxAuthenticated/);
assert.doesNotMatch(routeSource, /console\.(log|info|debug|warn|error)/);
assert.doesNotMatch(routeSource, /localStorage|searchParams/);
assert.match(catalogSource, /GUEST_ORDINARY_CATALOG_VIEWER/);
assert.match(homeSource, /access: "free"/);
assert.match(homeSource, /section: "music"/);
assert.match(homeSource, /section: "meditations"/);
assert.deepEqual(
  MAX_HOME_SHELVES.map((shelf) => ({
    id: shelf.id,
    section: shelf.section,
    access: shelf.access,
  })),
  [
    { id: "free", section: null, access: "free" },
    { id: "music", section: "music", access: "all" },
    { id: "meditations", section: "meditations", access: "all" },
  ],
);
assert.equal(MAX_HOME_PATH, "/api/max/home");

console.log("max-home-route-unit: ok");
