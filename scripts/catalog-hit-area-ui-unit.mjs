#!/usr/bin/env node
/**
 * Catalog overlay hit-area: Heart/Play stay 36px visually, 44px tap target.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const heart = read("src/components/products/CatalogProductHeartButton.tsx");
const play = read("src/components/products/CatalogProductPlayButton.tsx");
const card = read("src/components/products/CatalogProductGridCard.tsx");
const grid = read("src/components/products/CatalogProductGrid.tsx");
const css = read("src/app/globals.css");

const hitArea = /before:absolute before:-inset-1 before:content-\[''\]/;

assert.match(heart, /absolute top-2 right-2 z-10/, "Heart stays top-right");
assert.match(heart, /flex h-9 w-9 items-center justify-center/, "Heart visual stays 36px");
assert.match(heart, hitArea, "Heart hit-area expands to 44px");
assert.doesNotMatch(heart, /h-11 w-11/, "Heart visual is not enlarged to 44px");

assert.match(play, /absolute bottom-2 right-2 z-10/, "Play stays bottom-right");
assert.match(play, /flex h-9 w-9 items-center justify-center/, "Play visual stays 36px");
assert.match(play, /className="h-4 w-4"/, "Play icon size is unchanged");
assert.match(play, hitArea, "Play hit-area expands to 44px");
assert.doesNotMatch(play, /h-11 w-11/, "Play visual is not enlarged to 44px");

assert.match(card, /aspect-square/, "media zone stays 1:1");
assert.doesNotMatch(card, /aspect-\[3\/4\]/, "media zone is not 3:4");
assert.match(card, /CatalogProductHeartButton/, "Heart stays on the card");
assert.match(card, /CatalogProductPlayButton/, "Play stays on the card");

assert.match(
  css,
  /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  "mobile grid stays 2 columns",
);
assert.match(grid, /catalog-product-grid/, "grid class is unchanged");

console.log("catalog-hit-area-ui-unit: ok");
