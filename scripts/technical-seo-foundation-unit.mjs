#!/usr/bin/env node
/**
 * Technical SEO foundation unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

import { buildRobotsRoute, SEO_ROBOTS_DISALLOWED_PATHS } from "../src/lib/seo/robots-config.ts";
import {
  PRODUCTION_APP_ORIGIN,
  STATIC_SITEMAP_PAGES,
  buildStaticSitemapEntries,
  deduplicateSitemapEntries,
  mapAuthorPracticeRowsToSitemapEntries,
  mapPlaylistRowsToSitemapEntries,
  mapPracticeRowsToSitemapEntries,
  mapPromoPageRowsToSitemapEntries,
  mergeSitemapEntryGroups,
  resolveContentLastModified,
  toAbsoluteSitemapUrl,
} from "../src/lib/seo/sitemap-data.ts";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

const ORIGIN = PRODUCTION_APP_ORIGIN;

function testStaticUrls() {
  const entries = buildStaticSitemapEntries(ORIGIN);
  const urls = entries.map((entry) => entry.url);

  for (const path of ["/", "/catalog", "/become-author", "/authors"]) {
    assert(
      urls.includes(`${ORIGIN}${path}`),
      `static sitemap must include ${path}`,
    );
  }
}

function testPublishedProductIncluded() {
  const entries = mapPracticeRowsToSitemapEntries(
    [
      {
        slug: "morning-practice",
        status: "published",
        is_catalog_listed: true,
        author_id: "author-1",
        updated_at: "2026-01-10T10:00:00.000Z",
        published_at: "2026-01-09T10:00:00.000Z",
        created_at: "2026-01-01T10:00:00.000Z",
        cover_image: null,
        authors: { slug: "sergey-petrov" },
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 1, "published product must be included");
  assert(
    entries[0]?.url === `${ORIGIN}/practice/sergey-petrov/morning-practice`,
    "product url must use canonical practice path",
  );
}

function testDraftProductExcluded() {
  const entries = mapPracticeRowsToSitemapEntries(
    [
      {
        slug: "draft-practice",
        status: "draft",
        is_catalog_listed: true,
        author_id: "author-1",
        updated_at: "2026-01-10T10:00:00.000Z",
        published_at: null,
        created_at: "2026-01-01T10:00:00.000Z",
        cover_image: null,
        authors: { slug: "sergey-petrov" },
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 0, "draft product must be excluded");
}

function testUnpublishedProductExcluded() {
  const entries = mapPracticeRowsToSitemapEntries(
    [
      {
        slug: "hidden-practice",
        status: "unpublished",
        is_catalog_listed: true,
        author_id: "author-1",
        updated_at: "2026-01-10T10:00:00.000Z",
        published_at: null,
        created_at: "2026-01-01T10:00:00.000Z",
        cover_image: null,
        authors: { slug: "sergey-petrov" },
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 0, "unpublished product must be excluded");
}

function testArchivedProductExcluded() {
  const entries = mapPracticeRowsToSitemapEntries(
    [
      {
        slug: "archived-practice",
        status: "archived",
        is_catalog_listed: true,
        author_id: "author-1",
        updated_at: "2026-01-10T10:00:00.000Z",
        published_at: null,
        created_at: "2026-01-01T10:00:00.000Z",
        cover_image: null,
        authors: { slug: "sergey-petrov" },
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 0, "archived product must be excluded");
}

function testPublicAuthorIncluded() {
  const entries = mapAuthorPracticeRowsToSitemapEntries(
    [
      {
        status: "published",
        is_catalog_listed: true,
        slug: "practice-one",
        author_id: "author-1",
        cover_image: null,
        updated_at: "2026-02-01T12:00:00.000Z",
        published_at: "2026-01-20T12:00:00.000Z",
        created_at: "2026-01-01T12:00:00.000Z",
        authors: { slug: "zoya-petrova" },
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 1, "public author must be included");
  assert(
    entries[0]?.url === `${ORIGIN}/authors/zoya-petrova`,
    "author url must use canonical author path",
  );
}

function testPrivateAuthorExcluded() {
  const entries = mapAuthorPracticeRowsToSitemapEntries(
    [
      {
        status: "draft",
        is_catalog_listed: false,
        slug: "draft-only",
        author_id: "author-1",
        cover_image: null,
        updated_at: "2026-02-01T12:00:00.000Z",
        published_at: null,
        created_at: "2026-01-01T12:00:00.000Z",
        authors: { slug: "hidden-author" },
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 0, "author without published catalog products excluded");
}

function testPublishedPromoIncluded() {
  const entries = mapPromoPageRowsToSitemapEntries(
    [
      {
        slug: "spring-promo",
        updated_at: "2026-03-01T08:00:00.000Z",
        published_at: "2026-02-28T08:00:00.000Z",
        created_at: "2026-02-20T08:00:00.000Z",
        authors: { slug: "sergey-petrov" },
        promo_page_products: [
          {
            practices: {
              status: "published",
              is_free: true,
              is_catalog_listed: true,
              guest_access_enabled: false,
            },
          },
        ],
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 1, "published promo page must be included");
  assert(
    entries[0]?.url === `${ORIGIN}/promo/sergey-petrov/spring-promo`,
    "promo url must use canonical promo path",
  );
}

function testPromoWithoutEligibleProductsExcluded() {
  const entries = mapPromoPageRowsToSitemapEntries(
    [
      {
        slug: "empty-promo",
        updated_at: "2026-03-01T08:00:00.000Z",
        published_at: "2026-02-28T08:00:00.000Z",
        created_at: "2026-02-20T08:00:00.000Z",
        authors: { slug: "sergey-petrov" },
        promo_page_products: [
          {
            practices: {
              status: "draft",
              is_free: true,
              is_catalog_listed: true,
              guest_access_enabled: false,
            },
          },
        ],
      },
    ],
    ORIGIN,
  );

  assert(entries.length === 0, "promo without eligible products must be excluded");
}

function testPrivatePlaylistExcluded() {
  const publicEntries = mapPlaylistRowsToSitemapEntries(
    [
      {
        slug: "public-gift-set",
        updated_at: "2026-04-01T08:00:00.000Z",
        published_at: "2026-03-30T08:00:00.000Z",
      },
    ],
    ORIGIN,
  );

  const privateEntries = mapPlaylistRowsToSitemapEntries(
    [
      {
        slug: "not-yet-public",
        updated_at: "2026-04-01T08:00:00.000Z",
        published_at: null,
      },
    ],
    ORIGIN,
  );

  assert(publicEntries.length === 1, "public playlist must be included");
  assert(privateEntries.length === 0, "playlist without published_at excluded");
}

function testAbsoluteUrlsWithoutQuery() {
  const url = toAbsoluteSitemapUrl("/catalog?utm_source=test", ORIGIN);
  assert(url.startsWith("https://audiolad.ru/"), "urls must use production origin");
  assert(!url.includes("utm_"), "sitemap urls must not include query params");
}

function testDuplicateRemoval() {
  const merged = mergeSitemapEntryGroups(
    [{ url: `${ORIGIN}/catalog`, priority: 0.9 }],
    [{ url: `${ORIGIN}/catalog`, priority: 0.8 }],
  );

  assert(merged.length === 1, "duplicate urls must be removed");
}

function testLastModifiedFromData() {
  const fixed = new Date("2026-05-01T10:00:00.000Z");
  const entries = mapPracticeRowsToSitemapEntries(
    [
      {
        slug: "dated-practice",
        status: "published",
        is_catalog_listed: true,
        author_id: "author-1",
        updated_at: "2026-05-01T10:00:00.000Z",
        published_at: null,
        created_at: "2026-04-01T10:00:00.000Z",
        cover_image: null,
        authors: { slug: "sergey-petrov" },
      },
    ],
    ORIGIN,
  );

  assert(
    entries[0]?.lastModified?.getTime() === fixed.getTime(),
    "lastModified must come from row data",
  );

  const before = Date.now();
  const authorEntries = mapAuthorPracticeRowsToSitemapEntries(
    [
      {
        status: "published",
        is_catalog_listed: true,
        slug: "practice-one",
        author_id: "author-1",
        cover_image: null,
        updated_at: null,
        published_at: null,
        created_at: null,
        authors: { slug: "no-dates-author" },
      },
    ],
    ORIGIN,
  );
  const after = Date.now();

  assert(authorEntries.length === 0, "author without dates must omit lastModified fake");
  assert(after - before < 50, "author mapper must not use current time fallback");
}

function testRobotsConfig() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSeo = process.env.SEO_INDEXING;
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  process.env.NODE_ENV = "production";
  process.env.SEO_INDEXING = "true";
  process.env.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_ORIGIN;

  const robots = buildRobotsRoute();

  assert(
    robots.sitemap === `${PRODUCTION_APP_ORIGIN}/sitemap.xml`,
    "robots must reference sitemap",
  );
  assert(
    SEO_ROBOTS_DISALLOWED_PATHS.includes("/admin/"),
    "robots must disallow admin",
  );
  assert(
    SEO_ROBOTS_DISALLOWED_PATHS.includes("/author-dashboard/"),
    "robots must disallow author dashboard",
  );
  assert(
    !SEO_ROBOTS_DISALLOWED_PATHS.includes("/catalog"),
    "robots must not block catalog",
  );
  assert(
    !SEO_ROBOTS_DISALLOWED_PATHS.includes("/practice/"),
    "robots must not block public products",
  );

  process.env.NODE_ENV = previousNodeEnv;
  process.env.SEO_INDEXING = previousSeo;
  process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
}

function testErrorLoggingDoesNotLeakSecrets() {
  const sitemapSource = read("src/lib/seo/sitemap-data.ts");
  assert(
    sitemapSource.includes('console.error("[sitemap]'),
    "sitemap errors must be logged",
  );
  assert(
    !sitemapSource.includes("serviceRoleKey"),
    "sitemap must not log service role secrets",
  );
  assert(
    sitemapSource.includes("return []"),
    "failed dynamic sources must degrade to empty entries",
  );
}

function testRouteFiles() {
  const sitemapRoute = read("src/app/sitemap.ts");
  const robotsRoute = read("src/app/robots.ts");
  const promoPage = read(
    "src/app/(listener)/promo/[authorSlug]/[promoSlug]/page.tsx",
  );

  assert(sitemapRoute.includes("revalidate = 3600"), "sitemap uses hourly revalidation");
  assert(!sitemapRoute.includes("force-dynamic"), "sitemap must not force-dynamic");
  assert(robotsRoute.includes("buildRobotsRoute"), "robots uses shared config");
  assert(promoPage.includes("index: true"), "published promo pages are indexable");
  assert(
    STATIC_SITEMAP_PAGES.some((page) => page.path === "/become-author"),
    "become-author included in static sitemap pages",
  );
}

const tests = [
  ["static public urls", testStaticUrls],
  ["published product", testPublishedProductIncluded],
  ["draft product excluded", testDraftProductExcluded],
  ["unpublished product excluded", testUnpublishedProductExcluded],
  ["archived product excluded", testArchivedProductExcluded],
  ["public author", testPublicAuthorIncluded],
  ["private author excluded", testPrivateAuthorExcluded],
  ["published promo", testPublishedPromoIncluded],
  ["promo without eligible products excluded", testPromoWithoutEligibleProductsExcluded],
  ["private playlist excluded", testPrivatePlaylistExcluded],
  ["absolute urls", testAbsoluteUrlsWithoutQuery],
  ["duplicate removal", testDuplicateRemoval],
  ["lastModified from data", testLastModifiedFromData],
  ["robots config", testRobotsConfig],
  ["safe error logging", testErrorLoggingDoesNotLeakSecrets],
  ["route files", testRouteFiles],
];

for (const [name, fn] of tests) {
  try {
    fn();
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error("technical-seo-foundation-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`technical-seo-foundation-unit: all ${tests.length} checks passed`);
