#!/usr/bin/env node
/**
 * Phase 1 Author Cabinet foundation — classification, adapter priority, SQL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";
import {
  CABINET_BRANCH,
  publicationClassToLegacyKind,
  resolveCreateClassification,
  resolvePublicationClass,
} from "../src/lib/author-products/publication-class.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertOk(result, message) {
  assert.equal(result.ok, true, message);
  return result.value;
}

const practiceCreate = assertOk(
  resolveCreateClassification({
    publicationClass: "practice",
    cabinetBranch: "product",
  }),
  "create practice",
);
assert.equal(practiceCreate.publicationClass, "practice");
assert.equal(practiceCreate.productKind, "practice");
assert.equal(practiceCreate.cabinetBranch, CABINET_BRANCH.PRODUCT);

const courseCreate = assertOk(
  resolveCreateClassification({
    publicationClass: "course",
    cabinetBranch: "product",
  }),
  "create course",
);
assert.equal(courseCreate.publicationClass, "course");
assert.equal(courseCreate.productKind, "practice");
assert.equal(courseCreate.cabinetBranch, CABINET_BRANCH.PRODUCT);

const audiobookCreate = assertOk(
  resolveCreateClassification({
    publicationClass: "audiobook",
    cabinetBranch: "product",
  }),
  "create audiobook",
);
assert.equal(audiobookCreate.publicationClass, "audiobook");
assert.equal(audiobookCreate.productKind, "practice");

const musicCreate = assertOk(
  resolveCreateClassification({ cabinetBranch: "music" }),
  "create music branch",
);
assert.equal(musicCreate.publicationClass, "release");
assert.equal(musicCreate.productKind, "music");
assert.equal(musicCreate.cabinetBranch, CABINET_BRANCH.MUSIC);

const postCreate = assertOk(
  resolveCreateClassification({
    publicationClass: "post",
    cabinetBranch: "post",
  }),
  "create post",
);
assert.equal(postCreate.publicationClass, "post");
assert.equal(postCreate.productKind, "audio_post");

const legacyKindCreate = assertOk(
  resolveCreateClassification({ productKind: "music" }),
  "legacy product_kind still creates",
);
assert.equal(legacyKindCreate.publicationClass, "release");
assert.equal(legacyKindCreate.productKind, "music");

assert.equal(
  resolveCreateClassification({
    publicationClass: "course",
    productKind: "music",
  }).ok,
  false,
  "course cannot shadow as music",
);
assert.equal(
  resolveCreateClassification({
    publicationClass: "release",
    cabinetBranch: "product",
  }).ok,
  false,
  "release is not the product branch",
);

assert.equal(publicationClassToLegacyKind("practice"), "practice");
assert.equal(publicationClassToLegacyKind("course"), "practice");
assert.equal(publicationClassToLegacyKind("audiobook"), "practice");
assert.equal(publicationClassToLegacyKind("release"), "music");
assert.equal(publicationClassToLegacyKind("post"), "audio_post");

assert.equal(
  resolvePublicationClass("course", "practice"),
  "course",
  "adapter class priority: publication_class > product_kind",
);
assert.equal(
  resolvePublicationClass(null, "music"),
  "release",
  "NULL class reads legacy music as release",
);
assert.equal(
  resolvePublicationClass(undefined, "audio_post"),
  "post",
  "NULL class reads legacy audio_post as post",
);
assert.equal(
  resolvePublicationClass(null, "practice"),
  "practice",
  "NULL class reads legacy practice as practice",
);

const source = {
  id: "pub-1",
  slug: "item",
  title: "Материал",
  authorName: "Анна",
  authorSlug: "anna",
  href: "/practice/anna/item",
};

const nullClassCard = adaptLegacyCatalogSourceToCard({
  ...source,
  publicationClass: null,
  productKind: "practice",
  format: "Аудиокурс",
  price: 490,
  isFree: false,
});
assert.equal(nullClassCard?.class, "practice");

const courseCard = adaptLegacyCatalogSourceToCard({
  ...source,
  publicationClass: "course",
  productKind: "practice",
  format: "Аудиопрактика",
  price: 490,
  isFree: false,
});
assert.equal(courseCard?.class, "course");

const postCard = adaptLegacyCatalogSourceToCard({
  ...source,
  publicationClass: "post",
  productKind: "audio_post",
  isFree: true,
  price: 0,
});
assert.equal(postCard?.class, "post");
assert.equal(postCard?.default_offer, null);

const legacyRow = coercePracticeRow({
  id: "legacy-1",
  author_id: "author-1",
  title: "Старый черновик",
  slug: "old-draft",
  subtitle: null,
  description: null,
  format: "Аудиопрактика",
  product_kind: "practice",
  publication_class: null,
  music_usage_permission: null,
  duration_minutes: null,
  price: 0,
  is_free: true,
  cover_url: null,
  use_shared_cover: true,
  audio_url: null,
  status: "draft",
  currency: "RUB",
  published_at: null,
  listening_notice_enabled: true,
  listening_notice_title: "",
  listening_notice_text: "",
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
});
assert.equal(legacyRow.publication_class, null);
assert.equal(legacyRow.product_kind, "practice");

const migration = read(
  "supabase/migrations/20260825120000_practice_publication_class.sql",
);
assert.match(migration, /ADD COLUMN IF NOT EXISTS publication_class text NULL/);
assert.match(
  migration,
  /publication_class IN \('practice', 'course', 'audiobook', 'release', 'post'\)/,
);
assert.doesNotMatch(migration, /\bUPDATE\b/);
assert.match(migration, /No backfill/);

const createApi = read("src/app/api/author/products/route.ts");
assert.match(createApi, /publication_class/);
assert.match(createApi, /cabinet_branch/);
assert.match(createApi, /resolveCreateClassification/);

const updateApi = read("src/app/api/author/products/[id]/route.ts");
assert.match(updateApi, /publication_class/);
assert.match(updateApi, /cabinet_branch/);

const createDraft = read("src/lib/author-products/products.ts");
assert.match(createDraft, /publication_class: publicationClass/);
assert.match(createDraft, /product_kind: productKind/);

const wizard = read("src/components/author-dashboard/AuthorCreateWizard.tsx");
assert.match(wizard, /CABINET_BRANCH_LABELS/);
assert.match(wizard, /AUTHOR_PUBLICATION_CLASS_LABELS/);
assert.match(wizard, /CABINET_BRANCH\.PRODUCT/);
assert.match(wizard, /CABINET_BRANCH\.MUSIC/);
assert.match(wizard, /CABINET_BRANCH\.POST/);
assert.match(wizard, /"practice"/);
assert.match(wizard, /"course"/);
assert.match(wizard, /"audiobook"/);

const labels = read("src/lib/author-products/publication-class.ts");
assert.match(labels, /product: "Продукт"/);
assert.match(labels, /music: "Музыка"/);
assert.match(labels, /post: "Аудиопост"/);
assert.match(labels, /practice: "Аудиопрактика"/);
assert.match(labels, /course: "Аудиокурс"/);
assert.match(labels, /audiobook: "Аудиокнига"/);

const newPage = read(
  "src/app/(platform)/author-dashboard/products/new/page.tsx",
);
assert.match(newPage, /AuthorCreateWizard/);
assert.match(newPage, /initialPublicationClass/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /publication_class: form.publicationClass/);
assert.doesNotMatch(form, /Section|Lesson|Chapter|Gallery editor/);

const listing = read("src/lib/catalog/listing.ts");
assert.doesNotMatch(
  listing,
  /query\.class === "course" \|\| query\.class === "audiobook"/,
  "course/audiobook listing is no longer hard-empty",
);
assert.match(listing, /resolvePublicationClass/);

const adapter = read("src/lib/catalog/legacy-adapter.ts");
assert.match(adapter, /resolvePublicationClass/);
assert.doesNotMatch(
  adapter,
  /source\.format[\s\S]{0,80}class/,
  "adapter class path does not read format",
);

console.log("author-cabinet-phase1-unit: ok");
