#!/usr/bin/env node
/**
 * Public promo page Stage 3 unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  PUBLIC_PROMO_PAGE_FORBIDDEN_FIELDS,
} from "../src/lib/promo-pages/types.ts";
import {
  mapPublicPromoPageDto,
  mapPublicPromoPageCtaBlock,
  resolvePublicPromoBannerUrl,
} from "../src/lib/promo-pages/public-page.ts";
import {
  buildPromoPageCanonicalUrl,
  buildPromoPagePath,
} from "../src/lib/promo-pages/paths.ts";
import {
  buildPromoPlaybackErrorMessage,
  getPromoProductPlayLabel,
  hasPromoProductResumeProgress,
} from "../src/components/promo-pages/usePromoPagePlayback.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testPublicRoute() {
  const page = read(
    "src/app/(listener)/promo/[authorSlug]/[promoSlug]/page.tsx",
  );
  const loader = read("src/lib/promo-pages/public-page.ts");

  assert(page.includes("loadPublicPromoPageCached"), "page uses cached public loader");
  assert(page.includes('dynamic = "force-dynamic"'), "page is force-dynamic");
  assert(page.includes("notFound()"), "page returns notFound for missing data");
  assert(page.includes("index: true"), "index metadata in page");
  assert(page.includes("follow: true"), "follow metadata in page");
  assert(page.includes("buildPromoPageCanonicalUrl"), "canonical metadata");
  assert(page.includes("PromoPublicPageClient"), "client presentation wired");
  assert(!page.includes('.from("promo_pages")'), "no direct promo_pages select");
  assert(loader.includes('rpc("get_public_promo_page"'), "loader uses public rpc");
  assert(loader.includes("mapPublicPromoPageDto"), "strict public dto mapper");
}

function testPublicDtoMapper() {
  const mapped = mapPublicPromoPageDto(
    {
      promo_page_id: "page-1",
      author_slug: "sergey-petrov",
      slug: "spring-promo",
      internal_name: "secret",
      created_by: "user-1",
      status: "published",
      public_title: "Весенняя подборка",
      public_description: "Описание",
      banner_path: "authors/banners/test.jpg",
      footer_text: "Footer",
      cta_enabled: true,
      cta_label: "Продолжить в MAX",
      cta_href: "https://max.ru/chat",
      cta_open_in_new_tab: false,
      published_at: "2026-07-19T12:00:00.000Z",
      products: [
        {
          practice_id: "practice-1",
          slug: "practice-one",
          title: "Практика 1",
          format: "Медитация",
          duration_minutes: 12,
          cover_url: null,
          cover_image: null,
          author_name: "Сергей",
          author_slug: "sergey-petrov",
          position: 0,
        },
      ],
    },
    "sergey-petrov",
    "spring-promo",
  );

  assert(mapped?.public_title === "Весенняя подборка", "maps public title");
  assert(mapped?.products.length === 1, "maps products");
  assert(
    mapped && !("internal_name" in mapped) && !("created_by" in mapped),
    "internal fields not mapped",
  );

  assert(
    mapPublicPromoPageDto(
      { author_slug: "a", slug: "b", public_title: "x", products: [] },
      "a",
      "b",
    ) === null,
    "empty products → null",
  );

  assert(
    mapPublicPromoPageDto(
      {
        author_slug: "other",
        slug: "b",
        public_title: "x",
        products: [{ practice_id: "1", slug: "s", title: "t", position: 0 }],
      },
      "a",
      "b",
    ) === null,
    "author slug mismatch → null",
  );

  for (const field of PUBLIC_PROMO_PAGE_FORBIDDEN_FIELDS) {
    assert(
      mapped && !(field in mapped),
      `forbidden field absent from dto: ${field}`,
    );
  }

  assert(
    mapPublicPromoPageCtaBlock({
      promo_page_id: "page-1",
      cta_enabled: true,
      cta_heading: null,
      cta_description: null,
      cta_label: "Go",
      cta_href: "/auth/sign-in",
      cta_open_in_new_tab: false,
    }) === null,
    "invalid enabled cta hidden in mapper",
  );
}

function testPlaybackWiring() {
  const client = read("src/components/promo-pages/PromoPublicPageClient.tsx");
  const hook = read("src/components/promo-pages/usePromoPagePlayback.ts");
  const presentation = read("src/components/promo-pages/PromoPagePresentation.tsx");
  const sessionLoader = read("src/lib/listen/load-session-payload.ts");

  assert(client.includes("usePromoPagePlayback"), "client uses promo playback hook");
  assert(hook.includes("fetchListenSessionPayload"), "hook uses shared session fetch");
  assert(hook.includes("loadSession"), "hook uses global player loadSession");
  assert(hook.includes("requestAutoplay: true"), "autoplay after click");
  assert(hook.includes("requestLockRef"), "repeated click guarded");
  assert(hook.includes("pendingPlayPracticeRef") || hook.includes("intentPracticeId"), "pending play intent");
  assert(hook.includes("needsGesturePlay"), "gesture fallback exposed");
  assert(
    hook.includes("resumeActiveProduct") || hook.includes("handlePlayTrackAtIndex"),
    "same-track resume path",
  );
  assert(!presentation.includes("<audio"), "no separate audio element");
  assert(presentation.includes("interactiveMode"), "public interactive mode supported");
  assert(presentation.includes("previewMode"), "preview mode preserved");
  assert(sessionLoader.includes("guest_access_enabled"), "session loader reads guest access");
}

function testGuestAccessGapFixed() {
  const sessionLoader = read("src/lib/listen/load-session-payload.ts");
  const listenShared = read("src/lib/listen/page-shared.tsx");

  assert(
    sessionLoader.includes("guest_access_enabled"),
    "inline session loader includes guest_access_enabled",
  );
  assert(
    listenShared.includes("guest_access_enabled"),
    "listen page still includes guest_access_enabled",
  );
}

function testPresentationAndCta() {
  const presentation = read("src/components/promo-pages/PromoPagePresentation.tsx");
  const preview = read("src/components/promo-pages/PromoPagePreviewModal.tsx");

  assert(preview.includes("previewMode"), "stage 2 preview still uses previewMode");
  assert(presentation.includes("PromoPageCtaButton"), "cta block component");
  assert(!presentation.includes("Больше практик автора"), "no author fallback cta");
  assert(
    buildPromoPagePath("sergey-petrov", "spring") ===
      "/promo/sergey-petrov/spring",
    "public path helper",
  );
}

function testSeoAndSitemap() {
  const page = read("src/app/(listener)/promo/[authorSlug]/[promoSlug]/page.tsx");
  const sitemapData = read("src/lib/seo/sitemap-data.ts");

  assert(
    buildPromoPageCanonicalUrl("sergey-petrov", "spring").includes(
      "/promo/sergey-petrov/spring",
    ),
    "canonical url uses promo path",
  );
  assert(page.includes("index: true"), "index metadata for published promo pages");
  assert(page.includes("follow: true"), "follow metadata");
  assert(
    page.includes("resolvePromoPageSocialPreviewImage"),
    "social preview image resolver wired",
  );
  assert(page.includes("openGraph"), "openGraph metadata");
  assert(page.includes('card: "summary_large_image"'), "twitter large image card");
  assert(page.includes("images: socialImages"), "og/twitter images set");
  assert(
    sitemapData.includes("mapPromoPageRowsToSitemapEntries"),
    "sitemap includes promo page mapper",
  );
}

function testPlaybackErrors() {
  assert(
    buildPromoPlaybackErrorMessage("unavailable").includes("доступ"),
    "forbidden/unavailable message",
  );
  assert(
    buildPromoPlaybackErrorMessage("error").includes(
      "Не удалось начать воспроизведение",
    ),
    "generic retry message",
  );
  assert(
    getPromoProductPlayLabel("p1", "p1", false, { isPlaying: true }) ===
      "Слушаете",
    "active playing label",
  );
  assert(
    getPromoProductPlayLabel("p1", "p1", false) === "Воспроизвести",
    "active paused label invites play",
  );
  assert(
    getPromoProductPlayLabel("p1", null, true) === "Запуск…",
    "loading label",
  );
  assert(
    typeof hasPromoProductResumeProgress === "function",
    "resume helper exported",
  );
}

function testRegressionImports() {
  assert(read("scripts/author-promo-pages-unit.mjs").includes("AuthorPromoPagesClient"), "stage 2 tests intact");
  assert(read("scripts/promo-pages-unit.mjs").includes("get_public_promo_page"), "stage 1 tests intact");
  assert(read("scripts/author-promotion-unit.mjs").includes("promotion"), "promotion tests file present");
}

const tests = [
  ["public route", testPublicRoute],
  ["public dto mapper", testPublicDtoMapper],
  ["playback wiring", testPlaybackWiring],
  ["guest access gap fixed", testGuestAccessGapFixed],
  ["presentation and cta", testPresentationAndCta],
  ["seo and sitemap", testSeoAndSitemap],
  ["playback errors", testPlaybackErrors],
  ["regression imports", testRegressionImports],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} public promo page checks passed`);
