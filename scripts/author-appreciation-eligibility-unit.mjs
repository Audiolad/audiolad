#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  resolveAuthorAppreciationVisibility,
} from "../src/lib/author-appreciation/effective-visibility.ts";

const base = {
  surface: "product",
  currentTermsAccepted: true,
  accessStatus: "commercial_active",
  settings: { enabled: true, profileEnabled: true, freeProductsDefault: true },
  product: {
    status: "published",
    isFree: true,
    publicationClass: "practice",
    productKind: "practice",
    catalogVisibility: "listed",
    isCatalogListed: true,
    override: null,
  },
};

const visible = (input = {}) =>
  resolveAuthorAppreciationVisibility({ ...base, ...input });

assert.equal(visible(), true, "commercial active + inherited defaults");
assert.equal(visible({ accessStatus: "free" }), false, "non-commercial hidden");
assert.equal(visible({ settings: { ...base.settings, enabled: false } }), false, "global OFF wins");
assert.equal(visible({ settings: { ...base.settings, freeProductsDefault: false } }), false, "default OFF");
assert.equal(visible({ settings: { ...base.settings, freeProductsDefault: false }, product: { ...base.product, override: true } }), true, "explicit product ON");
assert.equal(visible({ product: { ...base.product, override: false } }), false, "explicit product OFF");
assert.equal(visible({ product: { ...base.product, isFree: false } }), false, "paid hidden");
assert.equal(visible({ product: { ...base.product, publicationClass: "course" } }), false, "course hidden");
assert.equal(visible({ product: { ...base.product, status: "draft" } }), false, "draft hidden");
assert.equal(visible({ product: { ...base.product, catalogVisibility: "selected_users" } }), false, "private hidden");
assert.equal(visible({ product: { ...base.product, productKind: "audio_post", publicationClass: "post" } }), true, "free audio post supported");
assert.equal(visible({ product: { ...base.product, publicationClass: "practice", productKind: "practice" } }), true, "free single or multi practice supported");
assert.equal(
  resolveAuthorAppreciationVisibility({
    surface: "author",
    currentTermsAccepted: true,
    accessStatus: "commercial_active",
    settings: { enabled: true, profileEnabled: true, freeProductsDefault: false },
  }),
  true,
);
assert.equal(
  resolveAuthorAppreciationVisibility({
    surface: "author",
    currentTermsAccepted: true,
    accessStatus: "commercial_active",
    settings: { enabled: true, profileEnabled: false, freeProductsDefault: true },
  }),
  false,
);
assert.equal(visible({ previewActive: false }), true, "ordinary URL without preview is public");
assert.equal(visible({ previewActive: true }), true, "preview query remains compatible");
assert.equal(
  visible({ currentTermsAccepted: false }),
  false,
  "stale or unaccepted current Author Terms hide CTA",
);
assert.equal(
  resolveAuthorAppreciationVisibility({
    surface: "author",
    currentTermsAccepted: false,
    accessStatus: "commercial_active",
    settings: { enabled: true, profileEnabled: true, freeProductsDefault: true },
  }),
  false,
  "commercial_active does not imply current terms",
);

console.log("author-appreciation-eligibility-unit: ok");
