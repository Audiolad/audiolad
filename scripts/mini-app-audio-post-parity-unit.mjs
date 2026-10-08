/**
 * audio_post parity in MAX / VK mini-apps (task 6106b262):
 * five stars + canonical aggregate, «Поблагодарить автора», author-saved «Следующий шаг».
 * DTO → parser → render, plus identity / eligibility / payment / link negative cases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as guestRatingModule from "../src/components/mini-app/MiniAppGuestRating.tsx";
import * as nextStepModule from "../src/components/mini-app/MiniAppNextStep.tsx";
import { getMaxPublishedProduct, setMaxProductDepsForTests } from "../src/lib/max/product.ts";
import { readMaxProductDetail } from "../src/lib/max/product-view.ts";
import {
  normalizeMiniAppNextStepUrl,
  readMiniAppNextStep,
  resolveMiniAppNextStep,
  toMiniAppNextStep,
} from "../src/lib/mini-app/next-step.ts";
import { readVkProductView, toVkProductView } from "../src/lib/vk/product-view.ts";

// tsx CJS/ESM interop: the component may arrive as default.default.
const component = (mod) => (typeof mod.default === "function" ? mod.default : mod.default.default);
const MiniAppGuestRating = component(guestRatingModule);
const MiniAppNextStep = component(nextStepModule);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(repoRoot, path), "utf8");

const PROMO = {
  promo_enabled: true,
  promo_title: "Приходите в школу аудиопрактик",
  promo_text: "Запишитесь на ближайший поток.",
  promo_button_text: "Записаться",
  promo_url: "/authors/sergey-petrov",
  promo_open_in_new_tab: false,
};

// ---------------------------------------------------------------------------
// 1. Server resolution: same source and validation as the web audio_post card.
// ---------------------------------------------------------------------------
assert.deepEqual(resolveMiniAppNextStep({ productKind: "audio_post", promo: PROMO }), {
  title: PROMO.promo_title,
  text: PROMO.promo_text,
  buttonText: PROMO.promo_button_text,
  url: "https://audiolad.ru/authors/sergey-petrov",
});
assert.equal(
  resolveMiniAppNextStep({
    productKind: "audio_post",
    promo: { ...PROMO, promo_url: "/practice/a/b?utm_source=max#start" },
  })?.url,
  "https://audiolad.ru/practice/a/b?utm_source=max#start",
  "internal path keeps query/hash on the production origin",
);
assert.equal(
  resolveMiniAppNextStep({
    productKind: "audio_post",
    promo: { ...PROMO, promo_url: "https://school.example.org/enroll?x=1", promo_open_in_new_tab: true },
  })?.url,
  "https://school.example.org/enroll?x=1",
);
// Negative: other classes never get the block (web shows it for audio_post only).
for (const productKind of ["practice", "music", null, undefined, "course"]) {
  assert.equal(resolveMiniAppNextStep({ productKind, promo: PROMO }), null, `no next step for ${productKind}`);
}
// Negative: disabled / incomplete / unsafe settings hide the block.
for (const promo of [
  { ...PROMO, promo_enabled: false },
  { ...PROMO, promo_enabled: null },
  { ...PROMO, promo_title: "  " },
  { ...PROMO, promo_text: null },
  { ...PROMO, promo_button_text: "" },
  { ...PROMO, promo_url: null },
  { ...PROMO, promo_url: "http://insecure.example.org" },
  { ...PROMO, promo_url: "javascript:alert(1)" },
  { ...PROMO, promo_url: "//evil.example.org/x" },
  { ...PROMO, promo_url: "/auth/sign-in" },
  { ...PROMO, promo_url: "/api/max/rating" },
  { ...PROMO, promo_url: "https://user:pass@evil.example.org" },
  { ...PROMO, promo_url: "data:text/html,hi" },
  { ...PROMO, promo_title: "x".repeat(121) },
  {},
]) {
  assert.equal(resolveMiniAppNextStep({ productKind: "audio_post", promo }), null, JSON.stringify(promo));
}
assert.equal(toMiniAppNextStep(null), null);

// ---------------------------------------------------------------------------
// 2. Client parser: strict, never breaks the card.
// ---------------------------------------------------------------------------
const NEXT = {
  title: "Следующий шаг автора",
  text: "Текст",
  buttonText: "Перейти",
  url: "https://audiolad.ru/authors/sergey-petrov",
};
assert.deepEqual(readMiniAppNextStep(NEXT), NEXT);
assert.equal(readMiniAppNextStep(undefined), null);
assert.equal(readMiniAppNextStep(null), null);
assert.equal(readMiniAppNextStep("https://audiolad.ru"), null);
assert.equal(readMiniAppNextStep({ ...NEXT, practiceId: "leak" }), null, "extra keys rejected");
assert.equal(readMiniAppNextStep({ ...NEXT, url: "http://audiolad.ru" }), null);
assert.equal(readMiniAppNextStep({ ...NEXT, url: "javascript:alert(1)" }), null);
assert.equal(readMiniAppNextStep({ ...NEXT, url: "/relative" }), null);
assert.equal(readMiniAppNextStep({ ...NEXT, url: "https://a:b@audiolad.ru" }), null);
assert.equal(readMiniAppNextStep({ ...NEXT, buttonText: "" }), null);
assert.equal(readMiniAppNextStep({ ...NEXT, text: "x".repeat(501) }), null);
assert.equal(normalizeMiniAppNextStepUrl("https://audiolad.ru/\u0000x"), null);

// ---------------------------------------------------------------------------
// 3. Shared DTO builder (MAX + VK) wires nextStep from the authoritative row.
// ---------------------------------------------------------------------------
const AUDIO_POST_ID = "11111111-1111-4111-8111-111111111111";
function practiceRow(overrides = {}) {
  return {
    id: AUDIO_POST_ID,
    title: "Приглашение",
    slug: "priglashenie",
    subtitle: null,
    description: null,
    format: "post",
    product_kind: "audio_post",
    publication_class: "audio_product",
    duration_minutes: 3,
    price: 0,
    is_free: true,
    cover_url: null,
    cover_image: null,
    updated_at: null,
    author_id: "author-1",
    status: "published",
    deleted_at: null,
    catalog_visibility: "listed",
    is_catalog_listed: true,
    scheduled_publish_at: null,
    published_at: "2026-01-01T00:00:00.000Z",
    authors: { name: "Сергей Петров", slug: "sergey-petrov" },
    ...PROMO,
    ...overrides,
  };
}
function catalogProduct(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    slug: row.slug,
    subtitle: null,
    description: null,
    format: row.format,
    productKind: row.product_kind,
    publicationClass: row.publication_class,
    price: 0,
    isFree: true,
    authorName: row.authors.name,
    authorSlug: row.authors.slug,
    href: `/practice/${row.authors.slug}/${row.slug}`,
    meta: null,
    statsLabel: "3 мин",
    productTypeLabel: "Аудиопост",
    priceLabel: "Подарок",
    sortTimestamp: 1,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    gallery: [],
  };
}
async function buildDetail(row) {
  setMaxProductDepsForTests({
    createClient: () => ({}),
    releaseScheduled: async () => {},
    getPractice: async () => ({ practice: row, error: false }),
    listCatalog: async () => [catalogProduct(row)],
    loadTracks: async () => [],
    loadTopics: async () => [],
    loadSeo: async () => ({ relatedProducts: [], authorRecommendationsTitle: "Рекомендации автора" }),
  });
  try {
    return await getMaxPublishedProduct("sergey-petrov", row.slug, null);
  } finally {
    setMaxProductDepsForTests(null);
  }
}

const built = await buildDetail(practiceRow());
assert.equal(built.ok, true);
assert.deepEqual(built.product.nextStep, {
  title: PROMO.promo_title,
  text: PROMO.promo_text,
  buttonText: PROMO.promo_button_text,
  url: "https://audiolad.ru/authors/sergey-petrov",
});
assert.equal((await buildDetail(practiceRow({ product_kind: "practice" }))).product.nextStep, null);
assert.equal((await buildDetail(practiceRow({ promo_enabled: false }))).product.nextStep, null);
assert.equal(
  (await buildDetail(practiceRow({ promo_url: "javascript:alert(1)" }))).product.nextStep,
  null,
);

// MAX parser round-trip (JSON over the wire).
const maxWire = JSON.parse(JSON.stringify(built.product));
const maxParsed = readMaxProductDetail(maxWire);
assert.ok(maxParsed, "MAX detail parses");
assert.deepEqual(maxParsed.nextStep, built.product.nextStep);
assert.equal(typeof maxParsed.rating.enabled, "boolean");
// Old server without the field / malformed field: the card still renders, block hidden.
const withoutNextStep = { ...maxWire };
delete withoutNextStep.nextStep;
assert.equal(readMaxProductDetail(withoutNextStep)?.nextStep, null);
assert.equal(readMaxProductDetail({ ...maxWire, nextStep: { ...NEXT, url: "http://x" } })?.nextStep, null);
assert.ok(readMaxProductDetail({ ...maxWire, nextStep: { ...NEXT, url: "http://x" } }), "card survives");

// ---------------------------------------------------------------------------
// 4. VK view: rating (canonical aggregate, read-only) + nextStep, no leaks.
// ---------------------------------------------------------------------------
const vkSource = {
  ...built.product,
  rating: { enabled: true, aggregate: { totalStars: 14, ratingCount: 3 } },
  appreciation: { authorName: "Сергей Петров" },
};
const vkView = toVkProductView(vkSource);
assert.deepEqual(vkView.rating, { enabled: true, aggregate: { totalStars: 14, ratingCount: 3 } });
assert.deepEqual(vkView.nextStep, built.product.nextStep);
assert.deepEqual(vkView.appreciation, { authorName: "Сергей Петров" });
for (const key of ["practiceId", "practice_id", "authorId", "author_id", "userId", "user_id", "recommendations", "promo_url"]) {
  assert.equal(JSON.stringify(vkView).includes(`"${key}"`), false, `VK view must not carry ${key}`);
}
const vkParsed = readVkProductView(JSON.parse(JSON.stringify(vkView)));
assert.ok(vkParsed);
assert.deepEqual(vkParsed.rating, vkView.rating);
assert.deepEqual(vkParsed.nextStep, vkView.nextStep);
// Disabled ratings / bad aggregates collapse to a disabled block server-side.
assert.equal(toVkProductView({ ...vkSource, rating: { enabled: false, aggregate: { totalStars: 1, ratingCount: 1 } } }).rating.enabled, false);
assert.equal(toVkProductView({ ...vkSource, rating: { enabled: true, aggregate: { totalStars: -1, ratingCount: 1 } } }).rating.enabled, false);
assert.equal(toVkProductView({ ...vkSource, rating: null }).rating.enabled, false);
// Parser negatives: leaked ids or junk inside rating reject the payload.
const vkWire = JSON.parse(JSON.stringify(vkView));
assert.equal(readVkProductView({ ...vkWire, rating: { ...vkWire.rating, practiceId: "x" } }), null);
assert.equal(readVkProductView({ ...vkWire, rating: { enabled: true, aggregate: { totalStars: 1.5, ratingCount: 1 } } }), null);
assert.equal(readVkProductView({ ...vkWire, rating: { enabled: "yes", aggregate: { totalStars: 1, ratingCount: 1 } } }), null);
assert.equal(readVkProductView({ ...vkWire, rating: { enabled: true, aggregate: { totalStars: 1, ratingCount: 1, userId: "u" } } }), null);
// Older payload without rating/nextStep still renders (block disabled/hidden).
const legacyVk = { ...vkWire };
delete legacyVk.rating;
delete legacyVk.nextStep;
assert.deepEqual(readVkProductView(legacyVk)?.rating, { enabled: false, aggregate: { totalStars: 0, ratingCount: 0 } });
assert.equal(readVkProductView(legacyVk)?.nextStep, null);
assert.equal(readVkProductView({ ...vkWire, nextStep: { ...NEXT, url: "javascript:alert(1)" } })?.nextStep, null);

// ---------------------------------------------------------------------------
// 5. Render: next step + guest rating markup.
// ---------------------------------------------------------------------------
const nextHtml = renderToStaticMarkup(
  React.createElement(MiniAppNextStep, { nextStep: NEXT, onOpenLink: () => true, surface: "vk" }),
);
assert.match(nextHtml, /Следующий шаг/);
assert.match(nextHtml, /Следующий шаг автора/);
assert.match(nextHtml, /href="https:\/\/audiolad\.ru\/authors\/sergey-petrov"/, "https href = fallback");
assert.match(nextHtml, />Перейти<\/a>/);
assert.match(nextHtml, /rel="noopener noreferrer"/);
assert.match(nextHtml, /data-mini-app-next-step="vk"/);

const guestRatingProps = {
  enabled: true,
  aggregate: { totalStars: 14, ratingCount: 3 },
  signInAction: { message: "m", label: "Войти в АудиоЛад", onPress: () => {} },
  surface: "max",
};
const guestHtml = renderToStaticMarkup(React.createElement(MiniAppGuestRating, guestRatingProps));
assert.equal((guestHtml.match(/data-practice-rating-star=/g) ?? []).length, 5, "five stars");
assert.match(guestHtml, /data-practice-rating-total-stars="14"/);
assert.match(guestHtml, /data-practice-rating-count="3"/);
assert.match(guestHtml, /data-practice-rating-guest="true"/);
assert.doesNotMatch(guestHtml, /★/, "guest never sees a pretend saved rating");
assert.equal(
  renderToStaticMarkup(React.createElement(MiniAppGuestRating, { ...guestRatingProps, enabled: false })),
  "",
  "rating flag off → no block (same as web)",
);

// ---------------------------------------------------------------------------
// 6. Wiring / identity / payment guards (source-level).
// ---------------------------------------------------------------------------
const guestRatingSource = read("src/components/mini-app/MiniAppGuestRating.tsx");
assert.doesNotMatch(guestRatingSource, /fetch\(|initData|localStorage|sessionStorage|MAX_RATING_PATH|\/api\//, "guest rating never writes");

const nextStepSource = read("src/components/mini-app/MiniAppNextStep.tsx");
assert.match(nextStepSource, /if \(opened\) event\.preventDefault\(\)/, "bridge first, anchor fallback");
assert.doesNotMatch(nextStepSource, /dangerouslySetInnerHTML|window\.location\s*=/);

const maxDetail = read("src/components/max/MaxProductDetailView.tsx");
assert.doesNotMatch(maxDetail, /interactiveActionsEnabled/, "blocks are no longer hidden for MAX guests");
assert.match(maxDetail, /guestMode \? \(\s*<MiniAppGuestRating/);
assert.match(maxDetail, /label: MAX_SHELL_LOGIN_CTA, onPress: requestLogin/);
assert.match(maxDetail, /<MaxProductRating/, "linked users keep the real save path");
assert.match(maxDetail, /onRequestLogin=\{guestMode \? requestLogin : null\}/);
assert.match(maxDetail, /<MiniAppNextStep nextStep=\{product\.nextStep\} onOpenLink=\{openMaxExternalLink\} surface="max" \/>/);
const order = ["MiniAppGuestRating", "MaxProductRating", "product.appreciation", "product.nextStep", "product.topics", "product.contents"];
let last = -1;
for (const token of order) {
  const at = maxDetail.indexOf(token, maxDetail.indexOf("</FeaturedProductCard>"));
  assert.ok(at > last, `MAX order: ${token}`);
  last = at;
}

const maxHome = read("src/components/max/MaxAuthenticatedHome.tsx");
assert.match(maxHome, /<MaxProductDetailView[\s\S]*guestMode=\{guestMode\}[\s\S]*onRequestLogin=\{onRequestLogin\}/);

const maxThanks = read("src/components/max/MaxAuthorAppreciation.tsx");
assert.match(maxThanks, /if \(guestMode \|\| !selectedAmount \|\| isSubmitting\) return;/, "guest never reaches checkout");
assert.match(maxThanks, /\{open && !guestMode \? \(/);
assert.match(maxThanks, /MAX_APPRECIATION_PATH/, "linked path unchanged");
assert.match(maxThanks, /idempotencyKey: crypto\.randomUUID\(\)/);
assert.doesNotMatch(maxThanks, /authorId|practiceId|author_id|practice_id|userId/);

const vkScreen = read("src/components/vk/VkMiniAppScreen.tsx");
assert.match(vkScreen, /<MiniAppGuestRating[\s\S]*surface="vk"[\s\S]*openVkCanonicalPracticePage\(product\.authorSlug, product\.productSlug\)/);
assert.match(vkScreen, /<MiniAppNextStep nextStep=\{product\.nextStep\} onOpenLink=\{openVkExternalHttps\} surface="vk" \/>/);
assert.doesNotMatch(vkScreen, /MaxProductRating|\/api\/vk\/rating|\/api\/max\/rating/, "VK invents no rating identity");
const vkRatingAt = vkScreen.indexOf("<MiniAppGuestRating");
const vkThanksAt = vkScreen.indexOf("<VkAuthorAppreciation");
const vkNextAt = vkScreen.indexOf("<MiniAppNextStep");
const vkFooterAt = vkScreen.indexOf('<VkPublicFooter variant="product"');
assert.ok(vkRatingAt < vkThanksAt && vkThanksAt < vkNextAt && vkNextAt < vkFooterAt, "VK order: rating, thanks, next step, footer");

const productSource = read("src/lib/max/product.ts");
assert.match(productSource, /resolveMiniAppNextStep\(\{\s*productKind: practice\.product_kind/);
assert.match(productSource, /promo_url: practice\.promo_url/);

console.log("mini-app-audio-post-parity-unit: ok");
