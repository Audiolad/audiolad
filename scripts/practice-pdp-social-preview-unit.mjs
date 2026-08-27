#!/usr/bin/env node
/**
 * Public practice PDP social preview (og/twitter) unit checks.
 */
import { readFileSync } from "node:fs";

import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import { buildPracticeCanonicalUrl } from "../src/lib/products/paths.ts";
import {
  buildPracticePdpSocialTags,
  resolvePracticeSocialPreviewImage,
} from "../src/lib/products/practice-social-preview.ts";
import {
  PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH,
} from "../src/lib/promo-pages/social-preview.ts";
import { PRODUCTION_APP_ORIGIN } from "../src/lib/seo/app-origin.ts";

const ORIGIN = PRODUCTION_APP_ORIGIN;
const PUBLIC_COVER =
  "https://audiolad.ru/storage/v1/object/public/practice-covers/anna/morning/lg.webp";
const SIGNED_COVER =
  "https://audiolad.ru/storage/v1/object/sign/practice-covers/anna/morning?token=abc";

process.env.NEXT_PUBLIC_APP_URL = ORIGIN;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function socialInput(overrides = {}) {
  return {
    productTitle: "Утренняя практика",
    description: "Короткое описание для карточки.",
    canonical: buildPracticeCanonicalUrl("anna", "utrennyaya-praktika"),
    cover_url: PUBLIC_COVER,
    cover_image: null,
    format: "Медитация",
    productKind: PRODUCT_KIND.PRACTICE,
    authorName: "Анна",
    ...overrides,
  };
}

function firstImageUrl(images) {
  const first = Array.isArray(images) ? images[0] : images;
  return typeof first === "string" ? first : first?.url ?? null;
}

function testPublicCoverEmitsAbsoluteOgAndTwitterImage() {
  const tags = buildPracticePdpSocialTags(socialInput());

  assert(tags.openGraph.title === "Утренняя практика", "og:title is product title");
  assert(
    tags.openGraph.description === "Короткое описание для карточки.",
    "og:description matches meta description",
  );
  assert(
    tags.openGraph.url === "https://audiolad.ru/practice/anna/utrennyaya-praktika",
    "canonical stays public PDP",
  );
  assert(
    firstImageUrl(tags.openGraph.images) === PUBLIC_COVER,
    "og:image is the public cover",
  );
  assert(tags.twitter.card === "summary_large_image", "twitter large image card");
  assert(tags.twitter.title === "Утренняя практика", "twitter title is product title");
  assert(
    tags.twitter.description === "Короткое описание для карточки.",
    "twitter description matches meta",
  );
  assert(
    firstImageUrl(tags.twitter.images) === PUBLIC_COVER,
    "twitter image is the public cover",
  );
  assert(!PUBLIC_COVER.includes("token="), "cover fixture is not signed");
}

function testMissingCoverFallsBackToBrandIcon() {
  const tags = buildPracticePdpSocialTags(
    socialInput({ cover_url: null, cover_image: null }),
  );
  const fallback = `${ORIGIN}${PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH}`;

  assert(
    firstImageUrl(tags.openGraph.images) === fallback,
    "missing cover uses brand icon",
  );
  assert(
    firstImageUrl(tags.twitter.images) === "https://audiolad.ru/icon-512.png",
    "twitter fallback is icon-512",
  );
  assert(
    PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH === "/icon-512.png",
    "fallback path is brand icon",
  );
  assert(
    !firstImageUrl(tags.openGraph.images).includes("become-author"),
    "does not use become-author banner",
  );
}

function testSignedCoverFallsBack() {
  const tags = buildPracticePdpSocialTags(socialInput({ cover_url: SIGNED_COVER }));

  assert(
    firstImageUrl(tags.openGraph.images) === "https://audiolad.ru/icon-512.png",
    "signed cover falls back to brand icon",
  );
  assert(
    !firstImageUrl(tags.openGraph.images).includes("token="),
    "og:image is not a signed URL",
  );
  assert(
    tags.openGraph.url === "https://audiolad.ru/practice/anna/utrennyaya-praktika",
    "canonical stays public PDP after signed fallback",
  );
}

