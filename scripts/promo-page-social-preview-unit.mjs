#!/usr/bin/env node
/**
 * Promo page social preview (og/twitter image) unit checks.
 */
import { readFileSync } from "node:fs";

import {
  PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH,
  resolvePromoPageSocialPreviewImage,
  toAbsolutePublicHttpsImageUrl,
} from "../src/lib/promo-pages/social-preview.ts";

const ORIGIN = "https://audiolad.ru";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function product(overrides) {
  return {
    practice_id: "p-default",
    title: "Практика",
    format: "Медитация",
    cover_url: null,
    cover_image: null,
    position: 0,
    author_name: "Сергей",
    ...overrides,
  };
}

function testAbsoluteHttpsHelper() {
  assert(
    toAbsolutePublicHttpsImageUrl("/icon-512.png", ORIGIN) ===
      `${ORIGIN}/icon-512.png`,
    "relative path becomes absolute https",
  );
  assert(
    toAbsolutePublicHttpsImageUrl(
      "https://audiolad.ru/storage/v1/object/public/practice-covers/a/lg.webp",
      ORIGIN,
    ) ===
      "https://audiolad.ru/storage/v1/object/public/practice-covers/a/lg.webp",
    "public https cover kept",
  );
  assert(
    toAbsolutePublicHttpsImageUrl(
      "https://audiolad.ru/storage/v1/object/sign/practice-covers/a?token=abc",
      ORIGIN,
    ) === null,
    "signed object URL rejected",
  );
  assert(
    toAbsolutePublicHttpsImageUrl(
      "https://cdn.example/cover.webp?token=secret",
      ORIGIN,
    ) === null,
    "token query rejected",
  );
  assert(
    toAbsolutePublicHttpsImageUrl("http://audiolad.ru/cover.webp", ORIGIN) ===
      null,
    "http rejected",
  );
  assert(
    toAbsolutePublicHttpsImageUrl(
      "https://127.0.0.1:8000/storage/v1/object/public/practice-covers/a.webp",
      ORIGIN,
    ) === null,
    "localhost rejected",
  );
}

function testFirstPracticeCover() {
  const preview = resolvePromoPageSocialPreviewImage(
    [
      product({
        practice_id: "first",
        title: "Эликсир",
        position: 0,
        cover_url:
          "https://audiolad.ru/storage/v1/object/public/practice-covers/first/lg.webp",
      }),
      product({
        practice_id: "second",
        title: "Ключ",
        position: 1,
        cover_url:
          "https://audiolad.ru/storage/v1/object/public/practice-covers/second/lg.webp",
      }),
    ],
    { origin: ORIGIN, publicTitle: "Подарок" },
  );

  assert(preview.source === "practice_cover", "uses practice cover");
  assert(preview.practiceId === "first", "selects first practice");
  assert(
    preview.url ===
      "https://audiolad.ru/storage/v1/object/public/practice-covers/first/lg.webp",
    "exact first cover url",
  );
  assert(preview.url.startsWith("https://"), "absolute https");
  assert(!preview.url.includes("token="), "not signed");
}

function testFallbackToSecondWhenFirstMissing() {
  const preview = resolvePromoPageSocialPreviewImage(
    [
      product({
        practice_id: "first",
        position: 0,
        cover_url: null,
        cover_image: null,
      }),
      product({
        practice_id: "second",
        position: 1,
        cover_url:
          "https://audiolad.ru/storage/v1/object/public/practice-covers/second/lg.webp",
      }),
    ],
    { origin: ORIGIN },
  );

  assert(preview.practiceId === "second", "skips missing first cover");
  assert(
    preview.url.includes("/practice-covers/second/"),
    "uses second practice cover",
  );
}

function testOrderingByPositionNotArrayOrder() {
  const preview = resolvePromoPageSocialPreviewImage(
    [
      product({
        practice_id: "later",
        position: 2,
        cover_url:
          "https://audiolad.ru/storage/v1/object/public/practice-covers/later/lg.webp",
      }),
      product({
        practice_id: "earlier",
        position: 0,
        cover_url:
          "https://audiolad.ru/storage/v1/object/public/practice-covers/earlier/lg.webp",
      }),
      product({
        practice_id: "middle",
        position: 1,
        cover_url: null,
      }),
    ],
    { origin: ORIGIN },
  );

  assert(
    preview.practiceId === "earlier",
    "position order wins over array order",
  );
  assert(preview.url.includes("/earlier/"), "earlier cover selected");
}

