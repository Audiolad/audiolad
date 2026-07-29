#!/usr/bin/env node
/**
 * Regression: personal home «Новые материалы» follows catalog published_at order
 * and must not be deduped against upper rails (forYou / recently / programs).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = "/var/www/audiolad";
const dataTs = readFileSync(`${root}/src/lib/home/data.ts`, "utf8");

function selectNewHomeProducts(catalogProducts, limit = 8) {
  return catalogProducts.slice(0, limit);
}

function simulatePersonalRails(catalogProducts, { recentlyListened = [], freeProducts = null } = {}) {
  const free = freeProducts ?? catalogProducts.filter((p) => p.isFree);
  const shownIds = new Set();

  const forYouProducts = [];
  for (const source of [recentlyListened, free, catalogProducts.slice(0, 12)]) {
    for (const product of source) {
      if (shownIds.has(product.id) || forYouProducts.length >= 8) continue;
      shownIds.add(product.id);
      forYouProducts.push(product);
    }
  }

  const visibleRecentlyListened = recentlyListened.filter((p) => !shownIds.has(p.id));
  for (const product of visibleRecentlyListened) shownIds.add(product.id);

  // Fixed contract: independent of shownIds (same as guest home).
  const newProducts = selectNewHomeProducts(catalogProducts, 8);

  return { forYouProducts, visibleRecentlyListened, newProducts, shownIds };
}

function product(id, title, { isFree = true } = {}) {
  return { id, title, isFree };
}

function testNewestKeptEvenWhenInOtherRails() {
  const catalog = [
    product("new-1", "Женская энергия"),
    product("new-2", "13 шагов Радикального прощения"),
    product("old-1", "Бастет"),
    product("old-2", "Великие Женщины Мира"),
    product("old-3", "Женские деньги"),
    product("old-4", "Энергия Денежного Пути"),
    product("old-5", "Деньги меня обожают"),
    product("old-6", "Посвящение в энергию Бастет", { isFree: false }),
    product("old-7", "Активация канала изобилия"),
  ];

  const recentlyListened = [product("hist-1", "Старая история"), product("hist-2", "Ещё старше")];
  const { forYouProducts, newProducts, shownIds } = simulatePersonalRails(catalog, {
    recentlyListened,
  });

  assert.equal(forYouProducts[0]?.id, "hist-1", "forYou still prefers recently listened");
  assert.ok(
    forYouProducts.some((p) => p.id === "new-1"),
    "forYou may include newest free catalog items",
  );
  assert.ok(shownIds.has("new-1"), "newest id can already be in shownIds");
  assert.deepEqual(
    newProducts.map((p) => p.id),
    catalog.slice(0, 8).map((p) => p.id),
    "newProducts keeps absolute newest even when IDs overlap other rails",
  );
  assert.equal(newProducts[0]?.title, "Женская энергия", "newest remains first in newProducts");
}

function testOrderAndLimit() {
  const catalog = Array.from({ length: 12 }, (_, i) =>
    product(`p${i}`, `Product ${i}`),
  );
  const selected = selectNewHomeProducts(catalog, 8);
  assert.equal(selected.length, 8, "limit 8");
  assert.deepEqual(
    selected.map((p) => p.id),
    catalog.slice(0, 8).map((p) => p.id),
    "order matches catalog sort (published_at DESC already applied upstream)",
  );
}

function testLegacyBuggySelectionWouldDropNewest() {
  const catalog = [
    product("new-1", "Женская энергия"),
    product("new-2", "13 шагов"),
    product("a", "A"),
    product("b", "B"),
    product("c", "C"),
    product("d", "D"),
    product("money", "Деньги меня обожают"),
    product("bastet", "Посвящение в энергию Бастет", { isFree: false }),
  ];
  const recentlyListened = [product("h1", "H1"), product("h2", "H2")];
  const { shownIds, newProducts } = simulatePersonalRails(catalog, { recentlyListened });

  const buggy = catalog.slice(0, 8).filter((p) => !shownIds.has(p.id));
  assert.deepEqual(
    buggy.map((p) => p.id),
    ["money", "bastet"],
    "precondition: legacy slice-then-exclude left only older leftovers",
  );
  assert.deepEqual(
    newProducts.map((p) => p.id),
    catalog.slice(0, 8).map((p) => p.id),
    "fixed selection keeps newest eight",
  );
}

function testSourceContractUnchangedForOtherRails() {
  assert.match(
    dataTs,
    /const newProducts = allProducts\.slice\(0,\s*8\);/,
    "personal newProducts is direct catalog slice",
  );
  assert.doesNotMatch(
    dataTs,
    /const newProducts = excludeProducts\(allProducts\.slice\(0,\s*8\),\s*shownIds\);/,
    "personal newProducts must not exclude shownIds",
  );
  assert.match(
    dataTs,
    /newProducts:\s*products\.slice\(0,\s*8\)/,
    "guest newProducts stays independent catalog slice",
  );

  const forYouBlock = dataTs.slice(
    dataTs.indexOf("const forYouProducts"),
    dataTs.indexOf("const visibleRecentlyListened"),
  );
  assert.match(forYouBlock, /excludeProducts/, "forYou still dedupes via excludeProducts");
  assert.match(forYouBlock, /shownIds/, "forYou still uses shownIds");

  const recentBlock = dataTs.slice(
    dataTs.indexOf("const visibleRecentlyListened"),
    dataTs.indexOf("const visibleActivePrograms"),
  );
  assert.match(recentBlock, /shownIds/, "recently listened still filters shownIds");

  const programsBlock = dataTs.slice(
    dataTs.indexOf("const visibleActivePrograms"),
    dataTs.indexOf("const startSuggestions"),
  );
  assert.match(programsBlock, /shownIds/, "active programs still filter shownIds");
}

function run() {
  testNewestKeptEvenWhenInOtherRails();
  testOrderAndLimit();
  testLegacyBuggySelectionWouldDropNewest();
  testSourceContractUnchangedForOtherRails();
  console.log("personal-home-new-materials-unit: ok");
}

run();
