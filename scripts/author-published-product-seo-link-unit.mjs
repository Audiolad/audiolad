#!/usr/bin/env node
/**
 * Focused unit: attach SEO query to already published products (retrofit).
 *
 * Aurafon keeps the existing attach surface for every product kind.
 * Other authors get the same linker only for factual music / release,
 * including legacy albums where publication_class is null.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isAuthorProductWizardEnabled } from "../src/lib/author-products/product-wizard-beta.ts";
import {
  isAuthorSeoDiscoveryEnabled,
  isMusicCreateSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";
import {
  assertPublishedProductSeoAttachEnabled,
  isPublishedProductSeoAttachEnabled,
} from "../src/lib/seo-queries/published-product-seo-attach-gate.ts";
import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import { mapPublishedSeoAttachError } from "../src/lib/seo-queries/published-product-seo-attach.ts";
import { PRODUCT_CONTENT_LIMITS } from "../src/lib/author-products/limits.ts";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const OTHER_AUTHOR_ID = "00000000-0000-4000-8000-000000000099";
const migName = "20261023120000_attach_published_seo_query_to_product.sql";
const mig = read(`supabase/migrations/${migName}`);
const route = read("src/app/api/author/products/[id]/seo-primary-query/route.ts");
const lib = read("src/lib/seo-queries/published-product-seo-attach.ts");
const gate = read("src/lib/seo-queries/published-product-seo-attach-gate.ts");
const linker = read(
  "src/components/author-dashboard/AuthorPublishedProductSeoQueryLinker.tsx",
);
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const wizardBeta = read("src/lib/author-products/product-wizard-beta.ts");
const discoveryBeta = read("src/lib/seo-queries/discovery-beta.ts");
const draftLinkMig = read(
  "supabase/migrations/20261021120000_seo_reservation_product_primary_sync.sql",
);
const occupancySql = read(
  "supabase/tests/author_published_product_seo_attach_behavior.sql",
);

// Compatibility: wizard by authorId, not product age / product_kind
assert.equal(isAuthorProductWizardEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorSeoDiscoveryEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorProductWizardEnabled(OTHER_AUTHOR_ID), false);
assert.equal(isAuthorSeoDiscoveryEnabled(OTHER_AUTHOR_ID), false);
assert.match(wizardBeta, /isAurafonAuthor/);
assert.match(form, /isAuthorProductWizardEnabled\(form\.authorId\)/);
assert.match(form, /showPublishedSeoLinker/);

// A. Aurafon published product → attach enabled, as before.
assert.equal(
  isPublishedProductSeoAttachEnabled({ authorId: AURAFON_AUTHOR_ID }),
  true,
);
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: AURAFON_AUTHOR_ID,
    productKind: PRODUCT_KIND.PRACTICE,
    publicationClass: "practice",
  }),
  true,
);
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: AURAFON_AUTHOR_ID,
    productKind: PRODUCT_KIND.PRACTICE,
    publicationClass: "course",
  }),
  true,
);

// B. non-Aurafon + productKind=music → published attach enabled.
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: OTHER_AUTHOR_ID,
    productKind: PRODUCT_KIND.MUSIC,
  }),
  true,
);

// C. non-Aurafon + publicationClass=release → enabled.
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: OTHER_AUTHOR_ID,
    publicationClass: "release",
  }),
  true,
);

// D. legacy music: productKind=music + publicationClass null → enabled.
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: OTHER_AUTHOR_ID,
    productKind: PRODUCT_KIND.MUSIC,
    publicationClass: null,
  }),
  true,
);

// E / F. non-Aurafon practice / course stay closed.
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: OTHER_AUTHOR_ID,
    productKind: PRODUCT_KIND.PRACTICE,
    publicationClass: "practice",
  }),
  false,
);
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: OTHER_AUTHOR_ID,
    productKind: PRODUCT_KIND.PRACTICE,
    publicationClass: "course",
  }),
  false,
);
assert.equal(
  isPublishedProductSeoAttachEnabled({
    authorId: OTHER_AUTHOR_ID,
    productKind: PRODUCT_KIND.AUDIO_POST,
    publicationClass: "post",
  }),
  false,
);
assert.throws(
  () =>
    assertPublishedProductSeoAttachEnabled({
      authorId: OTHER_AUTHOR_ID,
      productKind: PRODUCT_KIND.PRACTICE,
      publicationClass: "practice",
    }),
  (error) =>
    error instanceof Error &&
    error.message === "seo_discovery_beta_disabled" &&
    error.code === "seo_discovery_beta_disabled" &&
    error.status === 403,
);

// Standalone dashboard gate stays Aurafon-only.
assert.equal(isMusicCreateSeoDiscoveryEnabled({ authorId: OTHER_AUTHOR_ID }), false);
assert.match(discoveryBeta, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(
  discoveryBeta,
  /isPublishedProductSeoAttachEnabled/,
);

// G / H. Form uses the canonical published attach gate, not Aurafon-only discovery.
assert.match(form, /isPublishedProductSeoAttachEnabled\(\{/);
assert.match(form, /authorId:\s*form\.authorId/);
assert.match(form, /productKind:\s*form\.productKind/);
assert.match(form, /publicationClass:\s*form\.publicationClass/);
assert.match(
  form,
  /showPublishedSeoLinker =\s*\n\s*mode === "edit" &&\s*\n\s*publishedProductStatus &&\s*\n\s*publishedSeoAttachEnabled &&\s*\n\s*!hasRelationalPrimarySeoQuery/,
);
assert.doesNotMatch(form, /isAuthorSeoDiscoveryEnabled\(form\.authorId\)/);
assert.doesNotMatch(form, /from "@\/lib\/seo-queries\/discovery-beta"/);

// I. Route uses the same canonical gate and factual server-side fields.
assert.match(route, /assertPublishedProductSeoAttachEnabled/);
assert.match(route, /from "@\/lib\/seo-queries\/published-product-seo-attach-gate"/);
assert.match(route, /authorId:\s*practice\.author_id/);
assert.match(route, /productKind:\s*practice\.product_kind/);
assert.match(route, /publicationClass:\s*practice\.publication_class/);
assert.doesNotMatch(route, /assertPublishedSeoAttachBeta/);
assert.doesNotMatch(route, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(lib, /assertPublishedSeoAttachBeta/);
assert.doesNotMatch(lib, /isAuthorSeoDiscoveryEnabled/);
assert.match(gate, /isAuthorSeoDiscoveryEnabled\(input\.authorId\)/);
assert.match(gate, /isMusicProductWizardEnabled/);
assert.doesNotMatch(gate, /import "server-only"/);

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

// Published SEO attach must be the immediate next migration after spa seed.
// Later migrations (e.g. partner foundation) may follow; do not freeze the tail length.
const migs = readdirSync(path.join(root, "supabase/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort();
assert.ok(migs.includes(migName));
assert.ok(migs.includes("20261022120000_seo_spa_massage_queries_seed.sql"));
const after = migs.filter((n) => n > "20261022120000_seo_spa_massage_queries_seed.sql");
assert.ok(after.includes(migName), "published SEO attach migration missing after spa seed");
assert.equal(after[0], migName, "published SEO attach must immediately follow spa seed");

// API security + operations
assert.match(route, /requirePracticeMutationAccess/);
assert.match(route, /createServiceRoleClient/);
assert.match(route, /searchPublishedProductSeoQueries/);
assert.match(route, /attachPublishedProductSeoQuery/);
assert.match(route, /query_id/);
assert.match(route, /query_text/);
assert.doesNotMatch(route, /fetchWordstat/);
assert.doesNotMatch(lib, /fetchWordstat/);
assert.match(lib, /import "server-only"/);
assert.match(lib, /attach_published_seo_query_to_product/);
assert.match(lib, /frequency:\s*\n\s*typeof row\.frequency === "number"/);

// J / K. Existing one-click legacy CTA and manual search/attach stay.
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

// Pre-merge cleanup: exact lookup ignores analysis_status; fuzzy stays analyzed
assert.match(lib, /Exact match ignores analysis_status/);
assert.match(lib, /isEffectiveSeoReservation/);
assert.match(lib, /expires_at/);
{
  const exactStart = lib.indexOf('.eq("normalized_query", normalized)');
  assert.ok(exactStart > 0, "exact normalized lookup present");
  const beforeExact = lib.slice(exactStart - 200, exactStart);
  // The exact query builder must not chain .eq("analysis_status"...) immediately before normalized eq
  assert.doesNotMatch(beforeExact, /\.eq\("analysis_status", "analyzed"\)\s*\n\s*\.eq\("normalized_query"/);
  const fuzzySlice = lib.slice(exactStart, exactStart + 500);
  assert.match(fuzzySlice, /\.eq\("analysis_status", "analyzed"\)/);
}

// Legacy CTA: single-action attach (find-or-create via published RPC)
assert.match(linker, /attach\(\{\s*queryText:\s*legacyHint\s*\}\)/);
assert.doesNotMatch(linker, /void runSearch\(legacyHint\)/);
assert.match(linker, /Закрепляем…/);
assert.match(linker, /attachPending === legacyHint/);
// Manual search flow keeps create confirmation
assert.match(linker, /Добавить запрос и закрепить/);
assert.match(linker, /Подтвердить/);
assert.match(linker, /Поиск по базе запросов/);
assert.doesNotMatch(linker, /selectable\.length === 0 && exactNormalizedMatch \? null : null/);
assert.doesNotMatch(linker, /useMemo/);
// Instant linked UI in form after onAttached
assert.match(form, /linked:\s*true/);
assert.match(form, /seoPrimaryQuery:\s*payload\.queryText/);
assert.match(form, /Запрос закреплён за этим продуктом/);
assert.match(form, /hasRelationalPrimarySeoQuery/);
assert.match(form, /showPublishedSeoLinker/);

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

// L–N occupancy stays in attach_published_seo_query_to_product.
// Proof: supabase/tests/author_published_product_seo_attach_behavior.sql
//   C own active unlinked → used
//   D used by another product → seo_query_already_used
//   G same product / same query → idempotent
assert.match(occupancySql, /own active unlinked → converted to used/);
assert.match(occupancySql, /used by another → seo_query_already_used/);
assert.match(occupancySql, /same product \/ same query → idempotent/);
assert.match(lib, /availability = "used_other"/);
assert.match(lib, /Уже используется/);

// Admin correction path report fixture: used not releasable
const adminRelease = draftLinkMig;
assert.match(adminRelease, /admin_release_seo_query_reservation/);
assert.match(adminRelease, /v_reservation\.status <> 'active'/);

console.log("author-published-product-seo-link-unit: ok");
