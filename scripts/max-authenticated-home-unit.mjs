#!/usr/bin/env node
/**
 * MAX linked shell loads the isolated catalog view, not apex navigation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bridge = readFileSync(
  join(repoRoot, "src/components/max/MaxBridgeScript.tsx"),
  "utf8",
);
const home = readFileSync(
  join(repoRoot, "src/components/max/MaxAuthenticatedHome.tsx"),
  "utf8",
);
const detailView = readFileSync(
  join(repoRoot, "src/components/max/MaxProductDetailView.tsx"),
  "utf8",
);
const ratingView = readFileSync(
  join(repoRoot, "src/components/max/MaxProductRating.tsx"),
  "utf8",
);
const appreciationView = readFileSync(
  join(repoRoot, "src/components/max/MaxAuthorAppreciation.tsx"),
  "utf8",
);
const catalogSearch = readFileSync(
  join(repoRoot, "src/components/max/MaxCatalogSearch.tsx"),
  "utf8",
);
const card = readFileSync(
  join(repoRoot, "src/components/max/MaxCatalogProductCard.tsx"),
  "utf8",
);
const maxHomeScreen = readFileSync(
  join(repoRoot, "src/components/max/MaxHome.tsx"),
  "utf8",
);

const playlistInitializer = home.slice(
  home.indexOf("const [playlistRequest, setPlaylistRequest]"),
  home.indexOf("const playRef"),
);
assert.match(
  playlistInitializer,
  /initialStartTarget\?\.kind === "playlist"\s*\? \{ id: 1, slug: initialStartTarget\.playlistSlug \}\s*: null/,
);

const playlistStart = home.indexOf('if (initialStartTarget?.kind === "playlist")');
const locationPromoStart = home.indexOf("const locationPromo =", playlistStart);
assert.ok(playlistStart >= 0 && locationPromoStart > playlistStart);
const playlistBranch = home.slice(playlistStart, locationPromoStart);
assert.match(playlistBranch, /setActiveTab\("playlists"\)/);
assert.match(playlistBranch, /setPromoTarget\(null\)/);
assert.match(
  playlistBranch,
  /setPlaylistRequest\(\{\s*id: \+\+playlistRequestIdRef\.current,\s*slug: initialStartTarget\.playlistSlug,\s*\}\)/,
);
assert.match(playlistBranch, /return;\s*\}\s*$/);
assert.match(home, /<MaxPlaylists\b[^>]*requestedSlug=\{playlistRequest\}/);

const initialPromo = home.slice(
  home.indexOf("function initialMaxPromoTarget("),
  home.indexOf("function homeShelfTarget("),
);
assert.match(
  initialPromo,
  /if \(startTarget\?\.kind === "product" \|\| startTarget\?\.kind === "playlist"\) return null;\s*return readMaxPromoTargetFromLocation\(\);/,
  "playlist targets ignore location promo during initialization",
);

assert.match(bridge, /view\.phase === "linked_authenticated"/);
assert.match(bridge, /<MaxAuthenticatedHome/);
assert.match(home, /<MaxCatalogSearch/);
assert.match(catalogSearch, /MAX_CATALOG_PATH/);
assert.match(home, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(home, /Предпрослушивание пока недоступно/);
assert.match(home, /method: "POST"/);
assert.match(catalogSearch, /method: "POST"/);
assert.match(home, /cache: "no-store"/);
assert.match(catalogSearch, /cache: "no-store"/);
assert.match(catalogSearch, /Загружаем каталог/);
assert.match(catalogSearch, /В каталоге пока нет опубликованных аудиопродуктов/);
assert.match(catalogSearch, /grid-cols-2/);
assert.match(catalogSearch, /gap-\[6px\]/);
assert.match(catalogSearch, /-mx-4/);
assert.match(catalogSearch, /px-\[6px\]/);
assert.match(card, /aspect-square w-full/);
assert.match(card, /h-full w-full object-cover/);
assert.match(card, /flex-col/);
assert.match(card, /rounded-\[20px\]/);
assert.match(card, /!product\.isFree/);
assert.match(card, /px-2\.5 pb-2\.5 pt-2/);
assert.match(card, /line-clamp-2 min-h-10 text-\[14px\]/);
assert.match(card, /min-h-5/);
assert.match(card, /whitespace-nowrap text-xs/);
assert.match(catalogSearch, /MaxCatalogProductCard/);
const catalogStart = catalogSearch.indexOf('<ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">');
const readyStart = home.indexOf('{detail.status === "ready" ?');
assert.ok(catalogStart >= 0 && readyStart >= 0, "catalog grid and detail both exist");
assert.match(detailView, /product\.subtitle/);
const catalogBlock = `${catalogSearch.slice(catalogStart)}\n${card}`;
assert.doesNotMatch(catalogBlock, /product\.subtitle/);
assert.match(detailView, /product\.subtitle/);
assert.doesNotMatch(catalogSearch, /flex min-h-28/);
assert.doesNotMatch(catalogSearch, /w-24 shrink-0/);
assert.doesNotMatch(card, /flex min-h-28/);
assert.doesNotMatch(card, /w-24 shrink-0/);
assert.doesNotMatch(`${home}\n${catalogSearch}`, /Подарок|Бесплатно/);
assert.doesNotMatch(`${home}\n${catalogSearch}`, /CatalogProductHeart|CatalogProductPlay/);
const maxHomeSource = `${bridge}\n${home}\n${catalogSearch}\n${detailView}\n${ratingView}\n${appreciationView}\n${maxHomeScreen}\n${card}`
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
assert.doesNotMatch(
  maxHomeSource,
  /window\.location\s*=|openLink|\/practice\/|\/catalog["']|\/my-practices|\/studio|access_token|refresh_token|user_id|max_user_id/,
);

console.log("max-authenticated-home-unit: ok");
