import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_HOSTNAME, MAX_ORIGIN, MAX_LISTEN_STATS_PATH } from "../src/lib/max/host.ts";
import {
  POST,
  setMaxListenStatsDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/listen-stats/route.ts";

const token = "test-max-bot-token-not-real-0001";
const linkedUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const audioItemId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const routeSource = readFileSync(
  join(process.cwd(), "src/app/api/max/listen-stats/route.ts"),
  "utf8",
);
const listenSource = readFileSync(join(process.cwd(), "src/lib/max/listen-stats.ts"), "utf8");
const touchSource = readFileSync(
  join(process.cwd(), "src/lib/max/touch-external-identity.ts"),
  "utf8",
);
const providerMatch = touchSource.match(
  /export const MAX_EXTERNAL_IDENTITY_PROVIDER = "([^"]+)"/,
);
assert.ok(providerMatch, "MAX_EXTERNAL_IDENTITY_PROVIDER must be defined");
const MAX_EXTERNAL_IDENTITY_PROVIDER = providerMatch[1];
assert.match(routeSource, /readMaxAuthenticatedPost/);
assert.match(listenSource, /applyOwnPracticeListenStatsHeartbeat/);
assert.match(listenSource, /resolveListenApiDecision/);

function init(extra = {}) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":101}', ...extra };
  const data = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", key).update(data).digest("hex");
  return (
    Object.entries(fields)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&") + `&hash=${hash}`
  );
}

function request(body) {
  return new Request(`${MAX_ORIGIN}${MAX_LISTEN_STATS_PATH}`, {
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
let heartbeats = 0;

setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  return { ok: true, userId: linkedUserId };
});
setMaxListenStatsDepsForTests({
  createClient: () => ({
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: audioItemId, status: "published" },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  }),
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
  resolveAccess: async (_client, _practice, userId) => {
    assert.equal(userId, linkedUserId);
    return { canListen: true, reason: "free" };
  },
  resolveListen: async (_client, userId) => {
    assert.equal(userId, linkedUserId);
    return { mode: "entitled" };
  },
  applyHeartbeat: async (input) => {
    heartbeats += 1;
    assert.equal(input.userId, linkedUserId);
    assert.equal(input.audioItemId, audioItemId);
    assert.equal(input.positionMs, 45_000);
    return {
      realListenedMs: 45_000,
      ratingEligible: false,
      ratingEligibleAt: null,
    };
  },
});

try {
  const response = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      audioItemId,
      positionMs: 45_000,
      priorPositionMs: 40_000,
    }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.realListenedMs, 45_000);
  assert.equal(heartbeats, 1);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  const blocked = await POST(
    request({
      initData: init(),
      authorSlug: "author",
      productSlug: "product",
      audioItemId,
      positionMs: 1000,
    }),
  );
  assert.equal(blocked.status, 403);
  assert.equal(heartbeats, 1);
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxListenStatsDepsForTests(null);
}

console.log("max-listen-stats-route-unit: ok");