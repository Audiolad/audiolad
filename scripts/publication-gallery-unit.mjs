#!/usr/bin/env node
/**
 * Phase 1B Product Gallery: eligibility, create/list/order, catalog attach.
 */
import assert from "node:assert/strict";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";
import { mapCatalogProductToListingItem } from "../src/lib/catalog/listing.ts";
import { CATALOG_GALLERY_MAX_SLIDES } from "../src/lib/catalog/gallery.ts";
import { buildCoverFirstHeroSlides } from "../src/lib/catalog/product-hero-gallery.ts";
import {
  catalogGalleryForPublication,
  groupPublicationGalleryRowsByPublicationId,
  mapPublicationGalleryRowsToCatalogSlides,
} from "../src/lib/catalog/publication-gallery.ts";
import {
  isProductGalleryClass,
  isProductGalleryEligible,
  resolveCreateClassification,
  resolvePublicationClass,
} from "../src/lib/author-products/publication-class.ts";
import {
  buildGallerySlideReplacePatch,
  nextGalleryPosition,
  validateGalleryReorderBatch,
} from "../src/lib/author-products/gallery-shared.ts";

function source(overrides = {}) {
  return {
    id: "pub-1",
    slug: "morning",
    title: "Утро",
    subtitle: "Коротко",
    productKind: "practice",
    price: 490,
    isFree: false,
    coverUrl: "/cover.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/morning",
    publishedAt: "2026-08-01T00:00:00.000Z",
    durationSeconds: 600,
    ...overrides,
  };
}

