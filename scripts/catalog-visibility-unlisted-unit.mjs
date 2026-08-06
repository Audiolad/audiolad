#!/usr/bin/env node
/**
 * Regression: unlisted (published + is_catalog_listed=false) must stay off
 * public storefronts, while publish/approve must preserve the author choice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const migration = read(
  "supabase/migrations/20260805194500_preserve_catalog_listed_on_publish.sql",
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.publish_audio_product/);
assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.approve_and_publish_practice/,
);
assert.match(
  migration,
  /v_catalog_listed := CASE[\s\S]*WHEN v_starter THEN false[\s\S]*ELSE COALESCE\(v_practice\.is_catalog_listed, true\)/,
);
assert.match(migration, /publish-audio-product:v9/);
assert.match(migration, /approve-and-publish-practice:v2/);
assert.doesNotMatch(
  migration,
  /is_catalog_listed\s*=\s*true(?!\s*,|\s*\))/,
);
assert.doesNotMatch(migration, /is_catalog_listed\s*=\s*NOT v_starter/);

// Form + API preserve visibility choice
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /isCatalogListed: true/);
assert.match(form, /isCatalogListed: false/);
assert.match(form, /is_catalog_listed: form\.isCatalogListed/);
assert.match(form, /По ссылке/);

const formMerge = read("src/lib/author-products/form-merge.ts");
assert.match(formMerge, /isCatalogListed: practice\.is_catalog_listed !== false/);

const productRoute = read("src/app/api/author/products/[id]/route.ts");
assert.match(productRoute, /updates\.is_catalog_listed = body\.is_catalog_listed/);

// Public storefronts require catalog listing
const catalog = read("src/lib/products/catalog.ts");
assert.match(catalog, /\.eq\("is_catalog_listed", true\)/);

const search = read("src/lib/catalog/search.ts");
assert.equal(
  (search.match(/\.eq\("is_catalog_listed", true\)/g) ?? []).length >= 2,
  true,
  "catalog search filters listed products",
);

const authorPage = read("src/lib/authors/public-page.ts");
assert.match(authorPage, /\.eq\("is_catalog_listed", true\)/);
assert.match(authorPage, /listedProductIds/);

const authorLookup = read("src/lib/authors/lookup.ts");
assert.match(authorLookup, /\.eq\("is_catalog_listed", true\)/);

const home = read("src/lib/home/listening-progress.ts");
assert.match(home, /\.eq\("is_catalog_listed", true\)/);

const topics = read("src/lib/topics/queries.ts");
assert.match(topics, /\.eq\("is_catalog_listed", true\)/);

const sitemap = read("src/lib/seo/sitemap-data.ts");
assert.match(sitemap, /\.eq\("is_catalog_listed", true\)/);

const editorial = read("src/lib/playlists/editorial-practices.ts");
assert.match(editorial, /\.eq\("is_catalog_listed", true\)/);

// Direct product lookup must NOT require catalog listing
const lookup = read("src/lib/products/lookup.ts");
assert.doesNotMatch(lookup, /\.eq\("is_catalog_listed"/);

const practicePage = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");
assert.match(practicePage, /shouldIndexPracticePage/);
assert.match(practicePage, /practice\.is_catalog_listed/);
assert.match(practicePage, /index: false/);

const jsonLd = read("src/lib/seo/json-ld/builders.ts");
assert.match(jsonLd, /isCatalogListed === false/);

const indexHelper = read("src/lib/products/publish-preview.ts");
assert.match(indexHelper, /export function shouldIndexPracticePage/);
assert.match(indexHelper, /isCatalogListed/);

console.log("catalog-visibility-unlisted-unit: ok");
