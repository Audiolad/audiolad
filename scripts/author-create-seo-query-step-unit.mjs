#!/usr/bin/env node
/**
 * Focused unit: SEO discovery in product create (Aurafon closed beta) + UX/data cleanup.
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
import { getProductSeoQueryStepCopy } from "../src/lib/seo-queries/product-seo-query-step-copy.ts";

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
const discoveryRoute = read("src/app/api/author/seo/discovery/route.ts");

// --- Dashboard: discovery removed ---
assert.doesNotMatch(dash, /AuthorSeoDiscoveryPanel/);
assert.doesNotMatch(dash, /Найдите тему/);
assert.doesNotMatch(dash, /seoActiveReservationCounts/);
assert.doesNotMatch(dashPage, /listSeoOpportunitiesForAuthor/);
assert.doesNotMatch(dashPage, /seoActiveReservationCounts/);
assert.doesNotMatch(dashPage, /isAuthorSeoDiscoveryEnabled/);

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

// --- Create page orchestration (I) ---
assert.match(createPage, /AuthorProductSeoQueryStep/);
assert.match(createPage, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(createPage, /isSeoQuerySkipParam/);
assert.match(createPage, /listSeoOpportunitiesForAuthor/);
assert.match(createPage, /AuthorCreateWizard/);
assert.match(createPage, /if \(!publicationClass\)/);
assert.match(createPage, /seoQueryStepEnabled && !hasValidReservation && !seoQuerySkip/);
assert.match(createPage, /AuthorProductForm/);
assert.match(createPage, /initialSeoReservationContext/);
assert.match(createPage, /formBackHref = seoQueryStepEnabled \? queryStepHref : typeChooserHref/);
assert.match(createPage, /internalBackHref=\{typeChooserHref\}/);

// --- Query step structure ---
assert.match(createStep, /Ваши запросы в работе/);
assert.match(createStep, /!item\.productId/);
assert.match(createStep, /variant="product-create"/);
assert.match(createStep, /seoQuerySkip:\s*true/);
assert.doesNotMatch(createStep, /AuthorSeoPromptBuilder/);
assert.doesNotMatch(createStep, /from\("practices"\)/);
assert.doesNotMatch(createStep, /\/api\/author\/products/);

// A — skip after discovery panel, not duplicated
const skipIdx = createStep.indexOf("Продолжить без поискового запроса");
const panelIdx = createStep.indexOf("AuthorSeoDiscoveryPanel");
assert.ok(panelIdx > 0, "discovery panel present");
assert.ok(skipIdx > panelIdx, "skip action after AuthorSeoDiscoveryPanel");
assert.equal(
  (createStep.match(/Продолжить без поискового запроса/g) || []).length,
  1,
  "skip not duplicated",
);
assert.match(createStep, /data-testid="author-product-seo-query-skip"/);
assert.doesNotMatch(
  createStep.slice(0, panelIdx),
  /Продолжить без поискового запроса/,
);

// B/C — release music copy
const releaseCopy = getProductSeoQueryStepCopy("release");
assert.equal(releaseCopy.title, "Выберите поисковый запрос для музыки");
assert.match(releaseCopy.description, /создаёте музыку/);
assert.match(createStep, /getProductSeoQueryStepCopy/);
assert.match(createStep, /copy\.title/);

// D — generic non-release
const practiceCopy = getProductSeoQueryStepCopy("practice");
assert.equal(practiceCopy.title, "Выберите поисковый запрос");
assert.match(practiceCopy.description, /создаёте аудиопродукт/);
assert.doesNotMatch(practiceCopy.description, /создаёте музыку/);
assert.equal(getProductSeoQueryStepCopy("course").title, "Выберите поисковый запрос");
assert.equal(getProductSeoQueryStepCopy(undefined).title, "Выберите поисковый запрос");

// E — database frequency NULL stays null in API DTO
const discoveryStatus = read("src/lib/seo-queries/author-discovery-status.ts");
assert.match(
  discoveryStatus,
  /frequency:\s*typeof item\.frequency === "number" \? item\.frequency : null/,
);
assert.doesNotMatch(discoveryRoute, /frequency:\s*item\.frequency \?\? 0/);
assert.doesNotMatch(discoveryStatus, /frequency:\s*item\.frequency \?\? 0/);

// F/G — null-safe frequency display; Wordstat label template retained
assert.match(panel, /frequency:\s*number\s*\|\s*null/);
assert.match(panel, /function formatMonthlyFrequency\(value: number \| null\)/);
assert.match(panel, /if \(value === null \|\| Number\.isNaN\(value\)\) return null/);
assert.match(panel, /Запросов в месяц:/);
assert.doesNotMatch(panel, /Запросов в месяц: 0/);
assert.doesNotMatch(createStep, /Запросов в месяц: 0/);
assert.match(createStep, /function formatMonthlyFrequency\(value: number \| null\)/);

// H — own unlinked pre-create status
assert.match(createStep, /У вас в работе/);
assert.doesNotMatch(createStep, /lifecycleLabel/);

// Discovery product-create CTAs
assert.match(panel, /"opportunities" \| "product-create"/);
assert.doesNotMatch(panel, /"dashboard"/);
assert.match(panel, /Взять в работу и продолжить/);
assert.match(panel, /Выбрать и продолжить/);
assert.match(panel, /buildAuthorProductCreateHref/);
assert.match(panel, /router\.push/);
assert.match(panel, /!isProductCreate/);
assert.match(panel, /AuthorSeoPromptBuilder/);

assert.match(wizard, /buildAuthorProductCreateHref/);
assert.match(wizard, /reservationId:\s*input\.seoReservationId/);

// Zero migrations for this feature
const migDir = path.join(root, "supabase/migrations");
const migNames = readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort();
assert.ok(migNames.includes("20261021120000_seo_reservation_product_primary_sync.sql"));
assert.ok(migNames.includes("20261022120000_seo_spa_massage_queries_seed.sql"));
const afterSpa = migNames.filter((n) => n > "20261022120000_seo_spa_massage_queries_seed.sql");
for (const name of afterSpa) {
  const body = read(`supabase/migrations/${name}`);
  assert.doesNotMatch(body, /author-create-seo-query|seo_query.?skip|product-create/i);
}

console.log("author-create-seo-query-step-unit: ok");
