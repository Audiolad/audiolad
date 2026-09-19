#!/usr/bin/env node
/**
 * Unit checks for /dlya-avtorov-meditatsiy meditation authors selling landing.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  MEDITATION_AUTHORS_LANDING_BENEFITS,
  MEDITATION_AUTHORS_LANDING_BENEFITS_HEADING,
  MEDITATION_AUTHORS_LANDING_DATE_PUBLISHED,
  MEDITATION_AUTHORS_LANDING_FINAL_HEADING,
  MEDITATION_AUTHORS_LANDING_INTRO_HEADING,
  MEDITATION_AUTHORS_LANDING_MONETIZATION_CARDS,
  MEDITATION_AUTHORS_LANDING_MONETIZATION_HEADING,
  MEDITATION_AUTHORS_LANDING_PAGE_H1,
  MEDITATION_AUTHORS_LANDING_PATH,
  MEDITATION_AUTHORS_LANDING_PRIMARY_CTA,
  MEDITATION_AUTHORS_LANDING_SEARCH_CLOSING,
  MEDITATION_AUTHORS_LANDING_SEARCH_HEADING,
  MEDITATION_AUTHORS_LANDING_SECONDARY_CTA,
  MEDITATION_AUTHORS_LANDING_SEO_DESCRIPTION,
  MEDITATION_AUTHORS_LANDING_SEO_TITLE,
  MEDITATION_AUTHORS_LANDING_SPACE_HEADING,
  MEDITATION_AUTHORS_LANDING_STEPS,
  MEDITATION_AUTHORS_LANDING_STEPS_HEADING,
  MEDITATION_AUTHORS_LANDING_STUDIO_HEADING,
  MEDITATION_AUTHORS_LANDING_STUDIO_HREF,
  MEDITATION_AUTHORS_LANDING_SUBTITLE,
  MEDITATION_AUTHORS_LANDING_VISUALS,
} from "../src/lib/seo/meditation-authors-landing/content.ts";
import { buildMeditationAuthorsLandingPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import {
  buildMeditationAuthorsLandingMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import { BECOME_AUTHOR_HREF } from "../src/lib/profile/constants.ts";
import * as landingContent from "../src/lib/seo/meditation-authors-landing/content.ts";

const ORIGIN = "https://audiolad.ru";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function testPathAndCopy() {
  assert.equal(MEDITATION_AUTHORS_LANDING_PATH, "/dlya-avtorov-meditatsiy");
  assert.equal(
    MEDITATION_AUTHORS_LANDING_PAGE_H1,
    "Создавайте и публикуйте свои медитации на АудиоЛад",
  );
  assert.equal(
    MEDITATION_AUTHORS_LANDING_PRIMARY_CTA,
    "Стать автором бесплатно",
  );
  assert.equal(MEDITATION_AUTHORS_LANDING_SECONDARY_CTA, "Открыть Студию");
  assert.equal(MEDITATION_AUTHORS_LANDING_STUDIO_HREF, "/studio/meditation");
  assert.equal(MEDITATION_AUTHORS_LANDING_BENEFITS.length, 7);
  assert.equal(MEDITATION_AUTHORS_LANDING_STEPS.length, 4);
  assert.equal(MEDITATION_AUTHORS_LANDING_MONETIZATION_CARDS.length, 3);
  assert.equal(MEDITATION_AUTHORS_LANDING_VISUALS.length, 6);
  assert.ok(MEDITATION_AUTHORS_LANDING_SUBTITLE.includes("аудиопродукты"));
  assert.ok(
    MEDITATION_AUTHORS_LANDING_SEARCH_CLOSING.includes("АудиоЛад помогает"),
  );
  assert.match(MEDITATION_AUTHORS_LANDING_DATE_PUBLISHED, /^\d{4}-\d{2}-\d{2}$/);
}

function testFinalAssetsWired() {
  const expectedVisualSrc = {
    hero: "/images/meditation-authors-landing/hero.webp",
    studio: "/images/meditation-authors-landing/studio.webp",
    "author-space": "/images/meditation-authors-landing/author-space.webp",
    "listener-intro": "/images/meditation-authors-landing/listener-intro.webp",
    "search-funnel": "/images/meditation-authors-landing/search-funnel.webp",
    "final-cta": "/images/meditation-authors-landing/final-cta.webp",
  };
  for (const visual of MEDITATION_AUTHORS_LANDING_VISUALS) {
    assert.equal(
      visual.src,
      expectedVisualSrc[visual.id],
      `Visual ${visual.id} src mismatch`,
    );
    const assetPath = path.join(ROOT, "public", visual.src.replace(/^\//, ""));
    assert.ok(existsSync(assetPath), `missing asset file for ${visual.id}: ${assetPath}`);
  }

  const expectedBenefitSrc = {
    "author-page": "/images/meditation-authors-landing/benefit-01-author-page.webp",
    publish: "/images/meditation-authors-landing/benefit-02-publish.webp",
    studio: "/images/meditation-authors-landing/benefit-03-studio.webp",
    "free-paid": "/images/meditation-authors-landing/benefit-04-free-paid.webp",
    search: "/images/meditation-authors-landing/benefit-05-search.webp",
    programs: "/images/meditation-authors-landing/benefit-06-programs.webp",
    earn: "/images/meditation-authors-landing/benefit-07-earn.webp",
  };
  for (const benefit of MEDITATION_AUTHORS_LANDING_BENEFITS) {
    assert.equal(
      benefit.src,
      expectedBenefitSrc[benefit.id],
      `Benefit ${benefit.id} src mismatch`,
    );
    const assetPath = path.join(ROOT, "public", benefit.src.replace(/^\//, ""));
    assert.ok(existsSync(assetPath), `missing asset file for ${benefit.id}: ${assetPath}`);
  }
}

function testMetadata() {
  const metadata = buildMeditationAuthorsLandingMetadata();
  assert.equal(metadata.title, MEDITATION_AUTHORS_LANDING_SEO_TITLE);
  assert.equal(metadata.description, MEDITATION_AUTHORS_LANDING_SEO_DESCRIPTION);
  assert.equal(
    metadata.alternates?.canonical,
    buildSiteCanonicalUrl(MEDITATION_AUTHORS_LANDING_PATH),
  );
  assert.equal(
    metadata.alternates?.canonical,
    `${ORIGIN}${MEDITATION_AUTHORS_LANDING_PATH}`,
  );
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.robots?.follow, true);
  assert.equal(metadata.openGraph?.type, "website");
}

function testJsonLd() {
  const jsonLd = buildMeditationAuthorsLandingPageJsonLd({
    title: MEDITATION_AUTHORS_LANDING_PAGE_H1,
    description: MEDITATION_AUTHORS_LANDING_SEO_DESCRIPTION,
    path: MEDITATION_AUTHORS_LANDING_PATH,
    datePublished: MEDITATION_AUTHORS_LANDING_DATE_PUBLISHED,
  });
  const serialized = JSON.stringify(jsonLd);
  assert.match(serialized, /WebPage/);
  assert.match(serialized, /dlya-avtorov-meditatsiy/);
  assert.match(serialized, /Авторам/);
}

function testFilesExist() {
  const required = [
    "src/app/(platform)/(listener)/dlya-avtorov-meditatsiy/page.tsx",
    "src/app/(platform)/(listener)/dlya-avtorov-meditatsiy/layout.tsx",
    "src/components/meditation-authors-landing/MeditationAuthorsLandingPageView.tsx",
    "src/components/meditation-authors-landing/MeditationAuthorsBenefitsSlider.tsx",
    "src/components/meditation-authors-landing/meditation-authors-landing.css",
    "src/lib/seo/meditation-authors-landing/content.ts",
    "src/lib/seo/meditation-authors-landing/index.ts",
  ];
  for (const rel of required) {
    assert.ok(existsSync(path.join(ROOT, rel)), `missing ${rel}`);
  }
}

function testPageWiring() {
  const page = read(
    "src/app/(platform)/(listener)/dlya-avtorov-meditatsiy/page.tsx",
  );
  const view = read(
    "src/components/meditation-authors-landing/MeditationAuthorsLandingPageView.tsx",
  );
  const bottomNav = read("src/lib/navigation/bottom-nav.ts");
  const metadata = read("src/lib/seo/public-page-metadata.ts");
  const jsonLdIndex = read("src/lib/seo/json-ld/index.ts");

  assert.match(page, /buildMeditationAuthorsLandingMetadata/);
  assert.match(page, /buildMeditationAuthorsLandingPageJsonLd/);
  assert.match(view, /BECOME_AUTHOR_HREF/);
  assert.match(view, /MEDITATION_AUTHORS_LANDING_STUDIO_HREF/);
  assert.match(view, /MeditationAuthorsBenefitsSlider/);
  assert.equal(view.includes(BECOME_AUTHOR_HREF) || view.includes("BECOME_AUTHOR_HREF"), true);
  assert.match(view, /Стать автором бесплатно|MEDITATION_AUTHORS_LANDING_PRIMARY_CTA/);
  assert.match(
    bottomNav,
    /\/dlya-avtorov-meditatsiy/,
  );
  assert.match(metadata, /buildMeditationAuthorsLandingMetadata/);
  assert.match(jsonLdIndex, /buildMeditationAuthorsLandingPageJsonLd/);
  assert.equal(isBottomNavNeutralPathname(MEDITATION_AUTHORS_LANDING_PATH), true);

  // CTA repeat sites in the view
  const primaryMatches = view.split("MEDITATION_AUTHORS_LANDING_PRIMARY_CTA").length - 1;
  // PrimaryCta helper + possibly none — count CtaRow / PrimaryCta usages
  assert.match(view, /function PrimaryCta/);
  assert.match(view, /mal-benefits/);
  assert.match(view, /mal-listener-intro/);
  assert.match(view, /mal-monetization/);
  assert.match(view, /mal-final-cta/);
  assert.match(view, /mal-studio/);
  assert.ok(primaryMatches >= 1);
  assert.doesNotMatch(view, /Слот: \{card\.title\}/);
  assert.match(view, /hero\.webp|MEDITATION_AUTHORS_LANDING_VISUALS/);

  // Headings present via constants usage
  for (const token of [
    MEDITATION_AUTHORS_LANDING_BENEFITS_HEADING,
    MEDITATION_AUTHORS_LANDING_STUDIO_HEADING,
    MEDITATION_AUTHORS_LANDING_SPACE_HEADING,
    MEDITATION_AUTHORS_LANDING_INTRO_HEADING,
    MEDITATION_AUTHORS_LANDING_SEARCH_HEADING,
    MEDITATION_AUTHORS_LANDING_MONETIZATION_HEADING,
    MEDITATION_AUTHORS_LANDING_STEPS_HEADING,
    MEDITATION_AUTHORS_LANDING_FINAL_HEADING,
  ]) {
    assert.ok(
      JSON.stringify(landingContent).includes(token),
      `missing heading in content: ${token}`,
    );
  }
}

function testNoBakedMarketingInImages() {
  const view = read(
    "src/components/meditation-authors-landing/MeditationAuthorsLandingPageView.tsx",
  );
  assert.match(view, /<h1/);
  assert.match(view, /PrimaryCta|mal-cta-primary/);
  assert.doesNotMatch(view, /GenerateImage|unsplash|placeholder\.com/i);
}


function testSitemap() {
  const sitemap = read("src/lib/seo/sitemap-data.ts");
  assert.match(
    sitemap,
    /path:\s*"\/dlya-avtorov-meditatsiy"/,
    "landing path must be in STATIC_SITEMAP_PAGES",
  );
}

const tests = [
  ["path and copy", testPathAndCopy],
  ["final assets wired", testFinalAssetsWired],
  ["metadata", testMetadata],
  ["sitemap", testSitemap],
  ["json-ld", testJsonLd],
  ["files exist", testFilesExist],
  ["page wiring", testPageWiring],
  ["html text not baked into images", testNoBakedMarketingInImages],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`fail - ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log("meditation-authors-landing-page-unit: ok");
