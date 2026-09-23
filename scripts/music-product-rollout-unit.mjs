#!/usr/bin/env node
/**
 * Music / release product UI for every author.
 * Practice, course, audiobook, and post stay on the legacy Aurafon-gated flow.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import { isAuthorProductWizardEnabled } from "../src/lib/author-products/product-wizard-beta.ts";
import { isMusicProductWizardEnabled } from "../src/lib/author-products/music-product-wizard.ts";
import {
  buildCatalogSectionSaveField,
  isCatalogSectionFieldEnabled,
  resolveCatalogSectionPatch,
  suggestCatalogSection,
} from "../src/lib/author-products/catalog-section-field.ts";
import {
  AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE,
  hasAudioProductAuthor,
} from "../src/lib/author-products/audio-product-author.ts";
import {
  MUSIC_TRACK_TITLE_CYRILLIC_ERROR,
  validateMusicTrackTitleCyrillic,
} from "../src/lib/author-products/music-track-title.ts";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import { isAuthorProductQualityReviewEnabled } from "../src/lib/seo/product-quality-review/beta.ts";
import {
  isAuthorSeoDiscoveryEnabled,
  isMusicCreateSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const OTHER = "00000000-0000-4000-8000-000000000099";

const classes = ["practice", "course", "audiobook", "post", "release"];

assert.equal(isAuthorProductWizardEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorProductWizardEnabled(OTHER), false);
assert.doesNotMatch(
  read("src/lib/author-products/product-wizard-beta.ts"),
  /return true;/,
);

for (const publicationClass of classes) {
  const music = publicationClass === "release";
  assert.equal(
    isMusicProductWizardEnabled({ authorId: OTHER, publicationClass }),
    music,
    publicationClass,
  );
  assert.equal(
    isMusicCreateSeoDiscoveryEnabled({ authorId: OTHER, publicationClass }),
    music,
    `seo ${publicationClass}`,
  );
  assert.equal(
    isMusicProductWizardEnabled({
      authorId: AURAFON_AUTHOR_ID,
      publicationClass,
    }),
    music,
    `aurafon music wizard ${publicationClass}`,
  );
  assert.equal(
    isMusicCreateSeoDiscoveryEnabled({
      authorId: AURAFON_AUTHOR_ID,
      publicationClass,
    }),
    true,
    `aurafon seo ${publicationClass}`,
  );
}

assert.equal(
  isMusicProductWizardEnabled({
    authorId: OTHER,
    productKind: PRODUCT_KIND.MUSIC,
    publicationClass: "practice",
  }),
  true,
);
assert.equal(
  isMusicProductWizardEnabled({
    authorId: OTHER,
    productKind: PRODUCT_KIND.PRACTICE,
    publicationClass: "practice",
  }),
  false,
);
assert.equal(isAuthorSeoDiscoveryEnabled(OTHER), false);
assert.equal(isAuthorSeoDiscoveryEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(
  isMusicCreateSeoDiscoveryEnabled({ authorId: OTHER }),
  false,
);

assert.equal(
  isAuthorProductQualityReviewEnabled(OTHER, { productKind: "music" }),
  true,
);
assert.equal(
  isAuthorProductQualityReviewEnabled(OTHER, { publicationClass: "release" }),
  true,
);
assert.equal(
  isAuthorProductQualityReviewEnabled(OTHER, {
    productKind: "practice",
    publicationClass: "course",
  }),
  false,
);
assert.equal(
  isAuthorProductQualityReviewEnabled(AURAFON_AUTHOR_ID, {
    publicationClass: "practice",
  }),
  true,
);
assert.equal(isAuthorProductQualityReviewEnabled(OTHER), false);

assert.equal(suggestCatalogSection({ productKind: "music" }), "music");
assert.equal(
  isCatalogSectionFieldEnabled({
    authorId: OTHER,
    publicationClass: "release",
  }),
  true,
);
assert.equal(
  isCatalogSectionFieldEnabled({
    authorId: OTHER,
    publicationClass: "practice",
  }),
  false,
);
assert.equal(
  isCatalogSectionFieldEnabled({
    authorId: AURAFON_AUTHOR_ID,
    publicationClass: "course",
  }),
  true,
);
assert.deepEqual(
  buildCatalogSectionSaveField({
    authorId: OTHER,
    productKind: "music",
    catalogSection: "stories",
  }),
  { catalog_section: "stories" },
);
assert.deepEqual(
  resolveCatalogSectionPatch({
    authorId: OTHER,
    publicationClass: "release",
    present: true,
    catalogSection: "education",
  }),
  { action: "apply", catalogSection: "education" },
);
assert.deepEqual(
  resolveCatalogSectionPatch({
    authorId: OTHER,
    publicationClass: "audiobook",
    present: true,
    catalogSection: "books",
  }),
  { action: "omit" },
);

assert.equal(hasAudioProductAuthor("Сергей"), true);
assert.equal(AUDIO_PRODUCT_AUTHOR_REQUIRED_MESSAGE, "Укажите автора музыки.");
assert.equal(validateMusicTrackTitleCyrillic("Подводные сны"), null);
assert.equal(
  validateMusicTrackTitleCyrillic("Underwater Dreams"),
  MUSIC_TRACK_TITLE_CYRILLIC_ERROR,
);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const createPage = read("src/app/(platform)/author-dashboard/products/new/page.tsx");
const discoveryRoute = read("src/app/api/author/seo/discovery/route.ts");
const proposalsRoute = read("src/app/api/author/seo/proposals/route.ts");
const reservationRoute = read("src/app/api/author/seo-reservations/route.ts");
const qualityRoute = read("src/app/api/author/seo/product-quality-review/route.ts");
const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
const opportunitiesPage = read(
  "src/app/(platform)/author-dashboard/seo-opportunities/page.tsx",
);
const panel = read("src/components/author-dashboard/AuthorSeoDiscoveryPanel.tsx");
const seoQueryStep = read(
  "src/components/author-dashboard/AuthorProductSeoQueryStep.tsx",
);
const seoSection = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
const createRoute = read("src/app/api/author/products/route.ts");
const updateRoute = read("src/app/api/author/products/[id]/route.ts");

assert.match(
  form,
  /isAuthorProductWizardEnabled\(form\.authorId\) \|\| musicProductWizard/,
);
assert.match(form, /isMusicProductWizardEnabled\(\{/);
assert.match(form, /publicationClass: form\.publicationClass/);
assert.doesNotMatch(form, /isAurafonMusicWizard/);
assert.match(form, /validateMusicTrackTitleCyrillic/);
assert.match(form, /Автор музыки/);
assert.match(form, /data-catalog-section=""/);

assert.match(createPage, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(createPage, /publicationClass/);
assert.match(createPage, /AuthorProductSeoQueryStep/);
assert.doesNotMatch(createPage, /isAuthorSeoDiscoveryEnabled\(/);

assert.match(discoveryRoute, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(discoveryRoute, /publication_class/);
assert.match(discoveryRoute, /seo_discovery_beta_disabled/);
assert.match(proposalsRoute, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(proposalsRoute, /publication_class/);
assert.match(proposalsRoute, /seo_discovery_beta_disabled/);
assert.match(reservationRoute, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(reservationRoute, /publication_class/);
assert.match(reservationRoute, /seo_discovery_beta_disabled/);
assert.match(panel, /publication_class: publicationClass/);
assert.doesNotMatch(seoQueryStep, />\s*Бета\s*</);
assert.doesNotMatch(panel, />\s*Бета\s*</);
assert.match(panel, /"Что ищут слушатели"/);

assert.match(nav, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(nav, /isMusicCreateSeoDiscoveryEnabled/);
assert.match(opportunitiesPage, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(opportunitiesPage, /isMusicCreateSeoDiscoveryEnabled/);

assert.match(qualityRoute, /isAuthorProductQualityReviewEnabled/);
assert.match(qualityRoute, /productKind/);
assert.match(qualityRoute, /publicationClass/);
assert.match(qualityRoute, /product_quality_review_beta_disabled/);
assert.match(seoSection, /isAuthorProductQualityReviewEnabled\(authorId, \{/);

assert.match(createRoute, /resolveCatalogSectionPatch/);
assert.match(updateRoute, /resolveCatalogSectionPatch/);
assert.match(createRoute, /publicationClass: classification\.value\.publicationClass/);
assert.match(updateRoute, /updates\.catalog_section = catalogSectionPatch\.catalogSection/);

assert.doesNotMatch(
  read("src/lib/author-products/music-product-wizard.ts"),
  /isAurafonAuthor|isAuthorProductWizardEnabled/,
);

console.log("music-product-rollout-unit: ok");
