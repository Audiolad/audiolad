#!/usr/bin/env node
/**
 * Public practice guest access regression checks — safe without database access.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRoot(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function testProviderSurvivesPwaFallback() {
  const providers = readRoot("src/components/AppProviders.tsx");
  const boundary = readRoot("src/components/pwa/PwaInstallErrorBoundary.tsx");

  const retentionIndex = providers.indexOf("FirstSaveRetentionProvider");
  const boundaryIndex = providers.indexOf("PwaInstallErrorBoundary");

  assert(retentionIndex !== -1, "FirstSaveRetentionProvider mounted globally");
  assert(boundaryIndex !== -1, "PwaInstallErrorBoundary still mounted");
  assert(
    retentionIndex < boundaryIndex,
    "FirstSaveRetentionProvider wraps PwaInstallErrorBoundary so PWA fallback keeps retention context",
  );
  assert(
    /<FirstSaveRetentionProvider>[\s\S]*<PwaInstallErrorBoundary/.test(providers),
    "retention provider is an ancestor of the PWA error boundary",
  );
  assert(
    boundary.includes("appChildren"),
    "PWA fallback still renders app shell without crashing",
  );
}

function testPracticeRouteIsPublic() {
  const authRoutes = readRoot("src/lib/auth/routes.ts");
  const practicePage = readRoot(
    "src/app/(listener)/practice/[...segments]/page.tsx",
  );

  assert(!authRoutes.includes('"/practice"'), "practice path is not private");
  assert(
    !authRoutes.includes("'/practice'"),
    "practice path is not listed as auth-only",
  );
  assert(
    practicePage.includes("getPracticeByAuthorAndSlug"),
    "practice page loads public product by author and slug",
  );
  assert(
    practicePage.includes("resolveProductAccess"),
    "practice page resolves access separately from route guard",
  );
  assert(practicePage.includes("notFound()"), "missing product returns 404");
}

function testCatalogLinksToPracticePath() {
  const catalog = readRoot("src/lib/products/catalog.ts");
  const card = readRoot("src/components/products/CatalogProductCard.tsx");
  const carousel = readRoot("src/components/products/CatalogProductCarousel.tsx");

  assert(
    catalog.includes("buildPracticePublicPath"),
    "catalog products build canonical practice href",
  );
  assert(card.includes("product.href"), "catalog card links to product href");
  assert(
    carousel.includes("CatalogProductCard"),
    "catalog carousel renders clickable product cards",
  );
}

function testGuestSeesPublicPaidPracticePage() {
  const practicePage = readRoot(
    "src/app/(listener)/practice/[...segments]/page.tsx",
  );
  const accessUi = readRoot("src/lib/products/practice-access-ui.ts");

  assert(
    practicePage.includes("buildPracticeAccessPresentation"),
    "practice page builds public access presentation",
  );
  assert(
    accessUi.includes("payment_required") || accessUi.includes("not_authenticated"),
    "paid products expose guest-facing purchase presentation",
  );
  assert(
    !practicePage.includes('redirect("/auth/sign-in"'),
    "practice page does not force sign-in redirect",
  );
}

function testDraftAndUnpublishedStayHidden() {
  const lookup = readRoot("src/lib/products/lookup.ts");
  const catalog = readRoot("src/lib/products/catalog.ts");
  const marker = readRoot("src/lib/fixtures/test-fixture-marker.ts");

  assert(
    lookup.includes("shouldBlockPublicPracticeAccess"),
    "direct practice lookup blocks hidden fixtures",
  );
  assert(
    catalog.includes('eq("status", "published")'),
    "catalog lists only published products",
  );
  assert(
    catalog.includes('eq("is_catalog_listed", true)'),
    "catalog lists only catalog-listed products",
  );
  assert(
    marker.includes("isPublicCatalogPracticeRow"),
    "fixture guard keeps test products out of public catalog",
  );
}

function testRegisteredUserUsesSamePublicRoute() {
  const practicePage = readRoot(
    "src/app/(listener)/practice/[...segments]/page.tsx",
  );
  const access = readRoot("src/lib/products/access.ts");

  assert(
    practicePage.includes("supabase.auth.getUser()"),
    "practice page reads session when present",
  );
  assert(
    access.includes("resolveProductAccess"),
    "registered access resolved through shared helper",
  );
  assert(
    practicePage.includes("user?.id ?? null"),
    "guest and authenticated users share the same public route",
  );
}

function testPracticeSlugPathShape() {
  const paths = readRoot("src/lib/products/paths.ts");
  const catalog = readRoot("src/lib/products/catalog.ts");

  assert(
    paths.includes("return `/practice/${authorSlug}/${productSlug}`;"),
    "practice public path uses author and product slugs",
  );
  assert(
    catalog.includes("href: buildPracticePublicPath(author.slug, practice.slug)"),
    "catalog href uses author and product slugs",
  );
}

function main() {
  testProviderSurvivesPwaFallback();
  testPracticeRouteIsPublic();
  testCatalogLinksToPracticePath();
  testGuestSeesPublicPaidPracticePage();
  testDraftAndUnpublishedStayHidden();
  testRegisteredUserUsesSamePublicRoute();
  testPracticeSlugPathShape();
  console.log("public-practice-guest-access-unit: PASS");
}

main();
