#!/usr/bin/env node
import assert from "node:assert/strict";

import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import { compareDailyGiftKeys } from "../src/lib/home/daily-free-gifts.ts";
import { selectDailyForYouProducts } from "../src/lib/home/daily-for-you.ts";

const DATE_A = "2026-08-06";
const DATE_B = "2026-08-09";
const USER_A = "listener-a";
const USER_B = "listener-b";

function product(id, authorId, overrides = {}) {
  return {
    id,
    authorId,
    productKind: PRODUCT_KIND.PRACTICE,
    isFree: true,
    isInLibrary: false,
    isPurchased: false,
    isGifted: false,
    isPersonal: false,
    listeningState: "unplayed",
    ...overrides,
  };
}

function select(products, options = {}) {
  return selectDailyForYouProducts({
    products,
    userId: USER_A,
    dateKey: DATE_A,
    limit: 6,
    ...options,
  });
}

function ids(products) {
  return products.map((item) => item.id);
}

function authorIds(products) {
  return products.map((item) => item.authorId);
}

const tenAuthors = Array.from({ length: 10 }, (_, index) =>
  product(`product-${index + 1}`, `author-${index + 1}`),
);
assert.equal(select(tenAuthors).length, 6, "caps the result at six cards");
assert.equal(
  new Set(authorIds(select(tenAuthors))).size,
  6,
  "keeps at most one product per author",
);

const threeAuthors = Array.from({ length: 3 }, (_, index) =>
  product(`three-${index + 1}`, `three-author-${index + 1}`),
);
assert.equal(select(threeAuthors).length, 3, "returns the available author count");

const eligibilityProducts = [
  product("free-practice", "practice-author"),
  product("free-music", "music-author", { productKind: PRODUCT_KIND.MUSIC }),
  product("audio-post", "post-author", { productKind: PRODUCT_KIND.AUDIO_POST }),
  product("paid", "paid-author", { isFree: false }),
  product("missing-author", "", {}),
  product("library", "library-author", { isInLibrary: true }),
  product("purchased", "purchase-author", { isPurchased: true }),
  product("gifted", "gift-author", { isGifted: true }),
  product("personal", "personal-author", { isPersonal: true }),
  product("completed", "completed-author", { listeningState: "completed" }),
];
const eligibleIds = new Set(ids(select(eligibilityProducts)));
assert.equal(eligibleIds.has("free-practice"), true, "includes free practices");
assert.equal(eligibleIds.has("free-music"), true, "includes free music");
assert.equal(eligibleIds.has("audio-post"), false, "excludes audio posts");
assert.equal(eligibleIds.has("paid"), false, "excludes paid products");
assert.equal(eligibleIds.has("missing-author"), false, "excludes missing authorId");
assert.equal(eligibleIds.has("library"), false, "excludes library products");
assert.equal(eligibleIds.has("purchased"), false, "excludes purchased products");
assert.equal(eligibleIds.has("gifted"), false, "excludes gifted products");
assert.equal(eligibleIds.has("personal"), false, "excludes personal products");
assert.equal(eligibleIds.has("completed"), false, "excludes completed products");

const primary = [
  product("unplayed-one", "author-one"),
  product("unplayed-two", "author-two"),
  product("in-progress-one", "author-three", { listeningState: "in_progress" }),
  product("in-progress-two", "author-four", { listeningState: "in_progress" }),
];
const primaryResult = select(primary);
assert.equal(
  primaryResult.findIndex((item) => item.listeningState === "in_progress") >
    primaryResult.findIndex((item) => item.listeningState === "unplayed"),
  true,
  "uses in-progress products only after unplayed products",
);
assert.deepEqual(
  new Set(ids(primaryResult)),
  new Set(primary.map((item) => item.id)),
  "uses eligible in-progress products as fallback",
);

const fallbackNoRepeat = select([
  product("unplayed", "shared-author"),
  product("in-progress-same-author", "shared-author", {
    listeningState: "in_progress",
  }),
  product("in-progress-other-author", "other-author", {
    listeningState: "in_progress",
  }),
]);
assert.equal(
  new Set(authorIds(fallbackNoRepeat)).size,
  fallbackNoRepeat.length,
  "does not repeat an author in fallback",
);
assert.equal(
  ids(fallbackNoRepeat).includes("in-progress-same-author"),
  false,
  "does not use fallback from an already selected author",
);

const stableInput = [
  ...tenAuthors,
  product("multi-a", "multi-author"),
  product("multi-b", "multi-author"),
  product("completed-never", "completed-author", { listeningState: "completed" }),
];
const stableResult = select(stableInput);
assert.deepEqual(select(stableInput), stableResult, "same user and date stay stable");
assert.deepEqual(
  select([...stableInput].reverse()),
  stableResult,
  "input order does not affect the result",
);

const otherUserResult = select(stableInput, { userId: USER_B });
assert.notDeepEqual(
  otherUserResult,
  stableResult,
  "fixed fixture can rotate for another user",
);
const otherDayResult = select(stableInput, { dateKey: DATE_B });
assert.notDeepEqual(
  otherDayResult,
  stableResult,
  "fixed fixture can rotate for another date",
);

assert.equal(
  compareDailyGiftKeys({ key: 17, id: "a" }, { key: 17, id: "b" }) < 0,
  true,
  "uses ID tie-breaker when hash keys match",
);

const newPublication = product("new-publication", "new-author", {
  publishedAt: "2026-08-06T12:00:00.000Z",
});
assert.equal(
  ids(select([newPublication])).includes("new-publication"),
  true,
  "new publications participate without a manual list",
);

console.log("daily-for-you-unit: all tests passed");
