#!/usr/bin/env node
/**
 * Catalog Heart UI: top-right save control, Play stays bottom-right.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const card = read("src/components/products/CatalogProductGridCard.tsx");
const heart = read("src/components/products/CatalogProductHeartButton.tsx");
const play = read("src/components/products/CatalogProductPlayButton.tsx");
const listingApi = read("src/app/api/catalog/route.ts");

assert.match(card, /data-catalog-media-zone/, "media zone is marked");
assert.match(card, /aspect-square/, "media zone is 1:1");
assert.match(card, /CatalogProductHeartButton/, "Heart is on the card");
assert.match(card, /CatalogProductPlayButton/, "Play stays on the card");
assert.match(card, /data-catalog-info-block/, "info block stays marked");
assert.doesNotMatch(card, /Избранн/, "Heart is not favorites");

assert.match(heart, /type="button"/, "Heart is a button");
assert.doesNotMatch(heart, /<Link|href=/, "Heart is not a Link");
assert.match(heart, /absolute top-2 right-2 z-10/, "Heart is top-right");
assert.match(heart, /h-9 w-9/, "Heart matches Play size");
assert.match(
  heart,
  /before:absolute before:-inset-1 before:content-\[''\]/,
  "Heart hit-area is 44px",
);
assert.match(heart, /data-catalog-heart-button/);
assert.match(heart, /data-catalog-heart-saved/);
assert.match(heart, /Сохранить в Аудиотеку/);
assert.match(heart, /Убрать из Аудиотеки/);
assert.match(heart, /#7042c5/, "saved color");
assert.match(heart, /aria-live="polite"/, "errors use aria-live");
assert.match(heart, /buildAuthRouteHref|signInReturnPath/, "guest uses login return path");

assert.match(play, /absolute bottom-2 right-2 z-10/, "Play stays bottom-right");
assert.match(
  play,
  /before:absolute before:-inset-1 before:content-\[''\]/,
  "Play hit-area is 44px",
);
assert.doesNotMatch(play, /library\/saves|Heart|♡|♥/, "Play file is unchanged");

assert.doesNotMatch(
  listingApi,
  /playbackMode|entrySurface|previewStartMs/,
  "GET /api/catalog stays playback-free",
);

console.log("catalog-heart-ui-unit: ok");
