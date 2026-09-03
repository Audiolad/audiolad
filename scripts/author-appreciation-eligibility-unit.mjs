#!/usr/bin/env node
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isAppreciationEligibleProductKind,
  isAppreciationProductEligible,
  resolveAuthorAppreciationVisibility,
} from "../src/lib/author-appreciation/effective-visibility.ts";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import { isAppreciationCurrentTermsSatisfied } from "../src/lib/authors/owner-controlled.ts";

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
  visible({ product: { ...base.product, productKind: "music", publicationClass: "release" } }),
  true,
  "free published music supported",
);
assert.equal(
  visible({
    product: {
      ...base.product,
      productKind: "music",
      publicationClass: "release",
      isFree: false,
    },
  }),
  false,
  "paid music hidden",
);
assert.equal(
  visible({
    product: {
      ...base.product,
      productKind: "music",
      publicationClass: "release",
      catalogVisibility: "selected_users",
    },
  }),
  false,
  "selected_users music hidden",
);
assert.equal(
  visible({
    product: {
      ...base.product,
      productKind: "music",
      publicationClass: "release",
      status: "draft",
    },
  }),
  false,
  "unpublished music hidden",
);
assert.equal(
  visible({
    product: {
      ...base.product,
      productKind: "music",
      publicationClass: "release",
      override: false,
    },
  }),
  false,
  "music override OFF hidden",
);
assert.equal(
  visible({
    settings: { ...base.settings, enabled: false },
    product: { ...base.product, productKind: "music", publicationClass: "release" },
  }),
  false,
  "music hidden when author setting OFF",
);
assert.equal(
  visible({
    product: {
      ...base.product,
      productKind: "music",
      publicationClass: "release",
      override: true,
    },
  }),
  true,
  "music override ON visible",
);
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
assert.equal(
  isAppreciationCurrentTermsSatisfied({
    currentTermsAccepted: false,
    ownerControlled: false,
  }),
  false,
  "external commercial author has no terms bypass",
);
assert.equal(
  resolveAuthorAppreciationVisibility({
    surface: "author",
    currentTermsAccepted: isAppreciationCurrentTermsSatisfied({
      currentTermsAccepted: false,
      ownerControlled: true,
    }),
    accessStatus: "commercial_active",
    settings: { enabled: true, profileEnabled: true, freeProductsDefault: true },
  }),
  true,
  "owner-controlled auto-commercial author-page CTA uses existing platform-owned class",
);

assert.equal(isAppreciationEligibleProductKind(PRODUCT_KIND.MUSIC), true);
assert.equal(isAppreciationEligibleProductKind(PRODUCT_KIND.PRACTICE), true);
assert.equal(
  isAppreciationProductEligible({
    ...base.product,
    productKind: PRODUCT_KIND.MUSIC,
    publicationClass: "release",
  }),
  true,
  "free music product eligible regardless of MUSIC_USAGE_PERMISSION",
);

const checkout = readFileSync(
  path.join(process.cwd(), "src/app/api/author-appreciation/checkout/route.ts"),
  "utf8",
);
assert.match(checkout, /isAppreciationProductEligible/);
assert.doesNotMatch(checkout, /music_usage_permission|MUSIC_USAGE_PERMISSION/);
assert.match(checkout, /is_free/);

const visibility = readFileSync(
  path.join(process.cwd(), "src/lib/author-appreciation/effective-visibility.ts"),
  "utf8",
);
assert.doesNotMatch(visibility, /music_usage_permission|MUSIC_USAGE_PERMISSION/);
assert.match(visibility, /PRODUCT_KIND\.MUSIC/);

const form = readFileSync(
  path.join(process.cwd(), "src/components/author-dashboard/AuthorProductForm.tsx"),
  "utf8",
);
assert.match(form, /canConfigureProductAppreciation/);

const overrideHelper = readFileSync(
  path.join(process.cwd(), "src/lib/author-products/appreciation-override.ts"),
  "utf8",
);
assert.match(overrideHelper, /isAppreciationEligibleProductKind/);
assert.doesNotMatch(overrideHelper, /music_usage_permission|MUSIC_USAGE_PERMISSION/);

console.log("author-appreciation-eligibility-unit: ok");
