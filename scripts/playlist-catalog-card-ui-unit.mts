import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatPlaylistCatalogMeta } from "../src/lib/playlists/format-item-count";
import { PLAYLIST_LISTING_FORBIDDEN_FIELDS } from "../src/lib/playlists/listing-contract";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const cardPath = "src/components/playlists/catalog/PlaylistCard.tsx";
const gridPath = "src/components/playlists/catalog/PlaylistGrid.tsx";
const pagePath =
  "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx";
const filtersUiPath =
  "src/components/playlists/catalog/PlaylistCatalogFilters.tsx";

const card = read(cardPath);
const grid = read(gridPath);
const page = read(pagePath);
const productCard = read("src/components/products/CatalogProductGridCard.tsx");
const contract = read("src/lib/playlists/listing-contract.ts");
const format = read("src/lib/playlists/format-item-count.ts");
const css = read("src/app/globals.css");

assert.equal(existsSync(join(root, cardPath)), true);
assert.equal(existsSync(join(root, gridPath)), true);
assert.equal(existsSync(join(root, pagePath)), true);
assert.equal(
  existsSync(join(root, filtersUiPath)),
  false,
  "Stage 3A must not create PlaylistCatalogFilters",
);

assert.match(card, /item:\s*PlaylistListingItem/, "card accepts listing item only");
assert.match(card, /\{item\.title\}/, "card renders title");
assert.match(card, /\{item\.creator/, "card renders creator");
assert.match(card, /href=\{item\.href\}/, "card links to listing href");
assert.match(card, /formatPlaylistCatalogMeta/, "card uses existing count/duration formatters");
assert.match(card, /item\.coverUrl/, "card reads listing coverUrl only");
assert.match(card, /data-playlist-catalog-cover-placeholder/, "missing cover uses placeholder");
assert.match(card, /Нет обложки/, "placeholder is labeled");
assert.match(card, /aspect-square/, "cover is 1:1");
assert.match(card, /line-clamp-3/, "title clamps to 3 lines");
assert.match(card, /line-clamp-1/, "creator is one line");
assert.match(card, /data-playlist-catalog-heart-button/, "heart is visual-only");
assert.match(card, /data-playlist-catalog-play-button/, "play is visual-only");
assert.doesNotMatch(card, /CatalogProductGridCard/);
assert.doesNotMatch(card, /import PlaylistCover/);
assert.doesNotMatch(card, /mosaic|collage/i);
assert.doesNotMatch(card, /onClick/);
assert.doesNotMatch(card, /onSave/);
assert.doesNotMatch(card, /onPlay/);
assert.doesNotMatch(card, /материалов/);
assert.doesNotMatch(card, /трек/);
assert.doesNotMatch(card, /практик|программ|аудиопост/i);
assert.doesNotMatch(card, /kindLabel|priceLabel/);

for (const field of PLAYLIST_LISTING_FORBIDDEN_FIELDS) {
  assert.doesNotMatch(
    card,
    new RegExp(`\\b${field}\\b`),
    `card must not mention forbidden field ${field}`,
  );
}

assert.equal(formatPlaylistCatalogMeta(3, 125), "3 аудио · 3 мин");
assert.equal(formatPlaylistCatalogMeta(1, 0), "1 аудио");
assert.match(formatPlaylistCatalogMeta(5, 60), /5 аудио/);
assert.doesNotMatch(formatPlaylistCatalogMeta(5, 60), /трек|материал/);
assert.match(format, /formatProductDuration/);
assert.doesNotMatch(format, /трек|материал/);

assert.match(grid, /PlaylistCard/);
assert.match(grid, /catalog-product-grid/);
assert.match(grid, /buildPlaylistListingApiUrl/);
assert.match(grid, /IntersectionObserver/);
assert.match(grid, /Загрузить ещё/);
assert.match(grid, /Не удалось загрузить ещё\./);
assert.doesNotMatch(grid, /CatalogProductGridCard/);
assert.doesNotMatch(grid, /\/api\/catalog/);
assert.doesNotMatch(grid, /материалов/);
assert.doesNotMatch(grid, /трек/);
assert.doesNotMatch(grid, /PlaylistCatalogFilters/);

assert.match(
  css,
  /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  "catalog grid CSS stays 2 columns on mobile",
);

assert.match(page, /PlaylistGrid/);
assert.match(page, /loadPlaylistCatalogPage/);
assert.match(page, /query=\{query\}/);
assert.doesNotMatch(page, /PlaylistCard/);
assert.doesNotMatch(page, /CatalogProductGrid/);
assert.doesNotMatch(page, /материалов/);
assert.doesNotMatch(page, /трек/);
assert.doesNotMatch(page, /PlaylistCatalogFilters/);

assert.match(contract, /PlaylistListingItem/);
assert.doesNotMatch(contract, /durationLabel/);
assert.match(productCard, /CatalogProductGridCard/);

console.log("playlist-catalog-card-ui-unit: ok");
