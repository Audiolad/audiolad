import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_HOSTNAME, MAX_ORIGIN, MAX_RATING_PATH } from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  POST,
  setMaxRatingDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/rating/route.ts";

const token = "test-max-bot-token-not-real-0001";
const linkedUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const routeSource = readFileSync(join(process.cwd(), "src/app/api/max/rating/route.ts"), "utf8");
const ratingSource = readFileSync(join(process.cwd(), "src/lib/max/rating.ts"), "utf8");
assert.match(routeSource, /readMaxAuthenticatedPost/);
assert.match(ratingSource, /evaluatePracticeRatingGate/);
assert.match(ratingSource, /applyOwnPracticeRating/);
assert.match(ratingSource, /resolveListenApiDecision/);
assert.doesNotMatch(`${routeSource}\n${ratingSource}`, /body\.userId|body\.user_id|body\.max_user_id|initDataUnsafe/);
assert.doesNotMatch(ratingSource, /createClientFromRequest/);

function init(extra = {}) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":101}', ...extra };
  const data = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", key).update(data).digest("hex");
  return Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") + `&hash=${hash}`;
}

function request(body) {
  return new Request(`${MAX_ORIGIN}${MAX_RATING_PATH}`, {
    method: "POST",
    headers: {
      host: MAX_HOSTNAME,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

process.env.MAX_BOT_TOKEN = token;
let reads = 0;
let writes = 0;

setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  return { ok: true, userId: linkedUserId };
});
setMaxRatingDepsForTests({
  createClient: () => ({}),
  getPractice: async () => ({
    error: false,
    practice: {
      id: "practice-1",
      author_id: "author-1",
      status: "published",
      is_free: true,
      is_catalog_listed: true,
      catalog_visibility: "listed",
      publication_class: "practice",
      product_kind: "practice",
    },
  }),
  getOwnState: async ({ userId }) => {
    reads += 1;
    assert.equal(userId, linkedUserId);
    return {
      stars: 4,
      createdAt: null,
      updatedAt: null,
      ratingEligible: true,
      aggregate: { totalStars: 9, ratingCount: 2 },
    };
  },
  resolveAccess: async (_client, _practice, userId) => {
    assert.equal(userId, linkedUserId);
    return { canListen: true, reason: "free" };
  },
  resolveListen: async (_client, userId) => {
    assert.equal(userId, linkedUserId);
    return { mode: "entitled" };
  },
  getEligibleAt: async (_client, userId) => {
    assert.equal(userId, linkedUserId);
    return "2026-01-01T00:00:00.000Z";
  },
  applyRating: async (input) => {
    writes += 1;
    assert.equal(input.userId, linkedUserId);
    assert.notEqual(input.userId, "browser-user");
    assert.equal(input.stars, 5);
    return {
      stars: 5,
      createdAt: "",
      updatedAt: "",
      changed: true,
      aggregate: { totalStars: 14, ratingCount: 3 },
    };
  },
});

try {
  let response = await POST(request({
    initData: init(),
    authorSlug: "author",
    productSlug: "product",
    user_id: "browser-user",
    max_user_id: "101",
  }));
  assert.equal(response.status, 200);
  const readBody = await response.json();
  assert.equal(readBody.aggregate.totalStars, 9);
  assert.equal(readBody.stars, 4);
  assert.equal(reads, 1);

  response = await POST(request({
    initData: init(),
    authorSlug: "author",
    productSlug: "product",
    stars: 5,
    userId: "browser-user",
  }));
  assert.equal(response.status, 200);
  const writeBody = await response.json();
  assert.equal(writeBody.stars, 5);
  assert.equal(writeBody.aggregate.ratingCount, 3);
  assert.equal(writes, 1);

  const writesBefore = writes;
  response = await POST(request({
    initData: init().replace(/hash=.*/, "hash=ff"),
    authorSlug: "author",
    productSlug: "product",
    stars: 5,
    userId: "browser-user",
  }));
  assert.equal(response.status, 401);
  assert.equal(writes, writesBefore);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  response = await POST(request({
    initData: init(),
    authorSlug: "author",
    productSlug: "product",
    stars: 4,
  }));
  assert.equal(response.status, 403);
  assert.equal(writes, writesBefore);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: linkedUserId }));
  response = await POST(request({
    initData: init(),
    authorSlug: "author",
    productSlug: "product",
    stars: 9,
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).reason, "invalid_stars");
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxRatingDepsForTests(null);
}

console.log("max-rating-route-unit: ok");
