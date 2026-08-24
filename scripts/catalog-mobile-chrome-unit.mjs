#!/usr/bin/env node
/**
 * Catalog mobile chrome: no title/back row, sticky search, desktop h1 stays.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const layout = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx",
);
const page = read("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx");

assert.doesNotMatch(
  layout,
  /CatalogMobileHeader/,
  "mobile catalog no longer mounts the title/back header",
);
assert.doesNotMatch(layout, /Назад/, "mobile catalog chrome has no back control");
assert.match(layout, /MobileCatalogSearch/, "mobile catalog still mounts search");
assert.match(
  layout,
  /listener-catalog-mobile-search/,
  "mobile search keeps its layout hook",
);
assert.match(layout, /sticky/, "mobile search is sticky");
assert.match(layout, /top-0/, "sticky search pins to the top of the scrollport");
assert.match(layout, /xl:hidden/, "sticky search stays mobile-only");
assert.match(
  layout,
  /safe-area-inset-top/,
  "sticky search respects the top safe-area",
);

assert.match(page, /<h1[\s\S]*Каталог[\s\S]*<\/h1>/, "catalog keeps an h1");
assert.match(page, /sr-only/, "mobile h1 is not a visible title");
assert.match(page, /xl:not-sr-only/, "desktop h1 stays visible");
assert.match(page, /xl:block/, "desktop h1 is a block heading");

assert.doesNotMatch(
  page,
  /buildCatalogPlaySessionUrl|fetchCatalogPlaySession|loadCatalogPlaySession/,
  "catalog page does not change play session wiring",
);
assert.doesNotMatch(
  layout,
  /\/api\/catalog|library_saves|BuyPracticeButton/,
  "catalog layout does not touch API, saves, or checkout",
);

console.log("catalog-mobile-chrome-unit: ok");
