#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  compareDailyGiftKeys,
  getMoscowDateKey,
  selectDailyFreeGiftProducts,
} from "../src/lib/home/daily-free-gifts.ts";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";

const DATE_A = "2026-08-06";
const DATE_B = "2026-08-07";

function product(id, authorId, overrides = {}) {
  return {
    id,
    authorId,
    productKind: PRODUCT_KIND.PRACTICE,
    isFree: true,
    audioCount: 1,
    ...overrides,
  };
}

function select(products, options = {}) {
  return selectDailyFreeGiftProducts({
    products,
    featuredProductId: null,
    dateKey: DATE_A,
    limit: 8,
    ...options,
  });
}

function authorIds(products) {
  return products.map((item) => item.authorId);
}

const sixAuthors = Array.from({ length: 6 }, (_, index) =>
  product(`practice-${index + 1}`, `author-${index + 1}`),
);
assert.equal(select(sixAuthors).length, 6, "returns all six eligible authors");

const tenAuthors = Array.from({ length: 10 }, (_, index) =>
  product(`ten-${index + 1}`, `ten-author-${index + 1}`),
);
assert.equal(select(tenAuthors).length, 8, "caps the rail at eight authors");

const threeAuthors = Array.from({ length: 3 }, (_, index) =>
  product(`three-${index + 1}`, `three-author-${index + 1}`),
);
assert.deepEqual(
  new Set(authorIds(select(threeAuthors))).size,
  3,
  "does not fill a short rail with second products from the same author",
);

const featured = product("featured", "featured-author");
assert.equal(
  select([featured, product("other", "other-author")], {
    featuredProductId: featured.id,
  }).some((item) => item.id === featured.id),
  false,
  "excludes the featured product",
);

const duplicateAuthorProducts = [
  product("author-one-a", "author-one"),
  product("author-one-b", "author-one"),
  product("author-two-a", "author-two"),
];
const onePerAuthor = select(duplicateAuthorProducts);
assert.equal(onePerAuthor.length, 2, "selects one product per author");
assert.equal(
  new Set(authorIds(onePerAuthor)).size,
  onePerAuthor.length,
  "never repeats an author",
);

const stableInput = [
  ...tenAuthors,
  product("multi-a", "multi-author"),
  product("multi-b", "multi-author"),
];
const stableResult = select(stableInput);
assert.deepEqual(
  select(stableInput),
  stableResult,
  "same date and source data produce the same result",
);
assert.deepEqual(
  select([...stableInput].reverse()),
  stableResult,
  "result does not depend on source array order",
);

const changingResult = selectDailyFreeGiftProducts({
  products: stableInput,
  featuredProductId: null,
  dateKey: DATE_B,
  limit: 8,
});
assert.notDeepEqual(
  changingResult,
  stableResult,
  "the selected cards or their order changes for the fixed next-day fixture",
);

assert.equal(
  compareDailyGiftKeys({ key: 42, id: "author-a" }, { key: 42, id: "author-b" }) <
    0,
  true,
  "uses id as the stable hash collision tie-breaker",
);

const eligibilityProducts = [
  product("free-practice", "practice-author"),
  product("free-music", "music-author", {
    productKind: PRODUCT_KIND.MUSIC,
    audioCount: 3,
  }),
  product("audio-post", "post-author", {
    productKind: PRODUCT_KIND.AUDIO_POST,
  }),
  product("paid-practice", "paid-practice-author", { isFree: false }),
  product("paid-music", "paid-music-author", {
    productKind: PRODUCT_KIND.MUSIC,
    isFree: false,
  }),
  product("multi-audio-practice", "multi-audio-author", { audioCount: 2 }),
  product("missing-author", "", {}),
];
const eligibleIds = new Set(select(eligibilityProducts).map((item) => item.id));
assert.equal(eligibleIds.has("free-practice"), true, "includes free practices");
assert.equal(eligibleIds.has("free-music"), true, "includes free music");
assert.equal(eligibleIds.has("audio-post"), false, "excludes audio posts");
assert.equal(eligibleIds.has("paid-practice"), false, "excludes paid practices");
assert.equal(eligibleIds.has("paid-music"), false, "excludes paid music");
assert.equal(
  eligibleIds.has("multi-audio-practice"),
  true,
  "includes practices regardless of audio item count",
);
assert.equal(eligibleIds.has("missing-author"), false, "excludes products without authorId");

assert.deepEqual(
  select([featured], { featuredProductId: featured.id }),
  [],
  "omits an author whose only eligible product is featured",
);
const authorWithAlternative = product("alternative", featured.authorId);
const authorStillPresent = select([featured, authorWithAlternative], {
  featuredProductId: featured.id,
});
assert.deepEqual(
  authorStillPresent.map((item) => item.id),
  ["alternative"],
  "keeps the author when another eligible product exists",
);

assert.equal(
  getMoscowDateKey(new Date("2026-08-06T20:59:59.000Z")),
  "2026-08-06",
  "uses Moscow day before midnight",
);
assert.equal(
  getMoscowDateKey(new Date("2026-08-06T21:00:00.000Z")),
  "2026-08-07",
  "changes day at Moscow midnight",
);

console.log("daily-free-gifts-unit: all tests passed");