function testLocalhostAndHttpCoversFallBack() {
  const localhost = buildPracticePdpSocialTags(
    socialInput({
      cover_url:
        "https://127.0.0.1:8000/storage/v1/object/public/practice-covers/a.webp",
    }),
  );
  const http = buildPracticePdpSocialTags(
    socialInput({ cover_url: "http://audiolad.ru/storage/v1/object/public/a.webp" }),
  );

  assert(
    firstImageUrl(localhost.openGraph.images) === "https://audiolad.ru/icon-512.png",
    "localhost cover rejected",
  );
  assert(
    firstImageUrl(http.openGraph.images) === "https://audiolad.ru/icon-512.png",
    "http cover rejected",
  );
}

function testPaidFreeMusicShareSameResolver() {
  const paid = resolvePracticeSocialPreviewImage({
    title: "Платный курс",
    cover_url: PUBLIC_COVER,
    productKind: PRODUCT_KIND.PRACTICE,
  });
  const free = resolvePracticeSocialPreviewImage({
    title: "Бесплатная практика",
    cover_url: PUBLIC_COVER,
    productKind: PRODUCT_KIND.PRACTICE,
  });
  const music = resolvePracticeSocialPreviewImage({
    title: "Альбом",
    cover_url: PUBLIC_COVER,
    productKind: PRODUCT_KIND.MUSIC,
  });
  const musicNoCover = resolvePracticeSocialPreviewImage({
    title: "Альбом без обложки",
    cover_url: null,
    productKind: PRODUCT_KIND.MUSIC,
  });

  assert(paid.url === PUBLIC_COVER, "paid uses public cover");
  assert(free.url === PUBLIC_COVER, "free uses public cover");
  assert(music.url === PUBLIC_COVER, "music uses public cover");
  assert(
    musicNoCover.url === "https://audiolad.ru/icon-512.png",
    "music without cover uses brand fallback",
  );
  assert(paid.source === "practice_cover", "paid source is cover");
  assert(musicNoCover.source === "fallback", "music no-cover source is fallback");
}

function testOgTitleIsProductNameNotPageSuffix() {
  const tags = buildPracticePdpSocialTags(
    socialInput({ productTitle: "Ключ к тишине" }),
  );

  assert(tags.openGraph.title === "Ключ к тишине", "og:title is product name");
  assert(!tags.openGraph.title.includes("АудиоЛад"), "og:title has no site suffix");
}

function testMetadataWiringPreservesSeoAndShare() {
  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const helper = read("src/lib/products/practice-social-preview.ts");
  const share = read("src/lib/products/share.ts");
  const shareButton = read(
    "src/components/products/practice-page/PracticeProductShareButton.tsx",
  );
  const layout = read("src/app/layout.tsx");

  assert(page.includes("buildPracticePdpSocialTags"), "generateMetadata uses helper");
  assert(page.includes("buildPracticeCanonicalUrl"), "canonical helper kept");
  assert(page.includes("twitter: social.twitter"), "twitter tags wired");
  assert(page.includes("openGraph: social.openGraph"), "openGraph tags wired");
  assert(
    page.includes("Музыкальный продукт на платформе АудиоЛад."),
    "music description fallback kept",
  );
  assert(
    page.includes("robots: { index: false, follow: true }") ||
      page.includes("follow: true"),
    "legacy 1-segment noindex+follow kept",
  );
  assert(
    !helper.includes("become-author"),
    "helper avoids become-author banner",
  );
  assert(
    helper.includes("toAbsolutePublicHttpsImageUrl"),
    "reuses promo HTTPS guard",
  );
  assert(helper.includes("resolveProductCoverUrl"), "reuses cover resolver");
  assert(
    helper.includes("PROMO_PAGE_SOCIAL_FALLBACK_IMAGE_PATH"),
    "reuses brand fallback path",
  );
  assert(share.includes("buildProductSharePayload"), "share payload untouched");
  assert(
    shareButton.includes("shareProductPage"),
    "share button control untouched",
  );
  assert(!layout.includes("openGraph"), "root layout metadata not expanded");
}

const tests = [
  ["public cover → og/twitter image", testPublicCoverEmitsAbsoluteOgAndTwitterImage],
  ["missing cover → icon-512", testMissingCoverFallsBackToBrandIcon],
  ["signed cover → fallback", testSignedCoverFallsBack],
  ["localhost/http covers rejected", testLocalhostAndHttpCoversFallBack],
  ["paid/free/music same helper", testPaidFreeMusicShareSameResolver],
  ["og:title is product name", testOgTitleIsProductNameNotPageSuffix],
  ["page wiring + share untouched", testMetadataWiringPreservesSeoAndShare],
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

console.log(`\n${tests.length} practice PDP social preview checks passed`);
