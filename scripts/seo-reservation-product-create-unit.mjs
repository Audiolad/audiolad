#!/usr/bin/env node
/**
 * Focused unit coverage: SEO reservation → product create (Aurafon closed beta).
 * A–H per product brief: URL, wizard, CTA, loader, form/Step3, link helper, SQL RPC, script.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSeoReservationProductCreateHref,
  SEO_RESERVATION_ID_PARAM,
} from "../src/lib/seo-queries/reservation-product-create-href.ts";
import { mapSeoReservationLinkError } from "../src/lib/seo-queries/seo-reservation-product-context.ts";
import { PRODUCT_CONTENT_LIMITS } from "../src/lib/author-products/limits.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

// A — URL helper: reservation UUID only, never query text
assert.equal(SEO_RESERVATION_ID_PARAM, "seo_reservation_id");
assert.equal(
  buildSeoReservationProductCreateHref({
    authorSlug: "aurafon",
    reservationId: "11111111-1111-1111-1111-111111111111",
  }),
  "/author-dashboard/products/new?author=aurafon&seo_reservation_id=11111111-1111-1111-1111-111111111111",
);
assert.equal(
  buildSeoReservationProductCreateHref({
    authorSlug: "aurafon",
    reservationId: "11111111-1111-1111-1111-111111111111",
    publicationClass: "release",
    step: 1,
  }),
  "/author-dashboard/products/new?author=aurafon&seo_reservation_id=11111111-1111-1111-1111-111111111111&class=release&step=1",
);
assert.doesNotMatch(
  buildSeoReservationProductCreateHref({
    authorSlug: "aurafon",
    reservationId: "rid",
  }),
  /query|q=|text=/i,
);

const hrefSrc = read("src/lib/seo-queries/reservation-product-create-href.ts");
assert.match(hrefSrc, /SEO_RESERVATION_ID_PARAM/);
assert.doesNotMatch(hrefSrc, /query_text|queryText/);

// B — CreateWizard preserves reservation via helper
const wizard = read("src/components/author-dashboard/AuthorCreateWizard.tsx");
assert.match(wizard, /buildAuthorProductCreateHref/);
assert.match(wizard, /seoReservationId/);
assert.match(wizard, /publicationClass:\s*input\.publicationClass/);
assert.match(wizard, /reservationId:\s*input\.seoReservationId/);

// C — Opportunities: beta uses reservation href; non-beta keeps legacy create href
const opportunities = read(
  "src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx",
);
assert.match(opportunities, /buildSeoReservationProductCreateHref/);
assert.match(opportunities, /Создать продукт по этому запросу/);
assert.match(opportunities, /authorSlug=\{authorSlug\}/);
assert.match(
  opportunities,
  /discoveryEnabled \? buildSeoReservationProductCreateHref\(\{ authorSlug, reservationId: item\.reservationId \}\)/,
);
assert.match(
  opportunities,
  /\/author-dashboard\/products\/new\?author=\$\{encodeURIComponent\(authorSlug\)\}/,
);
assert.match(
  opportunities,
  /discoveryEnabled \? buildSeoReservationProductCreateHref[\s\S]*?: `\/author-dashboard\/products\/new\?author=\$\{encodeURIComponent\(authorSlug\)\}`/,
);

const panel = read(
  "src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx",
);
assert.match(panel, /authorSlug:\s*string/);
assert.match(panel, /buildAuthorProductCreateHref/);
assert.match(panel, /Создать продукт по этому запросу/);
assert.match(panel, /Открыть продукт/);
assert.match(panel, /productId/);
assert.doesNotMatch(
  panel,
  /seo_reservation_id=\$\{|query_text=|encodeURIComponent\(.*query/,
);

const createStep = read(
  "src/components/author-dashboard/AuthorProductSeoQueryStep.tsx",
);
assert.match(
  createStep,
  /AuthorSeoDiscoveryPanel[\s\S]*?authorSlug=\{authorSlug\}/,
);
assert.doesNotMatch(
  read("src/components/author-dashboard/AuthorDashboardClient.tsx"),
  /AuthorSeoDiscoveryPanel/,
);

// D — Server loader: beta gate, ownership, no client query text trust
const loader = read(
  "src/lib/seo-queries/load-seo-reservation-product-create-context.ts",
);
assert.match(loader, /import "server-only"/);
assert.match(loader, /isAuthorSeoDiscoveryEnabled/);
assert.match(loader, /seo_query_reservations/);
assert.match(loader, /author_id !== input\.authorId/);
assert.match(loader, /code:\s*"expired"/);
assert.match(loader, /code:\s*"already_linked"/);
assert.match(loader, /code:\s*"query_too_long"/);
assert.match(
  loader,
  /PRODUCT_CONTENT_LIMITS\.seoPrimaryQuery/,
);
assert.equal(PRODUCT_CONTENT_LIMITS.seoPrimaryQuery, 120);
assert.doesNotMatch(loader, /searchParams|URLSearchParams/);

const newPage = read(
  "src/app/(platform)/author-dashboard/products/new/page.tsx",
);
assert.match(newPage, /seo_reservation_id/);
assert.match(newPage, /loadSeoReservationProductCreateContext/);
assert.match(newPage, /initialSeoReservationContext/);
assert.match(newPage, /AuthorCreateWizard/);
assert.match(newPage, /authorSlug=\{initialAuthor\.slug\}/);
assert.doesNotMatch(newPage, /AuthorCreateWizard[\s\S]{0,120}authorSlug=\{params\.author\}/);
assert.match(newPage, /seoReservationId=/);
assert.match(newPage, /seo-opportunities/);

const editPage = read(
  "src/app/(platform)/author-dashboard/products/[id]/page.tsx",
);
assert.match(editPage, /primary_seo_query_id/);
assert.match(editPage, /initialSeoReservationContext/);
assert.match(editPage, /linked:\s*true/);

// E — Form: Step1 banner/prefill, linked canonical wins, first-save auto-link, Step3 lock
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /initialSeoReservationContext/);
assert.match(
  form,
  /seoPrimaryQuery:\s*initialSeoReservationContext\?\.queryText/,
);
assert.match(form, /linkedQueryText/);
assert.match(
  form,
  /seoPrimaryQuery:\s*linkedQueryText \?\? snapshot\.seoPrimaryQuery/,
);
assert.match(form, /linkSeoReservationToProduct/);
assert.match(form, /!seoReservationContext\.linked/);
assert.match(form, /primaryQueryLocked/);
assert.match(form, /seoReservationContext\.queryText/);
assert.match(
  form,
  /buildInitialForm\(\s*authors,\s*initialAuthorSlug,\s*productPayload\.product,\s*undefined,\s*seoReservationContext,\s*\)/,
);
// Autofill request body uses the form seoPrimaryQuery (canonical after linked init)
const seoSection = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(seoSection, /\/api\/author\/seo\/product-autofill/);
assert.match(seoSection, /seoPrimaryQuery,/);
assert.match(form, /seoPrimaryQuery=\{form\.seoPrimaryQuery\}/);

const section = read(
  "src/components/author-dashboard/AuthorProductSeoSection.tsx",
);
assert.match(section, /primaryQueryLocked/);
assert.match(section, /readOnly=\{primaryQueryLocked\}/);
assert.match(section, /!primaryQueryLocked && !seoPrimaryQuery\.trim\(\)/);

// F — Client link helper + API error mapping
const ctx = read("src/lib/seo-queries/seo-reservation-product-context.ts");
assert.match(ctx, /linkSeoReservationToProduct/);
assert.match(ctx, /\/api\/author\/seo-reservations/);
assert.match(ctx, /mapSeoReservationLinkError/);

assert.equal(
  mapSeoReservationLinkError("seo_reservation_expired").code,
  "seo_reservation_expired",
);
assert.equal(
  mapSeoReservationLinkError("seo_reservation_already_linked").code,
  "seo_reservation_already_linked",
);
assert.equal(
  mapSeoReservationLinkError("seo_query_too_long_for_product").code,
  "seo_query_too_long_for_product",
);
assert.equal(
  mapSeoReservationLinkError("practice_already_has_primary_seo_query").code,
  "practice_already_has_primary_seo_query",
);
assert.match(
  mapSeoReservationLinkError("unknown").message,
  /Черновик создан/,
);

const reservationsRoute = read(
  "src/app/api/author/seo-reservations/route.ts",
);
assert.match(reservationsRoute, /seo_reservation_expired/);
assert.match(reservationsRoute, /seo_reservation_already_linked/);
assert.match(reservationsRoute, /seo_query_too_long_for_product/);
assert.match(reservationsRoute, /practice_already_has_primary_seo_query/);

// G — SQL migration: link sets both primaries; release clears both; A–H semantics
const migration = read(
  "supabase/migrations/20261021120000_seo_reservation_product_primary_sync.sql",
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.link_seo_reservation_to_product/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.release_seo_query_reservation/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_release_seo_query_reservation/);
// A link sets both fields from seo_queries
assert.match(migration, /primary_seo_query_id = v_reservation\.query_id/);
assert.match(migration, /seo_primary_query = v_query\.query_text/);
// B reject oversize
assert.match(migration, /char_length\(v_query\.query_text\) > 120/);
assert.match(migration, /seo_query_too_long_for_product/);
// C expiry
assert.match(migration, /seo_reservation_expired/);
// D already linked other product
assert.match(migration, /seo_reservation_already_linked/);
// E practice already has different primary
assert.match(migration, /practice_already_has_primary_seo_query/);
// F idempotent same product
assert.match(
  migration,
  /v_reservation\.product_id IS NOT DISTINCT FROM p_product_id/,
);
// G release clears both
assert.match(
  migration,
  /primary_seo_query_id = NULL,\s*\n\s*seo_primary_query = NULL/,
);
// H admin release clears both
assert.equal(
  (migration.match(/seo_primary_query = NULL/g) || []).length >= 2,
  true,
);
assert.doesNotMatch(migration, /CREATE TABLE|ADD COLUMN/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.guard_practice_primary_seo_query/);
assert.match(migration, /primary_seo_query_requires_rpc/);
assert.match(migration, /linked_primary_seo_query_mismatch/);
assert.match(
  migration,
  /NEW\.seo_primary_query IS DISTINCT FROM OLD\.seo_primary_query/,
);
assert.match(
  migration,
  /NEW\.seo_primary_query IS DISTINCT FROM v_canonical/,
);
assert.match(migration, /allow_primary_seo_query_link/);
assert.doesNotMatch(migration, /UPDATE\s+public\.practices\s+p\s+SET/i);
assert.doesNotMatch(migration, /FROM\s+public\.practices[\s\S]{0,80}SET\s+seo_primary_query\s*=\s*q\.query_text/i);

const types = read("src/lib/author-products/types.ts");
assert.match(types, /primary_seo_query_id/);
const products = read("src/lib/author-products/products.ts");
assert.match(products, /primary_seo_query_id/);

const discoveryRoute = read("src/app/api/author/seo/discovery/route.ts");
assert.match(discoveryRoute, /productId/);

// H — npm script registered
const pkg = JSON.parse(read("package.json"));
assert.equal(
  pkg.scripts["test:seo-reservation-product-create"],
  "npx tsx scripts/seo-reservation-product-create-unit.mjs",
);

console.log("seo-reservation-product-create-unit: ok");
