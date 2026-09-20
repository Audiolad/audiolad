#!/usr/bin/env node
/**
 * Focused unit: move SEO discovery into product create (Aurafon closed beta).
 * Covers dashboard removal, create orchestration A–D, skip, query-first, non-beta.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SEO_QUERY_SKIP_PARAM,
  SEO_QUERY_SKIP_VALUE,
  SEO_RESERVATION_ID_PARAM,
  buildAuthorProductCreateHref,
  buildSeoReservationProductCreateHref,
  isSeoQuerySkipParam,
} from "../src/lib/seo-queries/reservation-product-create-href.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const dash = read("src/components/author-dashboard/AuthorDashboardClient.tsx");
const dashPage = read("src/app/(platform)/author-dashboard/page.tsx");
const createPage = read("src/app/(platform)/author-dashboard/products/new/page.tsx");
const createStep = read("src/components/author-dashboard/AuthorProductSeoQueryStep.tsx");
const panel = read("src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx");
const wizard = read("src/components/author-dashboard/AuthorCreateWizard.tsx");
const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
const opportunitiesUi = read("src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx");

// --- Dashboard: discovery removed ---
assert.doesNotMatch(dash, /AuthorSeoDiscoveryPanel/);
assert.doesNotMatch(dash, /Найдите тему/);
assert.doesNotMatch(dash, /seoActiveReservationCounts/);
assert.doesNotMatch(dashPage, /listSeoOpportunitiesForAuthor/);
assert.doesNotMatch(dashPage, /seoActiveReservationCounts/);
assert.doesNotMatch(dashPage, /isAuthorSeoDiscoveryEnabled/);

// Standalone opportunities nav preserved
assert.match(nav, /Что ищут слушатели/);
assert.match(opportunitiesUi, /variant="opportunities"/);

// --- URL helpers ---
assert.equal(SEO_RESERVATION_ID_PARAM, "seo_reservation_id");
assert.equal(SEO_QUERY_SKIP_PARAM, "seo_query");
assert.equal(SEO_QUERY_SKIP_VALUE, "skip");
assert.equal(isSeoQuerySkipParam("skip"), true);
assert.equal(isSeoQuerySkipParam("SKIP"), true);
assert.equal(isSeoQuerySkipParam("no"), false);

assert.equal(
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    publicationClass: "release",
  }),
  "/author-dashboard/products/new?author=aurafon&class=release",
);
assert.equal(
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    publicationClass: "release",
    seoQuerySkip: true,
  }),
  "/author-dashboard/products/new?author=aurafon&seo_query=skip&class=release",
);
assert.equal(
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    publicationClass: "release",
    reservationId: "rid-1",
    seoQuerySkip: true,
  }),
  "/author-dashboard/products/new?author=aurafon&seo_reservation_id=rid-1&class=release",
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
  buildAuthorProductCreateHref({
    authorSlug: "aurafon",
    reservationId: "rid",
    publicationClass: "release",
  }),
  /query_text|q=|текст/i,
);

// --- Create page orchestration ---
assert.match(createPage, /AuthorProductSeoQueryStep/);
assert.match(createPage, /isAuthorSeoDiscoveryEnabled/);
assert.match(createPage, /isSeoQuerySkipParam/);
assert.match(createPage, /listSeoOpportunitiesForAuthor/);
// A: no class → wizard
assert.match(createPage, /AuthorCreateWizard/);
assert.match(createPage, /if \(!publicationClass\)/);
// B: beta + class + no reservation + no skip → query step
assert.match(createPage, /seoBeta && !hasValidReservation && !seoQuerySkip/);
// C/D: form path with reservation or skip
assert.match(createPage, /AuthorProductForm/);
assert.match(createPage, /initialSeoReservationContext/);
// form back → query step for beta
assert.match(createPage, /formBackHref = seoBeta \? queryStepHref : typeChooserHref/);
// query step back → type chooser
assert.match(createPage, /internalBackHref=\{typeChooserHref\}/);

// --- Query step UI ---
assert.match(createStep, /Выберите поисковый запрос/);
assert.match(createStep, /Продолжить без поискового запроса/);
assert.match(createStep, /Ваши запросы в работе/);
assert.match(createStep, /!item\.productId/);
assert.match(createStep, /variant="product-create"/);
assert.match(createStep, /seoQuerySkip:\s*true/);
assert.doesNotMatch(createStep, /AuthorSeoPromptBuilder/);
assert.doesNotMatch(createStep, /from\("practices"\)/);
assert.doesNotMatch(createStep, /\/api\/author\/products/);

// --- Discovery product-create ---
assert.match(panel, /"opportunities" \| "product-create"/);
assert.doesNotMatch(panel, /"dashboard"/);
assert.match(panel, /Взять в работу и продолжить/);
assert.match(panel, /Выбрать и продолжить/);
assert.match(panel, /buildAuthorProductCreateHref/);
assert.match(panel, /router\.push/);
assert.match(panel, /!isProductCreate/);
assert.match(panel, /AuthorSeoPromptBuilder/); // still for opportunities

// --- Wizard uses canonical helper ---
assert.match(wizard, /buildAuthorProductCreateHref/);
assert.match(wizard, /reservationId:\s*input\.seoReservationId/);

// --- Zero migrations in this change set (script invariant) ---
const migDir = path.join(root, "supabase/migrations");
const migNames = readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort();
assert.ok(migNames.includes("20261021120000_seo_reservation_product_primary_sync.sql"));
assert.ok(migNames.includes("20261022120000_seo_spa_massage_queries_seed.sql"));
// This PR must not introduce a newer migration than spa seed for this feature
const afterSpa = migNames.filter((n) => n > "20261022120000_seo_spa_massage_queries_seed.sql");
// Allow unrelated newer migrations already on main; just ensure we didn't add one in working tree via this feature name
for (const name of afterSpa) {
  const body = read(`supabase/migrations/${name}`);
  assert.doesNotMatch(body, /author-create-seo-query|seo_query.?skip|product-create/i);
}

console.log("author-create-seo-query-step-unit: ok");