function product(overrides = {}) {
  return {
    id: "p1",
    authorId: "a1",
    title: "Практика",
    slug: "practice",
    subtitle: null,
    description: null,
    format: "Аудиопрактика",
    productKind: "practice",
    price: 900,
    isFree: false,
    coverUrl: "/cover.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/practice",
    meta: null,
    statsLabel: "12 мин",
    productTypeLabel: "Аудиопрактика",
    priceLabel: "900 ₽",
    sortTimestamp: 1_700_000_000_000,
    audioCount: 1,
    durationSeconds: 720,
    publishedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

assert.equal(CATALOG_GALLERY_MAX_SLIDES, 30);

assert.equal(isProductGalleryClass("practice"), true);
assert.equal(isProductGalleryClass("course"), true);
assert.equal(isProductGalleryClass("audiobook"), true);
assert.equal(isProductGalleryClass("release"), true);
assert.equal(isProductGalleryClass("post"), false);

assert.equal(isProductGalleryEligible("practice", "practice"), true);
assert.equal(isProductGalleryEligible("course", "practice"), true);
assert.equal(isProductGalleryEligible("audiobook", "practice"), true);
assert.equal(isProductGalleryEligible(null, "practice"), true, "legacy NULL+practice");
assert.equal(isProductGalleryEligible("release", "music"), true);
assert.equal(isProductGalleryEligible("post", "audio_post"), false);
assert.equal(isProductGalleryEligible(null, "music"), true, "legacy music");
assert.equal(isProductGalleryEligible(null, "audio_post"), false, "legacy audio_post");
assert.equal(
  isProductGalleryEligible("course", "music"),
  true,
  "explicit class wins even if kind is leftover music",
);

const courseCreate = resolveCreateClassification({
  publicationClass: "course",
  cabinetBranch: "product",
});
assert.equal(courseCreate.ok, true);
assert.equal(courseCreate.value.publicationClass, "course");
assert.equal(courseCreate.value.productKind, "practice");
assert.equal(
  resolvePublicationClass("course", "practice"),
  "course",
  "#80 adapter prefers publication_class",
);

const created = [];
assert.equal(nextGalleryPosition(created), 0);
created.push({ id: "s1", position: nextGalleryPosition(created) });
assert.equal(created[0].position, 0);
created.push({ id: "s2", position: nextGalleryPosition(created) });
assert.equal(created[1].position, 1);
created.push({ id: "s3", position: nextGalleryPosition(created) });
assert.deepEqual(
  created.map((slide) => slide.position),
  [0, 1, 2],
  "practice gallery create appends next position",
);

const listed = mapPublicationGalleryRowsToCatalogSlides([
  { id: "s3", publication_id: "pub-1", image_url: "/3.jpg", position: 2, alt: "C" },
  { id: "s1", publication_id: "pub-1", image_url: "/1.jpg", position: 0, alt: "A" },
  { id: "s2", publication_id: "pub-1", image_url: "/2.jpg", position: 1, alt: "B" },
]);
assert.deepEqual(
  listed.map((slide) => slide.id),
  ["s1", "s2", "s3"],
  "practice gallery list/catalog reads position ASC",
);

const reordered = validateGalleryReorderBatch(
  ["s1", "s2", "s3"],
  [
    { id: "s3", position: 0 },
    { id: "s1", position: 1 },
    { id: "s2", position: 2 },
  ],
);
assert.equal(reordered.ok, true);
assert.deepEqual(
  reordered.ok ? reordered.ordered.map((slide) => slide.id) : [],
  ["s3", "s1", "s2"],
  "reorder batch updates positions as a complete 0-based permutation",
);

assert.equal(
  validateGalleryReorderBatch(["s1", "s2"], [{ id: "s1", position: 0 }]).ok,
  false,
  "reorder rejects incomplete set",
);
assert.equal(
  validateGalleryReorderBatch(
    ["s1", "s2"],
    [
      { id: "s1", position: 0 },
      { id: "s2", position: 0 },
    ],
  ).ok,
  false,
  "reorder rejects duplicate positions",
);
assert.equal(
  validateGalleryReorderBatch(
    ["s1", "s2"],
    [
      { id: "s1", position: 0 },
      { id: "missing", position: 1 },
    ],
  ).ok,
  false,
  "reorder rejects unknown ids",
);

const replacePatch = buildGallerySlideReplacePatch({
  imageUrl: "/new.jpg",
  imageManifest: { version: 1 },
});
assert.deepEqual(Object.keys(replacePatch).sort(), [
  "image_manifest",
  "image_url",
]);
assert.equal("id" in replacePatch, false);
assert.equal("position" in replacePatch, false);

const leftover = [
  { id: "leftover", image_url: "/x.jpg", position: 0, alt: "x" },
];
assert.deepEqual(
  catalogGalleryForPublication("release", "music", leftover).map((slide) => slide.id),
  ["leftover"],
  "release + music gallery reaches catalog DTO",
);
assert.deepEqual(
  catalogGalleryForPublication("post", "audio_post", leftover),
  [],
  "post leftover rows do not become catalog gallery",
);
assert.deepEqual(
  catalogGalleryForPublication(null, "music", leftover).map((slide) => slide.id),
  ["leftover"],
  "legacy music gallery reaches catalog DTO",
);

const courseSlides = catalogGalleryForPublication("course", "practice", [
  { id: "c2", image_url: "/c2.jpg", position: 1, alt: "two" },
  { id: "c1", image_url: "/c1.jpg", position: 0, alt: "one" },
]);
assert.deepEqual(
  courseSlides.map((slide) => slide.id),
  ["c1", "c2"],
  "course gallery is eligible and ordered",
);

const audiobookSlides = catalogGalleryForPublication("audiobook", "practice", [
  { id: "a1", image_url: "/a1.jpg", position: 0, alt: "" },
]);
assert.equal(audiobookSlides.length, 1, "audiobook gallery is eligible");

const grouped = groupPublicationGalleryRowsByPublicationId([
  { id: "p1s2", publication_id: "pub-1", image_url: "/1b.jpg", position: 1, alt: null },
  { id: "p1s1", publication_id: "pub-1", image_url: "/1.jpg", position: 0, alt: null },
  { id: "p2s1", publication_id: "pub-2", image_url: "/2.jpg", position: 0, alt: "Two" },
]);
assert.deepEqual(
  grouped.get("pub-1")?.map((slide) => slide.id),
  ["p1s1", "p1s2"],
);

const leftoverReleaseCard = adaptLegacyCatalogSourceToCard(
  source({
    productKind: "music",
    publicationClass: "release",
    gallery: leftover,
  }),
);
assert.equal(leftoverReleaseCard?.class, "release");
assert.deepEqual(
  leftoverReleaseCard?.gallery.map((slide) => slide.id),
  ["leftover"],
);
assert.equal(leftoverReleaseCard?.default_offer?.access, "paid");

const freeMusicCard = adaptLegacyCatalogSourceToCard(
  source({
    productKind: "music",
    publicationClass: "release",
    isFree: true,
    price: 0,
    gallery: leftover,
  }),
);
assert.equal(freeMusicCard?.class, "release");
assert.equal(freeMusicCard?.default_offer?.access, "free");
assert.deepEqual(
  freeMusicCard?.gallery.map((slide) => slide.id),
  ["leftover"],
  "free music PDP/catalog still receives gallery slides",
);

const leftoverPostCard = adaptLegacyCatalogSourceToCard(
  source({
    productKind: "audio_post",
    publicationClass: "post",
    isFree: true,
    price: 0,
    gallery: leftover,
  }),
);
assert.equal(leftoverPostCard?.class, "post");
assert.equal(leftoverPostCard?.default_offer, null);
assert.deepEqual(leftoverPostCard?.gallery, []);
assert.deepEqual(leftoverPostCard?.summary, {});

const practiceCard = adaptLegacyCatalogSourceToCard(
  source({
    gallery: [
      { id: "b", image_url: "/b.jpg", position: 1, alt: "B" },
      { id: "a", image_url: "/a.jpg", position: 0, alt: "A" },
    ],
  }),
);
assert.equal(practiceCard?.class, "practice");
assert.deepEqual(
  practiceCard?.gallery.map((slide) => slide.id),
  ["a", "b"],
);
assert.equal(practiceCard?.default_offer?.access, "paid");

const listingRelease = mapCatalogProductToListingItem(
  product({
    id: "music-1",
    productKind: "music",
    publicationClass: "release",
    format: "Музыка",
    gallery: leftover,
  }),
);
assert.equal(listingRelease.class, "release");
assert.deepEqual(
  listingRelease.gallery.map((slide) => slide.id),
  ["leftover"],
  "music listing card receives gallery slides",
);

const listingCourse = mapCatalogProductToListingItem(
  product({
    id: "course-1",
    publicationClass: "course",
    productKind: "practice",
    gallery: [
      { id: "late", image_url: "/late.jpg", position: 2, alt: "" },
      { id: "first", image_url: "/first.jpg", position: 0, alt: "" },
    ],
  }),
);
assert.equal(listingCourse.class, "course");
assert.deepEqual(
  listingCourse.gallery.map((slide) => slide.id),
  ["first", "late"],
);

const musicHeroSlides = buildCoverFirstHeroSlides(
  { displayUrl: "/album-cover.jpg", alt: "Альбом" },
  catalogGalleryForPublication("release", "music", leftover),
);
assert.deepEqual(
  musicHeroSlides.map((slide) => slide.id),
  ["cover", "leftover"],
  "public music PDP keeps cover first, then gallery slides",
);
assert.equal(musicHeroSlides[0]?.src, "/album-cover.jpg");
assert.equal(musicHeroSlides[1]?.src, "/x.jpg");

const practiceHeroSlides = buildCoverFirstHeroSlides(
  { displayUrl: "/practice-cover.jpg", alt: "Практика" },
  catalogGalleryForPublication("practice", "practice", leftover),
);
assert.deepEqual(
  practiceHeroSlides.map((slide) => slide.id),
  ["cover", "leftover"],
  "existing practice gallery still reaches the public hero",
);

console.log("publication-gallery-unit: ok");