function testBrandFallbackWhenNoCovers() {
  const preview = resolvePromoPageSocialPreviewImage(
    [
      product({ practice_id: "a", position: 0, cover_url: null }),
      product({ practice_id: "b", position: 1, cover_url: "" }),
    ],
    { origin: ORIGIN, publicTitle: "Тест" },
  );

  assert(preview.source === "fallback", "falls back to brand image");
  assert(preview.practiceId === null, "no practice id on fallback");
  assert(
    preview.url === `${ORIGIN}${PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH}`,
    "uses icon-512 brand fallback",
  );
  assert(
    PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH === "/icon-512.png",
    "fallback path is brand icon",
  );
  assert(
    !preview.url.includes("become-author"),
    "does not use become-author banner",
  );
}

function testSkipsSignedThenFallsThrough() {
  const preview = resolvePromoPageSocialPreviewImage(
    [
      product({
        practice_id: "signed",
        position: 0,
        cover_url:
          "https://audiolad.ru/storage/v1/object/sign/practice-covers/x?token=abc",
      }),
      product({
        practice_id: "public",
        position: 1,
        cover_url:
          "https://audiolad.ru/storage/v1/object/public/practice-covers/public/lg.webp",
      }),
    ],
    { origin: ORIGIN },
  );

  assert(preview.practiceId === "public", "skips signed cover");
}

function testMetadataWiringPreservesSeoAndSurfaces() {
  const page = read(
    "src/app/(listener)/promo/[authorSlug]/[promoSlug]/page.tsx",
  );
  const helper = read("src/lib/promo-pages/social-preview.ts");
  const playback = read("src/components/promo-pages/usePromoPagePlayback.ts");
  const client = read("src/components/promo-pages/PromoPublicPageClient.tsx");
  const presentation = read(
    "src/components/promo-pages/PromoPagePresentation.tsx",
  );
  const form = read("src/components/author-dashboard/AuthorPromoPageForm.tsx");

  assert(
    page.includes("resolvePromoPageSocialPreviewImage"),
    "metadata uses social preview helper",
  );
  assert(page.includes("openGraph"), "openGraph present");
  assert(page.includes("images: socialImages"), "og images wired");
  assert(page.includes('card: "summary_large_image"'), "twitter large card");
  assert(page.includes("twitter:"), "twitter metadata present");
  assert(page.includes("buildPromoPageCanonicalUrl"), "canonical preserved");
  assert(page.includes("index: false"), "noindex preserved");
  assert(page.includes("follow: true"), "follow preserved");
  assert(page.includes("siteName: \"АудиоЛад\""), "siteName preserved");

  assert(
    helper.includes('PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH = "/icon-512.png"'),
    "brand fallback constant",
  );
  assert(!helper.includes("become-author"), "helper avoids become-author");

  assert(playback.includes("needsGesturePlay"), "playback gesture preserved");
  assert(playback.includes("intentPracticeId"), "playback intent preserved");
  assert(client.includes("usePromoPagePlayback"), "client playback preserved");
  assert(presentation.includes("PromoPageCtaButton"), "CTA preserved");
  assert(form.includes("cta_"), "editor CTA fields untouched path still exists");
}

const tests = [
  ["absolute https helper", testAbsoluteHttpsHelper],
  ["first practice cover", testFirstPracticeCover],
  ["fallback to second", testFallbackToSecondWhenFirstMissing],
  ["ordering by position", testOrderingByPositionNotArrayOrder],
  ["brand fallback", testBrandFallbackWhenNoCovers],
  ["skip signed cover", testSkipsSignedThenFallsThrough],
  ["metadata wiring + surfaces preserved", testMetadataWiringPreservesSeoAndSurfaces],
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

console.log(`\n${tests.length} promo social preview checks passed`);
