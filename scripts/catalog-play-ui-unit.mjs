#!/usr/bin/env node
/**
 * Catalog Play UI: Play stays in the media zone, no /listen navigation.
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
const play = read("src/components/products/CatalogProductPlayButton.tsx");
const mini = read("src/components/audio/GlobalMiniPlayer.tsx");
const desktop = read("src/components/listener/DesktopPlayerBar.tsx");
const cta = read("src/components/audio/PreviewEndedBuyCta.tsx");
const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
const listingApi = read("src/app/api/catalog/route.ts");

assert.match(card, /aspect-\[3\/4\]/, "approved 3:4 media zone stays");
assert.match(card, /absolute bottom-2 right-2|CatalogProductPlayButton/, "Play is on the card");
assert.doesNotMatch(card, /href=\{?["']\/listen/, "card does not link Play to /listen");
assert.doesNotMatch(card, /Heart|Избранн/, "Heart UI stays out of this PR");

assert.match(play, /data-catalog-play-button/, "Play button is marked");
assert.match(play, /entrySurface:\s*"catalog"/, "catalog Play sets entrySurface");
assert.match(play, /sourceType:\s*"catalog"/, "sourceType stays catalog");
assert.match(play, /fetchCatalogPlaySession/, "Play uses catalog session loader");
assert.match(play, /prepareSharedAudioGesture/, "Play unlocks the shared audio element");
assert.doesNotMatch(play, /href=["']\/listen/, "Play does not navigate to /listen");
assert.doesNotMatch(play, /router\.(push|replace)/, "Play does not change the URL");

assert.match(mini, /PreviewEndedBuyCta/, "mini player can show Купить after preview");
assert.match(desktop, /PreviewEndedBuyCta/, "desktop player can show Купить after preview");
assert.match(cta, /BuyPracticeButton/, "preview CTA reuses BuyPracticeButton");
assert.match(cta, /purchaseSurface="preview"/, "preview CTA uses existing purchase surface");
assert.match(cta, /POST \/api\/orders|BuyPracticeButton/, "purchase stays on the existing flow");

assert.match(provider, /playbackMode: catalogSession\?\.playbackMode/, "engine receives playbackMode");
assert.match(provider, /previewStartMs: catalogSession\?\.previewStartMs/, "engine receives preview start");
assert.match(provider, /previewEndMs: catalogSession\?\.previewEndMs/, "engine receives preview end");

assert.doesNotMatch(listingApi, /playbackMode|entrySurface|previewStartMs/, "GET /api/catalog is unchanged");

console.log("catalog-play-ui-unit: ok");
