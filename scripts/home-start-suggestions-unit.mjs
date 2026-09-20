#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  HOME_START_SUGGESTIONS_LIMIT,
  takeUniqueAuthorProducts,
} from "../src/lib/home/start-suggestions.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function product(id, authorId) {
  return { id, authorId };
}

assert.equal(HOME_START_SUGGESTIONS_LIMIT, 7);

{
  const products = Array.from({ length: 10 }, (_, index) =>
    product(`p${index + 1}`, `a${index + 1}`),
  );
  const selected = takeUniqueAuthorProducts([products], 7);
  assert.equal(selected.length, 7, "caps at 7 when 7+ authors");
  assert.equal(
    new Set(selected.map((item) => item.authorId)).size,
    7,
    "seven unique authors",
  );
}

{
  const free = [
    product("free-a1", "author-1"),
    product("free-a1-b", "author-1"),
    product("free-a2", "author-2"),
  ];
  const all = [
    product("paid-a1", "author-1"),
    product("paid-a3", "author-3"),
    product("paid-a2", "author-2"),
  ];
  const selected = takeUniqueAuthorProducts([free, all], 7);
  assert.equal(selected.length, 3);
  assert.deepEqual(
    selected.map((item) => item.id),
    ["free-a1", "free-a2", "paid-a3"],
  );
  assert.equal(new Set(selected.map((item) => item.authorId)).size, 3);
}

{
  const products = Array.from({ length: 5 }, (_, index) =>
    product(`only-${index + 1}`, `only-author-${index + 1}`),
  );
  const selected = takeUniqueAuthorProducts([products], 7);
  assert.equal(selected.length, 5, "does not pad below 7 authors");
  assert.equal(new Set(selected.map((item) => item.authorId)).size, 5);
}

{
  const withBlankAuthor = [
    product("ok", "author-ok"),
    product("blank", "   "),
    product("empty", ""),
  ];
  const selected = takeUniqueAuthorProducts([withBlankAuthor], 7);
  assert.deepEqual(
    selected.map((item) => item.id),
    ["ok"],
  );
}

{
  const sameAuthor = [product("a", "author-1"), product("b", "author-1")];
  assert.equal(takeUniqueAuthorProducts([sameAuthor], 4).length, 1);
}

{
  assert.equal(takeUniqueAuthorProducts([[]], 7).length, 0);
  assert.equal(takeUniqueAuthorProducts([[product("x", "a")]], 0).length, 0);
}

const dataTs = read("src/lib/home/data.ts");
assert.match(dataTs, /takeUniqueAuthorProducts/);
assert.match(dataTs, /HOME_START_SUGGESTIONS_LIMIT/);
assert.match(dataTs, /from "\.\/start-suggestions"/);
assert.doesNotMatch(
  dataTs,
  /takeUniqueProducts\(\[freeProducts, allProducts\], 4\)/,
);

const startUi = read("src/components/home/HomeStartSuggestions.tsx");
assert.match(startUi, /HomeProductCarouselTrack/);
assert.match(startUi, /С чего начнём/);
assert.doesNotMatch(
  startUi,
  /home-carousel-track catalog-carousel mt-3\.5 flex gap-3 overflow-x-auto/,
);

const track = read("src/components/home/HomeProductCarouselTrack.tsx");
assert.match(track, /data-home-product-carousel="true"/);
assert.match(track, /HomeProductCard/);
assert.match(track, /scrollBy/);
assert.match(track, /ArrowLeft/);
assert.match(track, /ArrowRight/);
assert.match(track, /data-catalog-carousel-item/);
assert.match(track, /home-carousel-track catalog-carousel/);
assert.match(track, /"use client"/);

const guestData = read("src/lib/home/data.ts");
assert.match(guestData, /selectDailyFreeGiftProducts/);
assert.match(guestData, /getGuestHomeData/);
const guestHome = read("src/components/home/GuestHome.tsx");
assert.match(guestHome, /data\.freeProducts|featuredFreeProduct/);

console.log("home-start-suggestions-unit: ok");
