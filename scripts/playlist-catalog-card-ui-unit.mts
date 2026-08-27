import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatPlaylistCardCreatorName,
  formatPlaylistCatalogMeta,
  PLAYLIST_CARD_TITLE_CLASS,
} from "../src/lib/playlists/format-item-count";
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
assert.match(card, /formatPlaylistCardCreatorName\(item\.creator\)/, "card formats creator at UI only");
assert.match(card, /href=\{item\.href\}/, "card links to listing href");
assert.match(card, /formatPlaylistCatalogMeta/, "card uses existing count/duration formatters");
assert.match(card, /item\.coverUrl/, "card reads listing coverUrl only");
assert.match(card, /data-playlist-catalog-cover-placeholder/, "missing cover uses placeholder");
assert.match(card, /Нет обложки/, "placeholder is labeled");
assert.match(card, /aspect-square/, "cover is 1:1");
assert.match(card, /PLAYLIST_CARD_TITLE_CLASS/, "title uses reserved 3-line class");
assert.match(card, /flex h-full min-w-0 flex-col/, "card stretches as a column");
assert.match(card, /line-clamp-1 min-h-5/, "creator is one reserved line");
assert.match(card, /PlaylistSaveButton/, "heart is a playlist save button");
assert.match(card, /playlistId=\{item\.id\}/, "card passes listing id only");
assert.match(card, /saved=\{item\.viewer\.saved\}/, "card passes listing saved state");
assert.match(card, /PlaylistPlayButton/, "play is a playlist catalog play button");
assert.match(card, /slug=\{item\.slug\}/, "card passes listing slug only");
assert.match(card, /title=\{item\.title\}/);
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
assert.doesNotMatch(card, /savesCount/, "card markup does not show savesCount");
assert.doesNotMatch(card, /resolvePlaylistListingCreatorName/);
assert.doesNotMatch(card, /EDITORIAL_PLAYLIST_LABEL/);
assert.doesNotMatch(card, /Плейлист АудиоЛада/);

const longTitle =
  "Музыка для сна детям | Колыбельные для малышей | Детская музыка для сна";
const shortTitle = "Шум воды | Журчание воды | Звуки воды";

function reservedTitleClassFor(title: string): string {
  assert.equal(typeof title, "string");
  return PLAYLIST_CARD_TITLE_CLASS;
}

assert.equal(reservedTitleClassFor(longTitle), reservedTitleClassFor(shortTitle));
assert.match(reservedTitleClassFor(longTitle), /line-clamp-3/);
assert.match(reservedTitleClassFor(longTitle), /min-h-\[3\.75rem\]/);
assert.match(reservedTitleClassFor(shortTitle), /min-h-\[3\.75rem\]/);
assert.match(format, /line-clamp-3 min-h-\[3\.75rem\]/);
assert.doesNotMatch(card, /item\.title\.(length|slice|split)/);

assert.equal(formatPlaylistCardCreatorName("Плейлист АудиоЛада"), "АудиоЛад");
assert.equal(formatPlaylistCardCreatorName("Сергей Петров"), "Сергей Петров");
assert.equal(formatPlaylistCardCreatorName("Ольга Невская"), "Ольга Невская");
assert.equal(formatPlaylistCardCreatorName("Автор: Ольга Невская"), "Ольга Невская");
assert.equal(formatPlaylistCardCreatorName("Создано: Сергей Петров"), "Сергей Петров");

for (const field of PLAYLIST_LISTING_FORBIDDEN_FIELDS) {
  assert.doesNotMatch(
    card,
    new RegExp(`\\b${field}\\b`),
    `card must not mention forbidden field ${field}`,
  );
}

assert.equal(formatPlaylistCatalogMeta(3, 125), "3 аудио · 3 мин");
assert.equal(formatPlaylistCatalogMeta(1, 0), "1 аудио");
assert.equal(formatPlaylistCatalogMeta(10, 600), "10 аудио · 10 мин");
assert.match(formatPlaylistCatalogMeta(5, 60), /5 аудио/);
assert.doesNotMatch(formatPlaylistCatalogMeta(5, 60), /трек|материал/);
assert.doesNotMatch(formatPlaylistCatalogMeta(10, 600), /savesCount|сохран/);
assert.match(format, /formatProductDuration/);
assert.doesNotMatch(format, /трек|материал/);
assert.doesNotMatch(format, /resolvePlaylistListingCreatorName/);

