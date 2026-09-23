#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AURAFON_CATALOG_SECTION_FIELD_LABEL,
  AURAFON_CATALOG_SECTION_OPTIONS,
  applyAurafonCatalogSectionSuggestion,
  aurafonCatalogSectionValues,
  buildAurafonCatalogSectionSaveField,
  catalogSectionColumnForInsert,
  catalogSectionForProductForm,
  isAurafonCatalogSectionFieldEnabled,
  resolveAurafonCatalogSectionPatch,
  suggestAurafonCatalogSection,
  suggestAurafonCatalogSectionFromFormFields,
} from "../src/lib/author-products/aurafon-catalog-section.ts";
import { productDetailToFormSnapshot } from "../src/lib/author-products/form-merge.ts";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import {
  CATALOG_SECTION_LABELS,
  CATALOG_SECTIONS,
  PUBLIC_CATALOG_SECTION_CARDS,
} from "../src/lib/catalog/catalog-sections.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const OTHER = "00000000-0000-4000-8000-000000000099";

assert.equal(AURAFON_CATALOG_SECTION_FIELD_LABEL, "Категория в каталоге");

// 1. Field is enabled only for the Aurafon author workspace.
assert.equal(isAurafonCatalogSectionFieldEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(
  isAurafonCatalogSectionFieldEnabled(`  ${AURAFON_AUTHOR_ID}  `),
  true,
);
assert.equal(isAurafonCatalogSectionFieldEnabled(OTHER), false);
assert.equal(isAurafonCatalogSectionFieldEnabled(null), false);
assert.equal(isAurafonCatalogSectionFieldEnabled(undefined), false);
assert.equal(isAurafonCatalogSectionFieldEnabled(""), false);
assert.equal(isAurafonCatalogSectionFieldEnabled("   "), false);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(
  form,
  /isAurafonCatalogSectionFieldEnabled\(form\.authorId\) \? \([\s\S]*?data-aurafon-catalog-section=""[\s\S]*?AURAFON_CATALOG_SECTION_FIELD_LABEL[\s\S]*?name="catalog_section"[\s\S]*?AURAFON_CATALOG_SECTION_OPTIONS\.map/,
);
const formatAt = form.indexOf("Публичный формат");
const fieldAt = form.indexOf("data-aurafon-catalog-section");
const step3At = form.indexOf("showWizardStep(3) ? (");
const secondStep1At = form.indexOf("showWizardStep(1)", step3At);
assert.ok(formatAt > 0 && fieldAt > formatAt);
assert.ok(secondStep1At > step3At && fieldAt > secondStep1At);
assert.equal(form.split("data-aurafon-catalog-section").length - 1, 1);

// 2. Exactly the five existing catalog_section values, with author labels.
assert.equal(AURAFON_CATALOG_SECTION_OPTIONS.length, 5);
assert.equal(CATALOG_SECTIONS.length, 5);
assert.deepEqual(
  AURAFON_CATALOG_SECTION_OPTIONS.map((option) => option.value),
  ["meditations", "music", "education", "stories", "books"],
);
assert.deepEqual(
  [...aurafonCatalogSectionValues()].sort(),
  [...CATALOG_SECTIONS].sort(),
);
assert.deepEqual(
  Object.fromEntries(
    AURAFON_CATALOG_SECTION_OPTIONS.map((option) => [option.value, option.label]),
  ),
  {
    meditations: "Практики",
    music: "Музыка",
    education: "Обучение",
    stories: "Истории",
    books: "Книги",
  },
);
assert.equal(new Set(AURAFON_CATALOG_SECTION_OPTIONS.map((option) => option.value)).size, 5);
assert.equal(CATALOG_SECTION_LABELS.meditations, "Медитации");
assert.equal(PUBLIC_CATALOG_SECTION_CARDS.length, 4);
assert.equal(
  PUBLIC_CATALOG_SECTION_CARDS.some((card) => card.value === "books"),
  false,
);

const migrationHits = readdirSync(path.join(root, "supabase/migrations")).filter(
  (name) => read(`supabase/migrations/${name}`).includes("catalog_section"),
);
assert.deepEqual(migrationHits, [
  "20261009120200_practice_catalog_sections.sql",
]);
const migration = read(`supabase/migrations/${migrationHits[0]}`);
for (const value of ["music", "meditations", "education", "stories", "books"]) {
  assert.match(migration, new RegExp(`'${value}'`));
}

// 3. Create, save, and edit persistence of catalog_section.
assert.deepEqual(
  buildAurafonCatalogSectionSaveField({
    authorId: AURAFON_AUTHOR_ID,
    catalogSection: "books",
  }),
  { catalog_section: "books" },
);
assert.deepEqual(catalogSectionColumnForInsert("stories"), {
  catalog_section: "stories",
});
assert.deepEqual(catalogSectionColumnForInsert(null), {});
assert.deepEqual(
  resolveAurafonCatalogSectionPatch({
    authorId: AURAFON_AUTHOR_ID,
    present: true,
    catalogSection: "education",
  }),
  { action: "apply", catalogSection: "education" },
);
assert.deepEqual(
  resolveAurafonCatalogSectionPatch({
    authorId: AURAFON_AUTHOR_ID,
    present: false,
    catalogSection: "education",
  }),
  { action: "omit" },
);
assert.deepEqual(
  resolveAurafonCatalogSectionPatch({
    authorId: AURAFON_AUTHOR_ID,
    present: true,
    catalogSection: "podcasts",
  }),
  { action: "reject", error: "invalid_catalog_section" },
);

assert.match(form, /buildAurafonCatalogSectionSaveField\(\{[\s\S]*?authorId: form\.authorId,[\s\S]*?catalogSection: form\.catalogSection,[\s\S]*?\}\),/);
assert.equal(form.split("buildAurafonCatalogSectionSaveField(").length - 1, 2);

const createRoute = read("src/app/api/author/products/route.ts");
const updateRoute = read("src/app/api/author/products/[id]/route.ts");
const products = read("src/lib/author-products/products.ts");
assert.match(createRoute, /resolveAurafonCatalogSectionPatch/);
assert.match(createRoute, /catalogSection:\s*\n?\s*catalogSectionPatch\.action === "apply"/);
assert.match(updateRoute, /resolveAurafonCatalogSectionPatch/);
assert.match(updateRoute, /updates\.catalog_section = catalogSectionPatch\.catalogSection/);
assert.match(products, /catalog_section,/);
assert.match(products, /catalogSectionColumnForInsert\(input\.catalogSection\)/);

const loaded = catalogSectionForProductForm({
  catalog_section: "books",
  product_kind: PRODUCT_KIND.PRACTICE,
  publication_class: "practice",
  format: "Аудиоистория",
});
assert.equal(loaded, "books");
assert.equal(
  catalogSectionForProductForm({
    catalog_section: null,
    product_kind: PRODUCT_KIND.PRACTICE,
    publication_class: "practice",
    format: "Лекция",
  }),
  "education",
);

const edited = productDetailToFormSnapshot({
  practice: {
    id: "p1",
    author_id: AURAFON_AUTHOR_ID,
    title: "История",
    slug: "istoriya",
    subtitle: null,
    description: null,
    audio_product_author: null,
    format: "Аудиоистория",
    product_kind: PRODUCT_KIND.PRACTICE,
    publication_class: "practice",
    music_usage_permission: null,
    studio_music_pricing_mode: null,
    studio_music_price_minor: null,
    duration_minutes: null,
    price: 0,
    is_free: true,
    is_catalog_listed: true,
    catalog_visibility: "listed",
    catalog_section: "music",
    cover_url: null,
    use_shared_cover: true,
    audio_url: null,
    status: "draft",
    moderation_status: "not_submitted",
    moderation_attempt: 0,
    moderation_submitted_at: null,
    moderation_review_comment: null,
    deleted_at: null,
    deleted_by: null,
    deletion_reason: null,
    currency: "RUB",
    published_at: null,
    listening_notice_enabled: true,
    listening_notice_title: "",
    listening_notice_text: "",
    promo_enabled: false,
    promo_title: null,
    promo_text: null,
    promo_button_text: null,
    promo_url: null,
    promo_open_in_new_tab: false,
    primary_seo_query_id: null,
    seo_primary_query: null,
    seo_secondary_queries: null,
    seo_title: null,
    seo_description: null,
    seo_about: null,
    author_recommendations_title: null,
    listener_appreciation_override: null,
    created_at: "2026-09-23T00:00:00.000Z",
    updated_at: "2026-09-23T00:00:00.000Z",
  },
  audio_items: [],
  gallery_slides: [],
  seo_content: {
    usageItems: [],
    faqItems: [],
    relatedPracticeIds: [],
    relatedListenSlugs: [],
  },
  contentLockedAfterSale: false,
  deleteLockedAfterPaidPurchase: false,
});
assert.equal(edited.catalogSection, "music");

// 4. Non-Aurafon authors do not see or persist the field.
assert.deepEqual(
  buildAurafonCatalogSectionSaveField({
    authorId: OTHER,
    catalogSection: "books",
  }),
  {},
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    buildAurafonCatalogSectionSaveField({
      authorId: OTHER,
      catalogSection: "books",
    }),
    "catalog_section",
  ),
  false,
);
assert.deepEqual(
  resolveAurafonCatalogSectionPatch({
    authorId: OTHER,
    present: true,
    catalogSection: "books",
  }),
  { action: "omit" },
);
assert.deepEqual(
  resolveAurafonCatalogSectionPatch({
    authorId: OTHER,
    present: true,
    catalogSection: "not-a-section",
  }),
  { action: "omit" },
);

const adminActions = read("src/app/(platform)/admin/catalog-sections/actions.ts");
const adminPage = read("src/app/(platform)/admin/catalog-sections/page.tsx");
assert.match(adminActions, /\.update\(\{ catalog_section: catalogSection \}\)/);
assert.doesNotMatch(adminActions, /isAurafon|AURAFON_AUTHOR_ID|aurafon-catalog-section/);
assert.doesNotMatch(adminPage, /isAurafon|AURAFON_AUTHOR_ID|aurafon-catalog-section/);

// 5. Soft suggestion can be overridden.
const suggestions = [
  [{ productKind: "music", publicationClass: "release", format: "Музыка" }, "music"],
  [{ productKind: "practice", publicationClass: "release", format: null }, "music"],
  [{ productKind: "practice", publicationClass: "course", format: null }, "education"],
  [{ productKind: "practice", publicationClass: "course", format: "Медитация" }, "education"],
  [{ productKind: "practice", publicationClass: "practice", format: "Лекция" }, "education"],
  [{ productKind: "practice", publicationClass: "practice", format: "Аудиокурс" }, "education"],
  [{ productKind: "practice", publicationClass: "audiobook", format: null }, "books"],
  [{ productKind: "practice", publicationClass: "practice", format: "Аудиокнига" }, "books"],
  [{ productKind: "practice", publicationClass: "practice", format: "Аудиоистория" }, "stories"],
  [{ productKind: "practice", publicationClass: "practice", format: "Медитация" }, "meditations"],
  [{ productKind: "practice", publicationClass: "practice", format: "Аудиопрактика" }, "meditations"],
  [{ productKind: "practice", publicationClass: "practice", format: null }, "meditations"],
  [{ productKind: "audio_post", publicationClass: "post", format: "Аудиопост" }, "meditations"],
];

for (const [input, expected] of suggestions) {
  assert.equal(suggestAurafonCatalogSection(input), expected, JSON.stringify(input));
}

assert.equal(
  suggestAurafonCatalogSectionFromFormFields({
    productKind: "practice",
    publicationClass: "practice",
    formatPreset: "Лекция",
    customFormat: "",
  }),
  "education",
);

const overridden = applyAurafonCatalogSectionSuggestion({
  overridden: true,
  current: "books",
  productKind: "practice",
  publicationClass: "course",
  formatPreset: "Лекция",
  customFormat: "",
});
assert.equal(overridden, "books");
assert.deepEqual(
  buildAurafonCatalogSectionSaveField({
    authorId: AURAFON_AUTHOR_ID,
    catalogSection: overridden,
  }),
  { catalog_section: "books" },
);

assert.match(form, /setCatalogSectionOverridden\(true\)/);
assert.match(
  form,
  /mergeFormWithCatalogSuggestion\(current, \{[\s\S]*?publicationClass: option\.value/,
);
assert.match(
  form,
  /mergeFormWithCatalogSuggestion\(current, \{[\s\S]*?formatPreset: value/,
);

const suggestedAgain = applyAurafonCatalogSectionSuggestion({
  overridden: false,
  current: "books",
  productKind: "practice",
  publicationClass: "course",
  formatPreset: "Лекция",
  customFormat: "",
});
assert.equal(suggestedAgain, "education");

const formMerge = read("src/lib/author-products/form-merge.ts");
assert.match(formMerge, /catalogSection: catalogSectionForProductForm\(practice\)/);
assert.match(formMerge, /catalogSection: current\.catalogSection/);

console.log("author-product-aurafon-catalog-section-unit: ok");
