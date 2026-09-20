#!/usr/bin/env node
/**
 * Focused unit: attach SEO query to published Aurafon products (retrofit).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isAuthorProductWizardEnabled } from "../src/lib/author-products/product-wizard-beta.ts";
import { isAuthorSeoDiscoveryEnabled } from "../src/lib/seo-queries/discovery-beta.ts";
import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import { mapPublishedSeoAttachError } from "../src/lib/seo-queries/published-product-seo-attach.ts";
import { PRODUCT_CONTENT_LIMITS } from "../src/lib/author-products/limits.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const migName = "20261023120000_attach_published_seo_query_to_product.sql";
const mig = read(`supabase/migrations/${migName}`);
const route = read("src/app/api/author/products/[id]/seo-primary-query/route.ts");
const lib = read("src/lib/seo-queries/published-product-seo-attach.ts");
const linker = read(
  "src/components/author-dashboard/AuthorPublishedProductSeoQueryLinker.tsx",
);
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const wizardBeta = read("src/lib/author-products/product-wizard-beta.ts");
const draftLinkMig = read(
  "supabase/migrations/20261021120000_seo_reservation_product_primary_sync.sql",
);

// Compatibility: wizard by authorId, not product age / product_kind
assert.equal(isAuthorProductWizardEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorSeoDiscoveryEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorProductWizardEnabled("00000000-0000-0000-0000-000000000099"), false);
assert.match(wizardBeta, /isAurafonAuthor/);
assert.match(form, /isAuthorProductWizardEnabled\(form\.authorId\)/);
assert.match(form, /showPublishedSeoLinker/);
assert.doesNotMatch(form, /showPublishedSeoLinker[\s\S]{0,200}product_kind/);
assert.doesNotMatch(form, /showPublishedSeoLinker[\s\S]{0,200}PRODUCT_KIND\.MUSIC/);

// Migration: one additive function, service_role only
assert.match(mig, /attach_published_seo_query_to_product/);
assert.match(mig, /status = 'used'/);
assert.match(mig, /expires_at = NULL/);
assert.match(mig, /primary_seo_query_id = v_query\.id/);
assert.match(mig, /seo_primary_query = v_query\.query_text/);
assert.match(mig, /audiolad\.allow_primary_seo_query_link/);
assert.match(mig, /seo_query_already_used/);
assert.match(mig, /seo_query_already_reserved/);
assert.match(mig, /seo_attach_product_not_published/);
assert.match(mig, /seo_query_too_long_for_product/);
assert.match(mig, /char_length\(v_query\.query_text\) > 120/);
assert.match(mig, /source,\s*\n\s*frequency,/);
assert.match(mig, /'manual'/);
assert.match(mig, /analysis_status/);
assert.match(mig, /product_kind = 'music'/);
assert.match(mig, /GRANT EXECUTE[\s\S]*TO service_role/);
assert.match(mig, /REVOKE ALL[\s\S]*FROM authenticated/);
assert.match(mig, /REVOKE ALL[\s\S]*FROM anon/);
assert.doesNotMatch(mig, /CREATE TABLE/);
assert.doesNotMatch(mig, /ADD COLUMN/);
assert.doesNotMatch(mig, /CREATE INDEX/);

// Draft-link RPC unchanged semantics in prior migration
assert.match(draftLinkMig, /seo_reservation_product_not_linkable/);
assert.match(draftLinkMig, /status <> 'draft'/);
assert.doesNotMatch(draftLinkMig, /attach_published_seo_query_to_product/);

// Exactly one new migration after spa seed for this feature
const migs = readdirSync(path.join(root, "supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort();
assert.ok(migs.includes(migName));
assert.ok(migs.includes("20261022120000_seo_spa_massage_queries_seed.sql"));
const after = migs.filter((n) => n > "20261022120000_seo_spa_massage_queries_seed.sql");
assert.equal(after.length, 1);
assert.equal(after[0], migName);

// API security + operations
assert.match(route, /requirePracticeMutationAccess/);
assert.match(route, /createServiceRoleClient/);
assert.match(route, /assertPublishedSeoAttachBeta|isAuthorSeoDiscoveryEnabled/);
assert.match(route, /searchPublishedProductSeoQueries/);
assert.match(route, /attachPublishedProductSeoQuery/);
assert.match(route, /query_id/);
assert.match(route, /query_text/);
assert.doesNotMatch(route, /fetchWordstat/);
assert.doesNotMatch(lib, /fetchWordstat/);
assert.match(lib, /import "server-only"/);
assert.match(lib, /attach_published_seo_query_to_product/);
assert.match(lib, /frequency:\s*\n\s*typeof row\.frequency === "number"/);

// UI
assert.match(linker, /Закрепить поисковый запрос/);
assert.match(linker, /Поиск по базе запросов/);
assert.match(linker, /Сейчас в продукте указан запрос:/);
assert.match(linker, /Закрепить этот запрос/);
assert.match(linker, /Добавить запрос и закрепить/);
assert.match(linker, /Самостоятельно заменить его[\s\S]*после закрепления нельзя/);
assert.match(linker, /Закрепить за продуктом/);
assert.match(lib, /Уже используется/);
assert.match(linker, /item\.statusLabel/);
assert.match(linker, /formatMonthlyFrequency/);
assert.match(linker, /value === null/);
assert.doesNotMatch(linker, /Запросов в месяц: 0/);
assert.match(linker, /router\.refresh\(\)/);
assert.match(form, /AuthorPublishedProductSeoQueryLinker/);
assert.match(form, /Для опубликованного продукта закрепите основной запрос через блок выше/);
assert.match(form, /Запрос закреплён за этим продуктом/);
assert.match(form, /linked:\s*true/);

// Error map + limit
assert.equal(PRODUCT_CONTENT_LIMITS.seoPrimaryQuery, 120);
assert.equal(
  mapPublishedSeoAttachError("seo_query_too_long_for_product").status,
  409,
);
assert.match(
  mapPublishedSeoAttachError("seo_query_too_long_for_product").message,
  /слишком длинный/,
);

// Admin correction path report fixture: used not releasable
const adminRelease = draftLinkMig;
assert.match(adminRelease, /admin_release_seo_query_reservation/);
assert.match(adminRelease, /v_reservation\.status <> 'active'/);

console.log("author-published-product-seo-link-unit: ok");