assert.match(grid, /PlaylistCard/);
assert.match(grid, /catalog-product-grid/);
assert.match(grid, /h-full min-w-0/, "grid items stretch to equal card height");
assert.match(grid, /buildPlaylistListingApiUrl/);
assert.match(grid, /IntersectionObserver/);
assert.match(grid, /Загрузить ещё/);
assert.match(grid, /Не удалось загрузить ещё\./);
assert.doesNotMatch(grid, /CatalogProductGridCard/);
assert.doesNotMatch(grid, /\/api\/catalog/);
assert.doesNotMatch(grid, /материалов/);
assert.doesNotMatch(grid, /трек/);
assert.doesNotMatch(grid, /PlaylistCatalogFilters/);
assert.doesNotMatch(
  grid,
  /listener-playlists-catalog-content/,
  "PlaylistGrid itself does not own catalog density",
);

assert.match(
  css,
  /\.catalog-product-grid \{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);\s*gap:\s*0\.75rem;/,
  "default catalog-product-grid stays 2 columns with 0.75rem gap",
);
assert.match(
  css,
  /@media \(max-width:\s*767px\) \{\s*\.listener-catalog-content \.catalog-product-grid \{\s*gap:\s*0\.375rem;/,
  "mobile /catalog grid gap stays 0.375rem below 768",
);
assert.match(
  css,
  /@media \(max-width:\s*767px\) \{\s*\.listener-playlists-catalog-content \{\s*margin-left:\s*-0\.625rem;[\s\S]*?margin-right:\s*-0\.625rem;/,
  "mobile /playlists/catalog pulls 10px out of parent px-5",
);
assert.match(
  css,
  /\.listener-playlists-catalog-content \.catalog-product-grid \{\s*gap:\s*0\.375rem;/,
  "mobile /playlists/catalog grid gap is 0.375rem below 768",
);
assert.match(
  css,
  /@media \(min-width:\s*768px\) \{\s*\.catalog-product-grid \{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);\s*gap:\s*1rem;/,
  "768 grid stays 3 columns with 1rem gap",
);

assert.match(page, /PlaylistGrid/);
assert.match(page, /PlaylistCatalogSearch/);
assert.match(
  page,
  /className="listener-playlists-catalog-content"/,
  "catalog page wraps the grid in listener-playlists-catalog-content",
);
const searchIndex = page.indexOf("<PlaylistCatalogSearch");
const wrapperIndex = page.indexOf(
  'className="listener-playlists-catalog-content"',
);
assert.ok(searchIndex !== -1, "catalog page still mounts PlaylistCatalogSearch");
assert.ok(wrapperIndex !== -1, "catalog page mounts the density wrapper");
assert.ok(
  searchIndex < wrapperIndex,
  "PlaylistCatalogSearch stays a sibling before the density wrapper",
);
assert.doesNotMatch(
  page.slice(wrapperIndex),
  /PlaylistCatalogSearch/,
  "PlaylistCatalogSearch is not inside listener-playlists-catalog-content",
);
assert.match(
  page.slice(wrapperIndex),
  /PlaylistGrid/,
  "PlaylistGrid stays inside listener-playlists-catalog-content",
);

const playlistsLayout = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/layout.tsx",
);
assert.match(
  playlistsLayout,
  /listener-playlists-content px-5 pt-6 pb-4 lg:px-10/,
  "shared playlists layout keeps px-5 until lg",
);
assert.doesNotMatch(
  playlistsLayout,
  /listener-playlists-catalog-content|px-2\.5/,
  "shared playlists layout is not the density hook",
);

const savedPage = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/saved/page.tsx",
);
assert.doesNotMatch(
  savedPage,
  /listener-playlists-catalog-content/,
  "/playlists/saved keeps the shared 20px / 12px density",
);
assert.doesNotMatch(page, /PlaylistCatalogSort/);
assert.doesNotMatch(page, /PlaylistCatalogTopicFilter/);
assert.match(page, /Ничего не нашлось/);
assert.match(page, /В этой теме пока нет плейлистов/);
assert.match(page, /loadPlaylistCatalogPage/);
assert.match(page, /query=\{query\}/);
assert.doesNotMatch(page, /PlaylistCard/);
assert.doesNotMatch(page, /CatalogProductGrid/);
assert.doesNotMatch(page, /материалов/);
assert.doesNotMatch(page, /трек/);
assert.doesNotMatch(page, /PlaylistCatalogFilters/);
assert.doesNotMatch(card, /item\.topics/);

assert.match(contract, /PlaylistListingItem/);
assert.doesNotMatch(contract, /durationLabel/);
assert.match(contract, /resolvePlaylistListingCreatorName/);
assert.doesNotMatch(
  contract,
  /formatPlaylistCardCreatorName/,
  "listing mapper keeps the raw creator string",
);
assert.match(productCard, /CatalogProductGridCard/);

console.log("playlist-catalog-card-ui-unit: ok");
