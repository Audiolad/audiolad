import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PROMO_ANALYTICS_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  POST,
  setMaxPromoAnalyticsClientForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/promo/analytics/route.ts";

const token = "test-max-bot-token-not-real-0001";

function init(extra = {}) {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: '{"id":101}',
    ...extra,
  };
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
  return new Request(`${MAX_ORIGIN}${MAX_PROMO_ANALYTICS_PATH}`, {
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

const calls = [];
setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  return { ok: true, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
});
setMaxPromoAnalyticsClientForTests(() => ({
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: "event-1", error: null };
  },
}));

try {
  let response = await POST(
    request({
      initData: init(),
      eventName: "promo_page_viewed",
      promoPageId: "11111111-1111-4111-8111-111111111111",
      anonymousSessionId: "session-1",
      utmSource: "max-ads",
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "insert_analytics_event");
  assert.equal(calls[0].args.p_event_name, "promo_page_viewed");
  assert.equal(calls[0].args.p_promo_page_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(calls[0].args.p_utm_source, "max-ads");

  const before = calls.length;
  response = await POST(
    request({
      initData: init(),
      eventName: "not_allowed",
      promoPageId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(calls.length, before);

  response = await POST(
    request({
      initData: init().replace(/hash=.*/, "hash=ff"),
      eventName: "promo_page_viewed",
      promoPageId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.equal(response.status, 401);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  response = await POST(
    request({
      initData: init(),
      eventName: "promo_page_viewed",
      promoPageId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  assert.equal(response.status, 403);
} finally {
  setResolveMaxNativeUserForTests(null);
  setMaxPromoAnalyticsClientForTests(null);
}

console.log("max-promo-analytics-route-unit: ok");
