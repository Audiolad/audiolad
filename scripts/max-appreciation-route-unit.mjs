import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_APPRECIATION_PATH, MAX_HOSTNAME, MAX_ORIGIN } from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  POST,
  setMaxAppreciationDepsForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/appreciation/route.ts";

const token = "test-max-bot-token-not-real-0001";
const linkedUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const routeSource = readFileSync(
  join(process.cwd(), "src/app/api/max/appreciation/route.ts"),
  "utf8",
);
const visibilitySource = readFileSync(
  join(process.cwd(), "src/lib/author-appreciation/public-product-visibility.ts"),
  "utf8",
);
assert.match(routeSource, /startAuthorAppreciationCheckout/);
assert.match(routeSource, /authenticated\.userId/);
assert.doesNotMatch(routeSource, /body\.userId|body\.user_id|body\.author_id|body\.practice_id|guest_email/);
assert.match(visibilitySource, /resolveAuthorAppreciationVisibility/);
assert.match(visibilitySource, /isAuthorAppreciationRolloutEnabled/);
assert.match(visibilitySource, /hasAcceptedCurrentAppreciationTerms/);
assert.doesNotMatch(routeSource, /window\.location|payment_succeeded|status:\s*"paid"/);

function init() {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":101}' };
  const data = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", key).update(data).digest("hex");
  return Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") + `&hash=${hash}`;
}

function request(body) {
  return new Request(`${MAX_ORIGIN}${MAX_APPRECIATION_PATH}`, {
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
let checkouts = 0;
setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  return { ok: true, userId: linkedUserId };
});
setMaxAppreciationDepsForTests({
  createClient: () => ({}),
  loadEmail: async (userId) => {
    assert.equal(userId, linkedUserId);
    return "listener@example.com";
  },
  getProduct: async () => ({ ok: true, product: { title: "Тишина" } }),
  getPractice: async () => ({
    error: false,
    practice: { id: "practice-id", author_id: "author-id" },
  }),
  startCheckout: async (input) => {
    checkouts += 1;
    assert.equal(input.userId, linkedUserId);
    assert.equal(input.authorId, "author-id");
    assert.equal(input.practiceId, "practice-id");
    assert.equal(input.surface, "product");
    assert.notEqual(input.userId, "browser-user");
    assert.notEqual(input.authorId, "browser-author");
    return new Response(JSON.stringify({
      intent_id: "intent",
      status: "pending",
      payment_link: "https://pay.example/appreciation",
    }), { status: 201, headers: { "content-type": "application/json" } });
  },
});

try {
  let response = await POST(request({
    initData: init(),
    authorSlug: "author",
    productSlug: "product",
    amountMinor: 50000,
    idempotencyKey: "max-appreciation-1",
    user_id: "browser-user",
    author_id: "browser-author",
    practice_id: "browser-practice",
    guest_email: "attacker@example.com",
  }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "pending");
  assert.equal(body.paymentLink, "https://pay.example/appreciation");
  assert.equal(body.paid, undefined);
  assert.equal(checkouts, 1);

  const before = checkouts;
  response = await POST(request({
    initData: init().replace(/hash=.*/, "hash=ff"),
    authorSlug: "author",
    productSlug: "product",
    amountMinor: 50000,
    idempotencyKey: "max-appreciation-2",
  }));
  assert.equal(response.status, 401);
  assert.equal(checkouts, before);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  response = await POST(request({
    initData: init(),
    authorSlug: "author",
    productSlug: "product",
    amountMinor: 50000,
    idempotencyKey: "max-appreciation-3",
  }));
  assert.equal(response.status, 403);
  assert.equal(checkouts, before);
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxAppreciationDepsForTests(null);
}

console.log("max-appreciation-route-unit: ok");
