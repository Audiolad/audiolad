#!/usr/bin/env node
/**
 * Catalog grid UI contract: unified feed, 2 columns, 1:1 media zone, Play overlay.
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
const filterUi = read("src/lib/catalog/catalog-filter-ui.ts");
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
assert.match(page, /CATALOG_ACCESS_FILTER_OPTIONS/, "page uses shared access options");
assert.match(page, /CATALOG_KIND_FILTER_OPTIONS/, "page uses shared kind options");
assert.match(filterUi, /Подарки/, "access filter includes gifts");
assert.match(filterUi, /Продукты/, "access filter includes paid products");
assert.match(filterUi, /Практики/, "kind filter includes practices");
assert.match(filterUi, /Музыка/, "kind filter includes music");
assert.match(filterUi, /Посты/, "kind filter includes posts");
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

assert.match(card, /data-catalog-media-zone/, "media zone is marked");
assert.match(card, /aspect-square/, "media zone is 1:1");
assert.doesNotMatch(card, /aspect-\[3\/4\]/, "media zone is not 3:4");
assert.match(card, /data-catalog-info-block/, "info block is marked and static");
assert.match(card, /CatalogProductPlayButton/, "media zone has Play");
assert.match(card, /CatalogProductHeartButton/, "media zone has Heart");
assert.doesNotMatch(card, /Избранн/, "Heart is not favorites");
assert.match(card, /href=\{product\.href\}/, "card still links to the product page");
assert.match(card, /overflow-hidden/, "card clips to one rounded container");
assert.match(card, /rounded-\[20px\]/, "card has a shared radius");
assert.match(card, /border border-\[#eadff8\]/, "card has a light border");
assert.match(card, /data-catalog-card-meta/, "duration and price share one meta row");
assert.match(card, / · /, "meta row joins duration and paid price");
assert.match(card, /hidden xl:block/, "kind label is not on the mobile card");
assert.match(card, /readPaidCatalogPriceLabel/, "paid price is filtered in the card UI");
assert.match(card, /accessState !== "paid"/, "free cards do not render a price");
assert.match(card, /data-catalog-card-price/, "paid price is a visual marker");
assert.doesNotMatch(card, /Подарок/, "card UI does not show a gift status");
assert.doesNotMatch(card, /Бесплатно/, "card UI does not show a free status");
assert.match(card, /normalized === "подарок"/, "gift labels are stripped from the meta row");
assert.match(card, /normalized === "бесплатно"/, "free labels are stripped from the meta row");
assert.match(card, /\^0\\s\*₽\$/, "zero prices are stripped from the meta row");
assert.doesNotMatch(
  card,
  /absolute left-2 top-2[\s\S]*Подарок/,
  "gift badge is not on the cover",
);

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
