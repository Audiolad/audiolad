#!/usr/bin/env node
/**
 * Catalog grid UI contract: unified feed, 2 columns, 3:4 cards, Play overlay.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const page = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
);
const grid = read("src/components/products/CatalogProductGrid.tsx");
const card = read("src/components/products/CatalogProductGridCard.tsx");
const css = read("src/app/globals.css");
const api = read("src/app/api/catalog/route.ts");
const guestHome = read("src/components/home/GuestHome.tsx");
const personalHome = read("src/components/home/PersonalHome.tsx");

assert.match(page, /CatalogProductGrid/, "catalog page uses the product grid");
assert.doesNotMatch(
  page,
  /CatalogProductCarousel/,
  "catalog page no longer uses carousels as the listing",
);
assert.doesNotMatch(
  page,
  /getPublishedCatalogSections/,
  "catalog page no longer splits gifts/paid carousels",
);
assert.match(page, /Подарки/, "access filter includes gifts");
assert.match(page, /Продукты/, "access filter includes paid products");
assert.match(page, /Практики/, "kind filter includes practices");
assert.match(page, /Музыка/, "kind filter includes music");
assert.match(page, /Посты/, "kind filter includes posts");
assert.match(page, /canLoadDefaultListingInParallel/, "first screen SSR is named");
assert.match(page, /listPublishedCatalog/, "first screen loads listing on the server");

assert.match(
  css,
  /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  "mobile grid is 2 columns",
);
assert.match(grid, /catalog-product-grid/, "grid uses the 2-column class");
assert.match(grid, /IntersectionObserver/, "infinite scroll is wired");
assert.match(grid, /Загрузить ещё/, "load more fallback exists");
assert.match(grid, /buildCatalogListingApiUrl/, "grid loads more from listing API");
assert.match(
  read("src/lib/catalog/listing-contract.ts"),
  /\/api\/catalog/,
  "listing contract points at GET /api/catalog",
);

assert.match(card, /aspect-\[3\/4\]/, "cards use 3:4 ratio");
assert.doesNotMatch(card, /aspect-square/, "grid cards are not square");
assert.match(card, /CatalogProductPlayButton/, "media zone has Play");
assert.doesNotMatch(card, /Heart|Избранн/, "heart UI is not in this PR");
assert.match(card, /href=\{product\.href\}/, "card still links to the product page");
assert.match(card, /Подарок/, "gift badge is visual");

assert.match(api, /export async function GET/, "GET /api/catalog exists");
assert.match(api, /nextCursor/, "API returns cursor pagination");
assert.match(api, /parseCatalogListingQuery/, "API parses listing query params");

assert.match(
  guestHome,
  /href="\/catalog\?access=free"/,
  "home gifts rail opens catalog gifts",
);
assert.match(
  guestHome,
  /href="\/catalog\?sort=new"/,
  "home novelties rail opens catalog newest",
);
assert.match(
  personalHome,
  /href="\/catalog\?sort=new"/,
  "personal new materials open catalog newest",
);

console.log("catalog-grid-ui-unit: ok");
