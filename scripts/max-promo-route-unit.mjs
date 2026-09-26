import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  MAX_HOSTNAME,
  MAX_ORIGIN,
  MAX_PROMO_PATH,
} from "../src/lib/max/host.ts";
import { MAX_EXTERNAL_IDENTITY_PROVIDER } from "../src/lib/max/touch-external-identity.ts";
import {
  POST,
  setGetMaxPromoPageForTests,
  setResolveMaxNativeUserForTests,
} from "../src/app/api/max/promo/route.ts";

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

function request(body, headers = {}) {
  return new Request(`${MAX_ORIGIN}${MAX_PROMO_PATH}`, {
    method: "POST",
    headers: {
      host: MAX_HOSTNAME,
      origin: MAX_ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

process.env.MAX_BOT_TOKEN = token;
let lookups = 0;

setResolveMaxNativeUserForTests(async (provider, id) => {
  assert.equal(provider, MAX_EXTERNAL_IDENTITY_PROVIDER);
  assert.equal(id, "101");
  return { ok: true, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
});
setGetMaxPromoPageForTests(async (authorSlug, promoSlug) => {
  lookups += 1;
  return {
    ok: true,
    page: {
      promoPageId: "promo-1",
      authorSlug,
      promoSlug,
      publicTitle: "3 КвантМедитации в подарок",
      publicDescription: "Короткие практики",
      footerText: "Выберите первую практику",
      bannerUrl: null,
      authorName: "Сергей и Зоя",
      cta: {
        heading: "Вернуться в чат в Максе",
        description: null,
        label: "Продолжить в MAX",
        href: "https://max.ru/id507305817690_bot",
        kind: "external",
        host: "max.ru",
        openInNewTab: false,
      },
      products: [
        {
          practiceId: "p1",
          slug: "eliksir-molodosti",
          title: "Эликсир Молодости",
          format: "Квант-Медитация",
          durationMinutes: 5,
          coverUrl: null,
          authorName: "Сергей и Зоя",
          authorSlug,
        },
      ],
    },
  };
});

try {
  let response = await POST(
    request({
      initData: init(),
      authorSlug: "sergey-and-zoya",
      promoSlug: "3-kvantmeditatsii-v-podarok",
      user_id: "ignored",
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const ok = await response.json();
  assert.equal(ok.page.publicTitle, "3 КвантМедитации в подарок");
  assert.equal(ok.page.products[0].slug, "eliksir-molodosti");
  assert.equal(ok.page.cta.host, "max.ru");

  const before = lookups;
  response = await POST(
    request({
      initData: init().replace(/hash=.*/, "hash=ff"),
      authorSlug: "sergey-and-zoya",
      promoSlug: "3-kvantmeditatsii-v-podarok",
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(lookups, before);

  for (const body of ["null", "[]", '"x"', "1", "{"]) {
    response = await POST(request(body));
    assert.equal(response.status, 400);
  }

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: null }));
  response = await POST(
    request({
      initData: init(),
      authorSlug: "sergey-and-zoya",
      promoSlug: "3-kvantmeditatsii-v-podarok",
    }),
  );
  assert.equal(response.status, 403);

  setResolveMaxNativeUserForTests(async () => ({ ok: true, userId: "u" }));
  setGetMaxPromoPageForTests(async () => ({ ok: false, reason: "not_found" }));
  response = await POST(
    request({
      initData: init(),
      authorSlug: "sergey-and-zoya",
      promoSlug: "missing",
    }),
  );
  assert.equal(response.status, 404);
} finally {
  setResolveMaxNativeUserForTests(null);
  setGetMaxPromoPageForTests(null);
}

console.log("max-promo-route-unit: ok");
