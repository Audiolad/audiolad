import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  POST,
  setVkAppreciationDepsForTests,
} from "../src/app/api/vk/appreciation/route.ts";

const routeSource = readFileSync(
  join(process.cwd(), "src/app/api/vk/appreciation/route.ts"),
  "utf8",
);
assert.match(routeSource, /startAuthorAppreciationCheckout/);
assert.match(routeSource, /userId: null/);
assert.match(routeSource, /authorSlug/);
assert.match(routeSource, /productSlug/);
assert.match(routeSource, /amountMinor/);
assert.match(routeSource, /guestEmail/);
assert.match(routeSource, /idempotencyKey/);
assert.doesNotMatch(routeSource, /body\.author_id|body\.practice_id|body\.authorId|body\.practiceId|body\.userId|body\.user_id/);
assert.doesNotMatch(routeSource, /status:\s*"paid"|оплачено|payment_succeeded/);

function request(body, headers = {}) {
  return new Request("https://audiolad.ru/api/vk/appreciation", {
    method: "POST",
    headers: {
      host: "audiolad.ru",
      origin: "https://audiolad.ru",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const practiceId = "11111111-1111-4111-8111-111111111111";
const authorId = "22222222-2222-4222-8222-222222222222";

function validBody(extra = {}) {
  return {
    authorSlug: "aurafon",
    productSlug: "muzyka-dlya-krepkogo-sna",
    amountMinor: 50000,
    guestEmail: "Guest@Example.com",
    idempotencyKey: "vk-appreciation-1",
    ...extra,
  };
}

let productLoads = 0;
let practiceLoads = 0;
let checkouts = 0;

setVkAppreciationDepsForTests({
  createClient: () => ({}),
  getProduct: async (authorSlug, productSlug, userId) => {
    productLoads += 1;
    assert.equal(userId, null);
    assert.equal(authorSlug, "aurafon");
    assert.equal(productSlug, "muzyka-dlya-krepkogo-sna");
    return {
      ok: true,
      product: {
        authorSlug,
        productSlug,
        appreciation: { authorName: "Аурафон" },
      },
    };
  },
  getPractice: async (_client, authorSlug, productSlug) => {
    practiceLoads += 1;
    assert.equal(authorSlug, "aurafon");
    assert.equal(productSlug, "muzyka-dlya-krepkogo-sna");
    return {
      error: false,
      practice: {
        id: practiceId,
        author_id: authorId,
        slug: productSlug,
      },
    };
  },
  startCheckout: async (input) => {
    checkouts += 1;
    assert.equal(input.userId, null);
    assert.equal(input.authorId, authorId);
    assert.equal(input.practiceId, practiceId);
    assert.equal(input.surface, "product");
    assert.equal(input.email, "Guest@example.com");
    assert.equal(input.amountMinor, 50000);
    assert.equal(input.idempotencyKey, "vk-appreciation-1");
    assert.notEqual(input.authorId, "browser-author");
    assert.notEqual(input.practiceId, "browser-practice");
    return new Response(JSON.stringify({
      intent_id: "intent",
      status: "pending",
      payment_link: "https://pay.example/appreciation",
    }), { status: 201, headers: { "content-type": "application/json" } });
  },
});

try {
  let response = await POST(request(validBody()));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["ok", "paymentLink", "status"]);
  assert.equal(body.ok, true);
  assert.equal(body.status, "pending");
  assert.equal(body.paymentLink, "https://pay.example/appreciation");
  assert.equal(body.paid, undefined);
  assert.equal(body.practiceId, undefined);
  assert.equal(body.authorId, undefined);
  assert.equal(body.intent_id, undefined);
  assert.equal(checkouts, 1);
  assert.equal(productLoads, 1);
  assert.equal(practiceLoads, 1);

  const before = { productLoads, practiceLoads, checkouts };
  response = await POST(request(validBody({
    author_id: "browser-author",
    practice_id: "browser-practice",
    authorId: "browser-author",
    practiceId: "browser-practice",
    userId: "browser-user",
  })));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).reason, "invalid_request");
  assert.equal(productLoads, before.productLoads);
  assert.equal(practiceLoads, before.practiceLoads);
  assert.equal(checkouts, before.checkouts);

  response = await POST(request({
    authorSlug: "aurafon",
    productSlug: "muzyka-dlya-krepkogo-sna",
    amountMinor: 50000,
    idempotencyKey: "vk-appreciation-2",
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).reason, "guest_email_invalid");
  assert.equal(checkouts, before.checkouts);

  setVkAppreciationDepsForTests({
    createClient: () => ({}),
    getProduct: async () => ({
      ok: true,
      product: {
        authorSlug: "aurafon",
        productSlug: "muzyka-dlya-krepkogo-sna",
        appreciation: null,
      },
    }),
    getPractice: async () => {
      throw new Error("practice must not load when appreciation is hidden");
    },
    startCheckout: async () => {
      throw new Error("checkout must not start when appreciation is hidden");
    },
  });
  response = await POST(request(validBody({ idempotencyKey: "vk-appreciation-3" })));
  assert.equal(response.status, 404);
  assert.equal((await response.json()).reason, "appreciation_unavailable");

  setVkAppreciationDepsForTests({
    createClient: () => ({}),
    getProduct: async () => ({
      ok: true,
      product: {
        authorSlug: "aurafon",
        productSlug: "muzyka-dlya-krepkogo-sna",
        appreciation: { authorName: "Аурафон" },
      },
    }),
    getPractice: async () => ({
      error: false,
      practice: { id: practiceId, author_id: authorId, slug: "muzyka-dlya-krepkogo-sna" },
    }),
    startCheckout: async () => new Response(JSON.stringify({
      status: "pending",
      payment_link: "http://pay.example/appreciation",
    }), { status: 201, headers: { "content-type": "application/json" } }),
  });
  response = await POST(request(validBody({ idempotencyKey: "vk-appreciation-4" })));
  const unsafe = await response.json();
  assert.notEqual(response.status, 201);
  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.paymentLink, undefined);
  assert.equal(unsafe.status, undefined);

  setVkAppreciationDepsForTests({
    createClient: () => ({}),
    getProduct: async () => ({
      ok: true,
      product: {
        authorSlug: "aurafon",
        productSlug: "muzyka-dlya-krepkogo-sna",
        appreciation: { authorName: "Аурафон" },
      },
    }),
    getPractice: async () => ({
      error: false,
      practice: { id: practiceId, author_id: authorId, slug: "muzyka-dlya-krepkogo-sna" },
    }),
    startCheckout: async () => new Response(JSON.stringify({
      status: "paid",
      payment_link: "https://pay.example/appreciation",
    }), { status: 201, headers: { "content-type": "application/json" } }),
  });
  response = await POST(request(validBody({ idempotencyKey: "vk-appreciation-5" })));
  const paid = await response.json();
  assert.notEqual(response.status, 201);
  assert.equal(paid.paymentLink, undefined);
  assert.equal(paid.status, undefined);

  response = await POST(request(
    validBody({ idempotencyKey: "vk-appreciation-6" }),
    { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  ));
  assert.equal(response.status, 403);
} finally {
  setVkAppreciationDepsForTests(null);
}

console.log("vk-appreciation-route-unit: ok");
