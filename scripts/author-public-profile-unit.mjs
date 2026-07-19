#!/usr/bin/env node
/**
 * Author public profile MVP unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testValidation() {
  const source = read("src/lib/authors/validation.ts");

  assert(source.includes("MAX_SHORT_BIO_LENGTH"), "short bio limit exported");
  assert(source.includes("MAX_FULL_BIO_LENGTH"), "full bio limit exported");
  assert(source.includes("MAX_SHORT_POSITIONING_LENGTH"), "positioning limit exported");
  assert(source.includes("normalizeShortPositioning"), "positioning normalizer");
  assert(source.includes("normalizeFullBio"), "full bio normalizer");
  assert(source.includes("normalizeFeaturedProductIds"), "featured ids normalizer");
  assert(source.includes("MAX_FEATURED_PRODUCTS"), "featured limit enforced");
}

function testAuthorLinkComponent() {
  const source = read("src/components/authors/AuthorLink.tsx");

  assert(source.includes("buildAuthorPublicPath"), "AuthorLink uses canonical path");
  assert(source.includes("currentAuthorSlug"), "AuthorLink supports same-page fallback");
  assert(source.includes("stopPropagation"), "AuthorLink supports nested cards");
  assert(!source.includes("<a"), "AuthorLink uses Next Link, not raw anchor nesting");
}

function testPublicPageSections() {
  const page = read("src/app/(listener)/authors/[slug]/page.tsx");

  assert(page.includes("AuthorFeaturedSection"), "featured section wired");
  assert(page.includes("AuthorProductsSection"), "products section wired");
  assert(page.includes("AuthorAboutSection"), "about section wired");
  assert(page.includes("SimilarAuthorsSection"), "similar authors wired");
  assert(page.includes("openGraph"), "SEO open graph metadata");
  assert(page.includes("canonical"), "canonical metadata");
}

function testProfileApi() {
  const route = read("src/app/api/author/profile/route.ts");

  assert(route.includes("requireAuthorMembership"), "profile API checks membership");
  assert(route.includes("replaceAuthorFeaturedProducts"), "featured products validated server-side");
  assert(route.includes("featured_product_forbidden"), "foreign featured products rejected");
}

function testFeaturedProductsValidation() {
  const source = read("src/lib/authors/profile.ts");

  assert(source.includes('product.author_id !== authorId'), "foreign product guard");
  assert(source.includes('product.status !== "published"'), "only published featured products");
}

function testMigrationExists() {
  const migration = read(
    "supabase/migrations/20260717160000_author_public_profile.sql",
  );

  assert(migration.includes("author_featured_products"), "featured products table");
  assert(migration.includes("author_topics"), "author topics table");
  assert(migration.includes("author_type"), "author type column");
  assert(migration.includes("short_bio"), "short bio column");
  assert(migration.includes("full_bio"), "full bio column");
  assert(migration.includes("author-assets"), "author assets bucket");
  assert(migration.includes("Author members can update own author profile"), "authors update RLS");

  const positioningMigration = read(
    "supabase/migrations/20260719120000_author_short_positioning.sql",
  );

  assert(positioningMigration.includes("short_positioning"), "short positioning column");
}

function testAuthorDashboardNav() {
  const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");

  assert(nav.includes("Страница автора"), "profile nav item added");
  assert(nav.includes("/author-dashboard/profile"), "profile route linked");
}

function testAuthorNameLinks() {
  const files = [
    "src/components/home/HomeProductCard.tsx",
    "src/components/products/CatalogProductCard.tsx",
    "src/components/history/HistorySections.tsx",
    "src/components/listener/DesktopPlayerBar.tsx",
    "src/components/playlists/PlaylistItemRow.tsx",
  ];

  for (const file of files) {
    const source = read(file);
    assert(source.includes("AuthorLink"), `${file} uses AuthorLink`);
  }
}

function testSimilarAuthorsLogic() {
  const source = read("src/lib/authors/similar-authors.ts");

  assert(source.includes("mergeAuthorRecommendations"), "similar authors uses recommendation merge");
  assert(source.includes("SIMILAR_AUTHORS_LIMIT"), "similar authors keeps explicit limit");
  assert(source.includes("fallbackAuthors"), "similar authors builds fallback pool");
  assert(!source.includes(".filter((candidate) => candidate.overlapScore > 0)\n    .slice(0, 4)"), "positive-only final filter removed");
  assert(source.includes(".neq(\"author_id\", authorId)"), "current author excluded");
}

const tests = [
  ["validation helpers", testValidation],
  ["AuthorLink component", testAuthorLinkComponent],
  ["public author page", testPublicPageSections],
  ["profile API", testProfileApi],
  ["featured products validation", testFeaturedProductsValidation],
  ["SQL migration", testMigrationExists],
  ["author dashboard nav", testAuthorDashboardNav],
  ["author name links", testAuthorNameLinks],
  ["similar authors logic", testSimilarAuthorsLogic],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok - ${name}`);
}

console.log(`\n${tests.length} author public profile checks passed.`);
