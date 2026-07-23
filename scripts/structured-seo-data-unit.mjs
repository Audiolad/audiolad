#!/usr/bin/env node
/**
 * Structured SEO / JSON-LD unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  buildAuthorJsonLd,
  buildBreadcrumbListJsonLd,
  buildHomeJsonLd,
  buildPracticeJsonLd,
  buildPromoPageJsonLd,
  buildPublicPlaylistJsonLd,
  pruneJsonLdValue,
  serializeJsonLd,
  shouldEmitAuthorJsonLd,
  shouldEmitPracticeJsonLd,
} from "../src/lib/seo/json-ld/index.ts";
import {
  buildCatalogMetadata,
  buildHomeMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";
import { PRIVATE_PAGE_ROBOTS } from "../src/lib/seo/private-robots.ts";
import {
  isSafeJsonLdAudioContentUrl,
  isSafeJsonLdImageUrl,
  isSignedOrTemporaryUrl,
  isSupabaseStorageUrl,
} from "../src/lib/seo/json-ld/url-policy.ts";

const ORIGIN = "https://audiolad.ru";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function parseSerializedJsonLd(value) {
  return JSON.parse(value.replace(/\\u003c/g, "<"));
}

function testSerializeJsonLd() {
  const serialized = serializeJsonLd({
    name: "Test",
    scriptBreakout: "</script><script>alert(1)</script>",
  });

  assert(() => JSON.parse(serialized), "JSON-LD serializes to valid JSON");
  assert(!serialized.includes("</script>"), "script tag breakout is escaped");
  assert(serialized.includes("\\u003c/script"), "less-than is unicode escaped");
}

function testPruneRemovesEmptyValues() {
  const pruned = pruneJsonLdValue({
    keep: "value",
    dropNull: null,
    dropUndefined: undefined,
    dropEmpty: "",
    nested: {
      alsoDrop: null,
      stay: 1,
    },
    list: ["ok", null, "", undefined],
  });

  assert(pruned.keep === "value", "keeps non-empty values");
  assert(!("dropNull" in pruned), "removes null");
  assert(!("dropUndefined" in pruned), "removes undefined");
  assert(!("dropEmpty" in pruned), "removes empty strings");
  assert(pruned.nested.stay === 1 && !("alsoDrop" in pruned.nested), "prunes nested");
  assert(JSON.stringify(pruned.list) === JSON.stringify(["ok"]), "prunes list items");
}

function testHomeOrganizationAndWebsite() {
  const graph = buildHomeJsonLd(ORIGIN);
  const organization = graph["@graph"].find(
    (node) => node["@type"] === "Organization",
  );
  const website = graph["@graph"].find((node) => node["@type"] === "WebSite");

  assert(organization?.url === `${ORIGIN}/`, "organization uses production URL");
  assert(organization?.logo === `${ORIGIN}/audiolad-logo.png`, "organization logo is public");
  assert(website?.publisher?.["@id"] === `${ORIGIN}/#organization`, "website links organization");
  assert(website?.inLanguage === "ru-RU", "website language set");
  assert(!JSON.stringify(graph).includes("SearchAction"), "SearchAction not added");
}

function testAuthorPersonAndOrganization() {
  const person = buildAuthorJsonLd(
    {
      name: "Сергей",
      slug: "sergey",
      authorType: "person",
      description: "Автор медитаций",
      imageUrl: `${ORIGIN}/apple-touch-icon.png`,
    },
    ORIGIN,
  );
  const personNode = person["@graph"].find((node) => node["@type"] === "Person");

  assert(personNode?.name === "Сергей", "person author name mapped");
  assert(personNode?.url === `${ORIGIN}/authors/sergey`, "person author canonical URL");

  const organization = buildAuthorJsonLd(
    {
      name: "АудиоСтудия",
      slug: "audio-studio",
      authorType: "studio",
      description: "Студия записи",
      imageUrl: null,
    },
    ORIGIN,
  );
  const orgNode = organization["@graph"].find(
    (node) => node["@type"] === "Organization",
  );

  assert(orgNode?.name === "АудиоСтудия", "studio author mapped to Organization");
}

function testPracticeCreativeWork() {
  const canonical = buildPracticeJsonLd(
    {
      title: "Практика покоя",
      description: "Описание практики",
      authorSlug: "sergey",
      authorName: "Сергей",
      productSlug: "pokoy",
      imageUrl: `${ORIGIN}/icon-512.png`,
      isFree: true,
      price: 0,
      tracks: [
        {
          name: "Вступление",
          position: 1,
          durationSeconds: 90,
          contentUrl: `${ORIGIN}/storage/v1/object/sign/audio/track.mp3?token=secret`,
        },
      ],
    },
    ORIGIN,
  );

  const work = canonical["@graph"].find((node) => node["@type"] === "CreativeWork");

  assert(work?.url === `${ORIGIN}/practice/sergey/pokoy`, "practice canonical URL");
  assert(work?.isAccessibleForFree === true, "free practice marked accessible");
  assert(!work?.offers, "free practice has no Offer");
  assert(work?.associatedMedia?.[0]?.duration === "PT1M30S", "track duration in ISO 8601");
  assert(!("contentUrl" in (work?.associatedMedia?.[0] ?? {})), "signed URL not in AudioObject");
}

function testPracticePaidOffer() {
  const paid = buildPracticeJsonLd(
    {
      title: "Платная практика",
      description: null,
      authorSlug: "sergey",
      authorName: "Сергей",
      productSlug: "paid-practice",
      imageUrl: null,
      isFree: false,
      price: 299,
    },
    ORIGIN,
  );
  const work = paid["@graph"].find((node) => node["@type"] === "CreativeWork");

  assert(work?.offers?.price === "299", "offer price matches input");
  assert(work?.offers?.priceCurrency === "RUB", "offer currency is RUB");
  assert(work?.isAccessibleForFree === undefined, "paid practice is not marked free");
}

function testUrlPolicy() {
  assert(
    isSignedOrTemporaryUrl(
      "https://audiolad.ru/storage/v1/object/sign/audio/track.mp3?token=abc",
    ),
    "detects signed URL",
  );
  assert(
    isSupabaseStorageUrl(
      "https://example.supabase.co/storage/v1/object/public/practice-covers/a.jpg",
    ),
    "detects supabase storage URL",
  );
  assert(
    !isSafeJsonLdAudioContentUrl(
      "https://example.supabase.co/storage/v1/object/public/practice-covers/a.mp3",
    ),
    "storage URL blocked for audio contentUrl",
  );
  assert(
    isSafeJsonLdImageUrl(`${ORIGIN}/audiolad-logo.png`),
    "public site image allowed",
  );
  assert(!isSafeJsonLdImageUrl("http://localhost:3000/logo.png"), "localhost blocked");
}

function testUnpublishedAndFixtureGuards() {
  assert(
    !shouldEmitPracticeJsonLd({ status: "draft", isFixtureMarked: false }),
    "unpublished practice skipped",
  );
  assert(
    !shouldEmitPracticeJsonLd({ status: "published", isFixtureMarked: true }),
    "fixture practice skipped",
  );
  assert(
    !shouldEmitAuthorJsonLd({ isFixtureMarked: true }),
    "fixture author skipped",
  );
}

function testBreadcrumbPositions() {
  const breadcrumbs = buildBreadcrumbListJsonLd(
    [
      { name: "Главная", path: "/" },
      { name: "Каталог", path: "/catalog" },
      { name: "Продукт", path: "/practice/a/b" },
    ],
    ORIGIN,
  );

  assert(
    breadcrumbs.itemListElement.map((item) => item.position).join(",") === "1,2,3",
    "breadcrumb positions are sequential",
  );
  assert(
    breadcrumbs.itemListElement.at(-1)?.item === `${ORIGIN}/practice/a/b`,
    "last breadcrumb matches current page",
  );
}

function testPromoAndPlaylistSchemas() {
  const promo = buildPromoPageJsonLd(
    {
      title: "Весенняя подборка",
      description: "Описание",
      authorSlug: "sergey",
      promoSlug: "spring",
      products: [
        {
          title: "Практика 1",
          authorSlug: "sergey",
          productSlug: "one",
          position: 0,
        },
      ],
    },
    ORIGIN,
  );
  const promoPage = promo["@graph"][0];

  assert(promoPage["@type"] === "CollectionPage", "promo uses CollectionPage");
  assert(
    promoPage.mainEntity.itemListElement[0].url === `${ORIGIN}/practice/sergey/one`,
    "promo item links to public practice",
  );
  assert(!JSON.stringify(promo).includes("Offer"), "promo does not emit fake offers");

  const playlist = buildPublicPlaylistJsonLd(
    {
      title: "Подборка",
      slug: "free-set",
      description: "Подборка практик",
      items: [
        {
          title: "Практика",
          href: "/practice/sergey/free",
          position: 1,
        },
      ],
    },
    ORIGIN,
  );

  assert(
    playlist["@graph"].some((node) => node["@type"] === "CollectionPage"),
    "playlist uses CollectionPage",
  );
}

function testCanonicalMetadata() {
  assert(buildSiteCanonicalUrl("/") === `${ORIGIN}/`, "home canonical");
  assert(
    buildSiteCanonicalUrl("/catalog") === `${ORIGIN}/catalog`,
    "catalog canonical",
  );

  const home = buildHomeMetadata();
  const catalog = buildCatalogMetadata();
  const catalogSearch = buildCatalogMetadata({ robotsNoIndex: true });

  assert(home.alternates.canonical === `${ORIGIN}/`, "home metadata canonical");
  assert(catalog.alternates.canonical === `${ORIGIN}/catalog`, "catalog metadata canonical");
  assert(catalogSearch.robots.index === false, "catalog search stays noindex");
  assert(PRIVATE_PAGE_ROBOTS.index === false, "private pages stay noindex");
}

function testPageWiring() {
  const homePage = read("src/app/(listener)/(home)/page.tsx");
  const catalogPage = read("src/app/(listener)/(catalog)/catalog/page.tsx");
  const authorPage = read("src/app/(listener)/authors/[slug]/page.tsx");
  const practicePage = read("src/app/(listener)/practice/[...segments]/page.tsx");
  const promoPage = read("src/app/(listener)/promo/[authorSlug]/[promoSlug]/page.tsx");
  const playlistPage = read("src/app/p/[slug]/page.tsx");
  const jsonLdComponent = read("src/components/seo/JsonLd.tsx");

  assert(homePage.includes("buildHomeJsonLd"), "home page emits JSON-LD");
  assert(catalogPage.includes("buildCatalogMetadata"), "catalog metadata helper wired");
  assert(authorPage.includes("buildAuthorJsonLd"), "author page emits JSON-LD");
  assert(practicePage.includes("buildPracticeJsonLd"), "practice page emits JSON-LD");
  assert(promoPage.includes("buildPromoPageJsonLd"), "promo page emits JSON-LD");
  assert(playlistPage.includes("buildPublicPlaylistJsonLd"), "playlist page emits JSON-LD");
  assert(jsonLdComponent.includes('type="application/ld+json"'), "JsonLd uses ld+json script");
  assert(jsonLdComponent.includes("serializeJsonLd"), "JsonLd uses safe serializer");
  assert(promoPage.includes("index: true"), "promo metadata remains indexable");
}

function testSerializedGraphHasNoSecrets() {
  const serialized = serializeJsonLd(
    buildPracticeJsonLd(
      {
        title: "Secret test",
        description: "desc",
        authorSlug: "a",
        authorName: "A",
        productSlug: "b",
        imageUrl: `${ORIGIN}/icon-512.png`,
        isFree: false,
        price: 99,
        tracks: [
          {
            name: "Track",
            position: 1,
            durationSeconds: 30,
            contentUrl:
              "https://audiolad.ru/storage/v1/object/sign/audio/track.mp3?token=secret",
          },
        ],
      },
      ORIGIN,
    ),
  );

  assert(!serialized.includes("undefined"), "serialized JSON-LD has no undefined");
  assert(!serialized.includes("token=secret"), "serialized JSON-LD has no signed token");
  assert(!serialized.includes("localhost"), "serialized JSON-LD has no localhost");
  assert(() => parseSerializedJsonLd(serialized), "serialized output parses as JSON");
}

const tests = [
  ["serializeJsonLd", testSerializeJsonLd],
  ["pruneJsonLdValue", testPruneRemovesEmptyValues],
  ["home graph", testHomeOrganizationAndWebsite],
  ["author schemas", testAuthorPersonAndOrganization],
  ["practice free", testPracticeCreativeWork],
  ["practice paid offer", testPracticePaidOffer],
  ["url policy", testUrlPolicy],
  ["publication guards", testUnpublishedAndFixtureGuards],
  ["breadcrumbs", testBreadcrumbPositions],
  ["promo and playlist", testPromoAndPlaylistSchemas],
  ["canonical metadata", testCanonicalMetadata],
  ["page wiring", testPageWiring],
  ["serialized safety", testSerializedGraphHasNoSecrets],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok: ${name}`);
}

console.log(`structured-seo-data-unit: ${tests.length} checks passed`);
