import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_MINI_APP_BOT_NAME,
  buildMaxProductDeepLink,
  buildMaxPromoDeepLink,
  buildMaxProductStartPayload,
  buildMaxPromoStartPayload,
  parseMaxStartPayload,
  readMaxResolvedStartTarget,
} from "../src/lib/max/startapp.ts";

const productId = "11111111-1111-4111-8111-111111111111";
const promoId = "22222222-2222-4222-8222-222222222222";

assert.equal(MAX_MINI_APP_BOT_NAME, "id507305817690_bot");
assert.equal(
  buildMaxProductStartPayload(productId),
  "p_11111111111141118111111111111111",
);
assert.equal(
  buildMaxPromoStartPayload(promoId),
  "g_22222222222242228222222222222222",
);
assert.deepEqual(
  parseMaxStartPayload("p_11111111111141118111111111111111"),
  { kind: "product", practiceId: productId },
);
assert.deepEqual(
  parseMaxStartPayload("g_22222222222242228222222222222222"),
  { kind: "promo", promoPageId: promoId },
);
assert.equal(parseMaxStartPayload("p_bad"), null);
assert.equal(parseMaxStartPayload("x_11111111111141118111111111111111"), null);
assert.equal(parseMaxStartPayload("a".repeat(513)), null);
assert.equal(buildMaxProductDeepLink("bad"), null);
assert.equal(
  buildMaxProductDeepLink(productId),
  "https://max.ru/id507305817690_bot?startapp=p_11111111111141118111111111111111",
);
assert.equal(
  buildMaxPromoDeepLink(promoId),
  "https://max.ru/id507305817690_bot?startapp=g_22222222222242228222222222222222",
);

assert.deepEqual(
  readMaxResolvedStartTarget({
    kind: "product",
    practiceId: productId,
    authorSlug: "sergey-and-zoya",
    productSlug: "eliksir-molodosti",
  }),
  {
    kind: "product",
    practiceId: productId,
    authorSlug: "sergey-and-zoya",
    productSlug: "eliksir-molodosti",
  },
);
assert.equal(readMaxResolvedStartTarget({ kind: "product" }), null);

const verifyRoute = readFileSync(
  join(process.cwd(), "src/app/api/max/session/verify/route.ts"),
  "utf8",
);
const resolver = readFileSync(
  join(process.cwd(), "src/lib/max/startapp-server.ts"),
  "utf8",
);
const shellClient = readFileSync(
  join(process.cwd(), "src/lib/max/session-shell-client.ts"),
  "utf8",
);
const bridge = readFileSync(
  join(process.cwd(), "src/components/max/MaxBridgeScript.tsx"),
  "utf8",
);
const home = readFileSync(
  join(process.cwd(), "src/components/max/MaxAuthenticatedHome.tsx"),
  "utf8",
);
const promoPages = readFileSync(
  join(process.cwd(), "src/components/author-dashboard/AuthorPromoPagesClient.tsx"),
  "utf8",
);
const productPage = readFileSync(
  join(process.cwd(), "src/app/(platform)/author-dashboard/products/[id]/page.tsx"),
  "utf8",
);
const maxCard = readFileSync(
  join(process.cwd(), "src/components/author-dashboard/AuthorMaxDeepLinkCard.tsx"),
  "utf8",
);

assert.ok(
  verifyRoute.indexOf("verifyMaxInitData(initData, botToken)") <
    verifyRoute.indexOf("resolveMaxStartTarget"),
  "start target must be resolved only after HMAC verification",
);
assert.match(verifyRoute, /result\.data\.start_param/);
assert.match(verifyRoute, /startTarget \? \{ startTarget \} : \{\}/);
assert.match(resolver, /\.eq\("status", "published"\)/);
assert.match(resolver, /\.eq\("is_catalog_listed", true\)/);
assert.match(resolver, /\.eq\("catalog_visibility", "listed"\)/);
assert.match(resolver, /\.from\("promo_pages"\)/);
assert.match(shellClient, /readMaxResolvedStartTarget/);
assert.match(bridge, /initialStartTarget=\{startTarget\}/);
assert.match(home, /initialStartTarget\?\.kind === "promo"/);
assert.match(home, /initialStartTarget\?\.kind === "product"/);
assert.match(home, /productSlug: initialStartTarget\.productSlug/);
assert.match(promoPages, /buildMaxPromoDeepLink\(page\.id\)/);
assert.match(promoPages, /Скопировать MAX-ссылку/);
assert.match(productPage, /buildMaxProductDeepLink\(product\.practice\.id\)/);
assert.match(productPage, /AuthorMaxDeepLinkCard/);
assert.match(maxCard, /Ссылка для MAX/);
assert.match(maxCard, /Скопировать MAX-ссылку/);
assert.doesNotMatch(
  `${verifyRoute}\n${resolver}`,
  /initDataUnsafe/,
  "server startapp routing must not use initDataUnsafe",
);

console.log("max-startapp-unit: ok");
