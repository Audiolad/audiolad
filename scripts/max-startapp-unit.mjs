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
import {
  resolveMaxStartTarget,
  setPublishedDirectLinkLookupForTests,
} from "../src/lib/max/startapp-server.ts";

const productId = "11111111-1111-4111-8111-111111111111";
const promoId = "22222222-2222-4222-8222-222222222222";
const silaVeryId = "31e04472-2693-4986-a973-3600d9a2e4a7";

assert.equal(MAX_MINI_APP_BOT_NAME, "id507305817690_1_bot");
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
  "https://max.ru/id507305817690_1_bot?startapp=p_11111111111141118111111111111111",
);
assert.equal(
  buildMaxProductStartPayload(silaVeryId),
  "p_31e0447226934986a9733600d9a2e4a7",
);
assert.deepEqual(parseMaxStartPayload("p_31e0447226934986a9733600d9a2e4a7"), {
  kind: "product",
  practiceId: silaVeryId,
});
assert.equal(
  buildMaxPromoDeepLink(promoId),
  "https://max.ru/id507305817690_1_bot?startapp=g_22222222222242228222222222222222",
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
const authorProductForm = readFileSync(
  join(process.cwd(), "src/components/author-dashboard/AuthorProductForm.tsx"),
  "utf8",
);

assert.ok(
  verifyRoute.indexOf("verifyMaxInitData(initData, botToken)") <
    verifyRoute.indexOf("(resolveMaxStartTargetImpl ?? resolveMaxStartTarget)"),
  "start target must be resolved only after HMAC verification",
);
assert.match(verifyRoute, /result\.data\.start_param/);
assert.match(verifyRoute, /startTarget \? \{ startTarget \} : \{\}/);
const publishedTarget = readFileSync(
  join(process.cwd(), "src/lib/mini-app/published-product-target.ts"),
  "utf8",
);
assert.match(resolver, /resolvePublishedDirectLinkProductById/);
assert.doesNotMatch(resolver, /resolvePublishedListedProductById/);
assert.match(publishedTarget, /isDirectLinkPublicVisibility/);
assert.match(publishedTarget, /readPublishedDirectLinkTarget/);

function exportFunction(source, name) {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, name);
  const next = source.indexOf("\nexport ", start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

const listedById = exportFunction(
  publishedTarget,
  "resolvePublishedListedProductById",
);
const directById = exportFunction(
  publishedTarget,
  "resolvePublishedDirectLinkProductById",
);
assert.match(listedById, /\.eq\("status", "published"\)/);
assert.match(listedById, /\.eq\("is_catalog_listed", true\)/);
assert.match(listedById, /\.eq\("catalog_visibility", "listed"\)/);
assert.match(listedById, /applyPracticePublicAvailabilityFilter/);
assert.match(directById, /\.eq\("status", "published"\)/);
assert.match(directById, /\.is\("deleted_at", null\)/);
assert.match(directById, /applyPracticePublicAvailabilityFilter/);
assert.match(directById, /readPublishedDirectLinkTarget/);
assert.doesNotMatch(directById, /\.eq\("is_catalog_listed", true\)/);
assert.doesNotMatch(directById, /\.eq\("catalog_visibility", "listed"\)/);

const vkTarget = readFileSync(
  join(process.cwd(), "src/lib/vk/resolve-target.ts"),
  "utf8",
);
assert.match(vkTarget, /resolvePublishedListedProductById/);
assert.doesNotMatch(vkTarget, /resolvePublishedDirectLinkProductById/);

const catalogVisibility = readFileSync(
  join(process.cwd(), "src/lib/catalog/visibility-query.ts"),
  "utf8",
);
assert.match(catalogVisibility, /unlisted never/);
assert.match(catalogVisibility, /\.eq\("catalog_visibility", "listed"\)/);
assert.match(
  verifyRoute,
  /if \(!touch\.linked\) \{[\s\S]*?startTarget \? \{ startTarget \} : \{\}/,
);
assert.match(resolver, /\.from\("promo_pages"\)/);
assert.match(shellClient, /readMaxResolvedStartTarget/);
assert.match(bridge, /initialStartTarget=\{startTarget\}/);
assert.match(
  bridge,
  /view\.phase === "linked_authenticated" \|\| view\.phase === "guest_unlinked"/,
);
assert.match(bridge, /guestMode=\{view\.phase === "guest_unlinked"\}/);
assert.doesNotMatch(bridge, /guest_unlinked" && startTarget\?\.kind === "product"/);
assert.match(bridge, /onRequestLogin=\{handleOpenLogin\}/);
assert.match(bridge, /onRequestSignup=\{handleOpenSignup\}/);
assert.match(home, /initialStartTarget\?\.kind === "promo"/);
assert.match(home, /initialStartTarget\?\.kind === "product"/);
assert.match(home, /guestMode = false/);
assert.doesNotMatch(home, /status: "login_required"/);
assert.doesNotMatch(home, /payload\?\.reason === "unlinked"/);
assert.doesNotMatch(home, /Войти или зарегистрироваться/);
assert.match(home, /PLAY_ACTION_LABEL/);
assert.match(home, /PREVIEW_ACTION_LABEL/);
assert.match(home, /<MaxBottomNav/);
assert.doesNotMatch(home, /!guestMode \? \(\s*<MaxBottomNav/);
assert.match(home, /<MaxProductDetailView[\s\S]*guestMode=\{guestMode\}[\s\S]*onRequestLogin=\{onRequestLogin\}/);
assert.match(home, /slug: initialStartTarget\.productSlug/);
assert.match(authorProductForm, /Адрес продукта в MAX/);
assert.match(authorProductForm, /buildMaxProductDeepLink\(practiceId\)/);
assert.match(authorProductForm, /handleCopyMaxProductLink/);
assert.match(authorProductForm, /copyTextToClipboard\(maxProductDeepLink\)/);
assert.match(
  authorProductForm,
  /Открывает этот продукт внутри мини-приложения АудиоЛад в MAX/,
);

assert.doesNotMatch(
  `${verifyRoute}\n${resolver}`,
  /initDataUnsafe/,
  "server startapp routing must not use initDataUnsafe",
);

function practiceUuid(n) {
  return `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
}

function publishedRow(overrides = {}) {
  return {
    slug: "sila-very",
    authors: { slug: "zoya-petrova" },
    status: "published",
    deleted_at: null,
    is_catalog_listed: false,
    catalog_visibility: "unlisted",
    scheduled_publish_at: null,
    published_at: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const rows = new Map();
const storageFailureId = "33333333-3333-4333-8333-333333333333";
setPublishedDirectLinkLookupForTests(async (practiceId) => {
  if (practiceId === storageFailureId) {
    return { ok: false, reason: "storage_unavailable" };
  }
  return { ok: true, row: rows.get(practiceId) ?? null };
});

const futureSchedule = new Date(Date.now() + 86_400_000).toISOString();
const cases = [
  [
    "listed published",
    publishedRow({
      is_catalog_listed: true,
      catalog_visibility: "listed",
      slug: "listed-product",
    }),
    "listed-product",
  ],
  ["unlisted published", publishedRow({}), "sila-very"],
  [
    "legacy unlisted flag",
    publishedRow({
      catalog_visibility: null,
      is_catalog_listed: false,
      slug: "legacy-unlisted",
    }),
    "legacy-unlisted",
  ],
  [
    "selected_users",
    publishedRow({
      catalog_visibility: "selected_users",
      is_catalog_listed: false,
    }),
    null,
  ],
  [
    "selected_users even if listed flag is true",
    publishedRow({
      catalog_visibility: "selected_users",
      is_catalog_listed: true,
    }),
    null,
  ],
  [
    "draft",
    publishedRow({
      status: "draft",
      catalog_visibility: "listed",
      is_catalog_listed: true,
    }),
    null,
  ],
  [
    "unpublished",
    publishedRow({ status: "unpublished", catalog_visibility: "unlisted" }),
    null,
  ],
  [
    "deleted",
    publishedRow({ deleted_at: "2026-01-01T00:00:00.000Z" }),
    null,
  ],
  [
    "future scheduled",
    publishedRow({
      published_at: null,
      scheduled_publish_at: futureSchedule,
    }),
    null,
  ],
  [
    "already live",
    publishedRow({
      published_at: "2020-01-01T00:00:00.000Z",
      scheduled_publish_at: futureSchedule,
      slug: "already-live",
    }),
    "already-live",
  ],
];

try {
  let n = 1;
  for (const [label, row, expectedSlug] of cases) {
    const id = practiceUuid(n);
    n += 1;
    rows.set(id, row);
    const resolved = await resolveMaxStartTarget(buildMaxProductStartPayload(id));
    if (expectedSlug) {
      assert.deepEqual(
        resolved,
        {
          kind: "product",
          practiceId: id,
          authorSlug: "zoya-petrova",
          productSlug: expectedSlug,
        },
        label,
      );
    } else {
      assert.equal(resolved, null, label);
    }
  }

  rows.set(silaVeryId, publishedRow({}));
  assert.deepEqual(
    await resolveMaxStartTarget("p_31e0447226934986a9733600d9a2e4a7"),
    {
      kind: "product",
      practiceId: silaVeryId,
      authorSlug: "zoya-petrova",
      productSlug: "sila-very",
    },
  );
  assert.equal(
    await resolveMaxStartTarget(buildMaxProductStartPayload(storageFailureId)),
    null,
  );
  assert.equal(await resolveMaxStartTarget(buildMaxProductStartPayload(practiceUuid(90))), null);
} finally {
  setPublishedDirectLinkLookupForTests(null);
}

console.log("max-startapp-unit: ok");
