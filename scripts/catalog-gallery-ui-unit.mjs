#!/usr/bin/env node
/**
 * Catalog gallery UI: 1:1 slides, swipe stays inside the media zone, 30 slides
 * do not widen the 2-column grid.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const gallery = read("src/components/catalog/cards/CatalogCardGallery.tsx");
const shell = read("src/components/catalog/cards/CatalogCardShell.tsx");
const css = read("src/app/globals.css");
const grid = read("src/components/products/CatalogProductGrid.tsx");

assert.match(gallery, /data-catalog-gallery/, "gallery scroller is marked");
assert.match(gallery, /catalog-card-gallery-slide/, "slides use the snap class");
assert.match(shell, /data-catalog-media-zone/, "gallery lives in the media zone");
assert.match(shell, /CatalogProductPlayButton/, "Play stays outside the scroller");
assert.match(shell, /CatalogProductHeartButton/, "Heart stays outside the scroller");
assert.match(shell, /card\.paths\.pdp/, "info block still opens PDP");
assert.match(gallery, /href=\{pdpHref\}/, "slides still open PDP");
assert.doesNotMatch(gallery, /href=["']\/listen/, "slides do not go to /listen");

assert.match(css, /flex:\s*0\s+0\s+100%/, "each slide is exactly one card wide");
assert.match(css, /scroll-snap-type:\s*x mandatory/, "gallery snaps horizontally");
assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/, "gallery stays 1:1");
assert.match(
  css,
  /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  "mobile grid stays 2 columns",
);
assert.match(grid, /min-w-0/, "grid items can shrink so 30 slides do not expand");
assert.match(shell, /min-w-0/, "card can shrink inside the 2-column track");
assert.match(
  css,
  /\.catalog-card-gallery\s*\{[^}]*width:\s*100%;/,
  "gallery track is one card wide, not N slides wide",
);
assert.doesNotMatch(
  css,
  /\.catalog-card-gallery\s*\{[^}]*width:\s*(calc\(|[2-9]\d{2,}%)/,
  "gallery width is not multiplied by slide count",
);

const listing = read("src/lib/catalog/listing.ts");
assert.match(
  listing,
  /gallery:\s*product\.gallery\s*\?\?\s*\[\]/,
  "listing source forwards stored publication gallery",
);
assert.doesNotMatch(
  listing,
  /gallery:\s*\[\]/,
  "listing no longer hardcodes an empty gallery",
);

console.log("catalog-gallery-ui-unit: ok");
