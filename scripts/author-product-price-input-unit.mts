#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  buildAuthorProductPriceFields,
  parsePriceInputDraft,
  validatePaidPriceInputDraft,
} from "../src/lib/author-products/price-input-draft";
import { normalizeStudioMusicPricingForSave } from "../src/lib/studio-music/pricing";

// String drafts keep native number inputs empty during intermediate edits.
let studioDraft = String(600);
studioDraft = "";
assert.equal(studioDraft, "");
assert.equal(parsePriceInputDraft(studioDraft), null);
studioDraft = `${studioDraft}1500`;
assert.equal(parsePriceInputDraft(studioDraft), 1500);

let listenerDraft = String(499);
listenerDraft = "";
assert.equal(listenerDraft, "");
listenerDraft = `${listenerDraft}888`;
assert.equal(parsePriceInputDraft(listenerDraft), 888);

// Empty, zero, out-of-range, fractional, and negative values cannot be saved.
for (const value of ["", "0", "48", "100001", "49.5", "-49"]) {
  assert.deepEqual(validatePaidPriceInputDraft(value), { ok: false }, value);
}
assert.deepEqual(validatePaidPriceInputDraft("1888"), {
  ok: true,
  rubles: 1888,
});

// Listener drafts save their valid integer-ruble value unchanged.
assert.deepEqual(
  buildAuthorProductPriceFields({
    productKind: "music",
    isFree: false,
    price: 888,
    musicUsagePermission: "listen_only",
    studioMusicPricingMode: null,
    studioMusicPriceRubles: 600,
  }),
  { studio_music_price: null, price: 888 },
);

// A valid Studio FIXED draft is sent in rubles and normalized to minor units.
const studioFields = buildAuthorProductPriceFields({
  productKind: "music",
  isFree: false,
  price: 499,
  musicUsagePermission: "platform_reuse_allowed",
  studioMusicPricingMode: "fixed",
  studioMusicPriceRubles: 1888,
});
assert.deepEqual(studioFields, { studio_music_price: 1888, price: 499 });
assert.deepEqual(
  normalizeStudioMusicPricingForSave({
    productKind: "music",
    musicUsagePermission: "platform_reuse_allowed",
    listenerIsFree: false,
    mode: "fixed",
    priceRubles: studioFields.studio_music_price,
  }),
  { ok: true, mode: "fixed", priceMinor: 188800 },
);

console.log("author-product-price-input-unit: ok");
