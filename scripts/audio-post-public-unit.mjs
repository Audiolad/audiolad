#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUDIO_POST_KIND_LABEL,
  PRODUCT_KIND,
  normalizeProductKind,
} from "../src/lib/author-products/product-kind.ts";
import { resolveProductAccess } from "../src/lib/products/access.ts";
import { shouldIndexPracticePage } from "../src/lib/products/publish-preview.ts";
import { resolvePublicPromoRecommendation } from "../src/lib/products/promo-recommendation.ts";
import { buildProductCoverAlt } from "../src/lib/seo/cover-alt.ts";
import { shouldEmitPracticeJsonLd } from "../src/lib/seo/json-ld/builders.ts";
import { PLATFORM_ANALYTICS_EVENTS } from "../src/lib/analytics/constants.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

assert.equal(normalizeProductKind("audio_post"), PRODUCT_KIND.AUDIO_POST);
assert.notEqual(normalizeProductKind("audio_post"), PRODUCT_KIND.PRACTICE);

assert.equal(
  buildProductCoverAlt({
    title: "Голос автора",
    authorName: "Сергей",
    productKind: PRODUCT_KIND.AUDIO_POST,
  }),
  "Обложка аудиопоста «Голос автора» – Сергей",
);

assert.equal(shouldIndexPracticePage("published", true), true);
assert.equal(shouldIndexPracticePage("published", false), false);
assert.equal(
  shouldEmitPracticeJsonLd({
    status: "published",
    isFixtureMarked: false,
    isCatalogListed: false,
  }),
  false,
);
assert.equal(
  shouldEmitPracticeJsonLd({
    status: "published",
    isFixtureMarked: false,
    isCatalogListed: true,
  }),
  true,
);

assert.ok(PLATFORM_ANALYTICS_EVENTS.includes("product_promo_clicked"));

const recommendation = resolvePublicPromoRecommendation({
  promo_enabled: true,
  promo_title: "Школа Аудиопрактик",
  promo_text: "Текст рекомендации",
  promo_button_text: "Посмотреть программу",
  promo_url: "https://school.audiolad.ru",
  promo_open_in_new_tab: true,
});
assert.ok(recommendation);
assert.equal(recommendation.title, "Школа Аудиопрактик");
assert.equal(recommendation.target.kind, "external");

assert.equal(
  resolvePublicPromoRecommendation({
    promo_enabled: false,
    promo_title: "Hidden",
    promo_text: "Hidden",
    promo_button_text: "Hidden",
    promo_url: "https://school.audiolad.ru",
  }),
  null,
);

// Unlisted free audio_post remains listenable by direct link.
const unlistedAccess = await resolveProductAccess(
  {
    from() {
      throw new Error("supabase_should_not_be_called_for_anonymous_free_path");
    },
  },
  {
    id: "p1",
    author_id: "a1",
    is_free: true,
    status: "published",
    is_catalog_listed: false,
    product_kind: PRODUCT_KIND.AUDIO_POST,
  },
  null,
);
assert.equal(unlistedAccess.canListen, true);
assert.equal(unlistedAccess.reason, "free");
assert.equal(unlistedAccess.canAcquire, false);
assert.equal(unlistedAccess.isPubliclyListed, false);

// Unlisted free practice (non audio_post) stays non-listenable without entitlement.
const unlistedPractice = await resolveProductAccess(
  {
    from() {
      throw new Error("supabase_should_not_be_called_for_anonymous_blocked_path");
    },
  },
  {
    id: "p2",
    author_id: "a1",
    is_free: true,
    status: "published",
    is_catalog_listed: false,
    product_kind: PRODUCT_KIND.PRACTICE,
  },
  null,
);
assert.equal(unlistedPractice.canListen, false);

// Without product_kind the free-audio-post exception must not apply.
const missingKind = await resolveProductAccess(
  {
    from() {
      throw new Error("supabase_should_not_be_called_for_anonymous_blocked_path");
    },
  },
  {
    id: "p3",
    author_id: "a1",
    is_free: true,
    status: "published",
    is_catalog_listed: false,
  },
  null,
);
assert.equal(missingKind.canListen, false);

const listenSessionLoader = read("src/lib/listen/load-session-payload.ts");
assert.match(
  listenSessionLoader,
  /is_catalog_listed,[\s\S]*guest_access_enabled,[\s\S]*product_kind,/,
  "listen session must load product_kind for unlisted audio_post guest access",
);

const listenPageShared = read("src/lib/listen/page-shared.tsx");
assert.match(
  listenPageShared,
  /is_catalog_listed,[\s\S]*guest_access_enabled,[\s\S]*product_kind,/,
);

const pageSource = read("src/app/(listener)/practice/[...segments]/page.tsx");
assert.match(pageSource, /AudioPostPage/);
assert.match(pageSource, /isAudioPostProductKind/);
assert.match(pageSource, /shouldIndexPracticePage\(\s*practice\.status,\s*practice\.is_catalog_listed/);

const authorPage = read("src/lib/authors/public-page.ts");
assert.match(authorPage, /\.eq\("is_catalog_listed", true\)/);
assert.match(authorPage, /isAudioPostProductKind/);

const nextStep = read("src/components/products/NextStepRecommendation.tsx");
assert.match(nextStep, /product_promo_clicked/);
assert.match(nextStep, /Следующий шаг/);
assert.doesNotMatch(nextStep, /school\.audiolad\.ru/);

assert.equal(AUDIO_POST_KIND_LABEL, "Аудиопост");

console.log("audio-post-public-unit: ok");
