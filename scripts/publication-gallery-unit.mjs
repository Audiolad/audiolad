#!/usr/bin/env node
/**
 * Phase 1A publication gallery: stored rows → CatalogSlide[], cap 30.
 * Adapter must not invent class/offer/summary from slides.
 */
import assert from "node:assert/strict";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";
import { CATALOG_GALLERY_MAX_SLIDES } from "../src/lib/catalog/gallery.ts";
import {
  groupPublicationGalleryRowsByPublicationId,
  mapPublicationGalleryRowsToCatalogSlides,
} from "../src/lib/catalog/publication-gallery.ts";

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

assert.equal(CATALOG_GALLERY_MAX_SLIDES, 30);

assert.deepEqual(
  mapPublicationGalleryRowsToCatalogSlides([]),
  [],
  "empty rows → empty gallery",
);

const one = mapPublicationGalleryRowsToCatalogSlides([
  {
    id: "s1",
    publication_id: "pub-1",
    image_url: "/one.jpg",
    position: 0,
    alt: "Один",
  },
]);
assert.equal(one.length, 1);
assert.equal(one[0].id, "s1");
assert.equal(one[0].image_url, "/one.jpg");
assert.equal(one[0].position, 0);
assert.equal(one[0].alt, "Один");

const several = mapPublicationGalleryRowsToCatalogSlides([
  { id: "c", publication_id: "pub-1", image_url: "/c.jpg", position: 2, alt: "C" },
  { id: "a", publication_id: "pub-1", image_url: "/a.jpg", position: 0, alt: "A" },
  { id: "skip", publication_id: "pub-1", image_url: "  ", position: 1, alt: "skip" },
  { id: "b", publication_id: "pub-1", image_url: "/b.jpg", position: 1, alt: "B" },
]);
assert.deepEqual(
  several.map((slide) => slide.id),
  ["a", "b", "c"],
  "several slides sort by position and skip empty urls",
);

const overCap = mapPublicationGalleryRowsToCatalogSlides(
  Array.from({ length: 40 }, (_, index) => ({
    id: `row-${String(index).padStart(2, "0")}`,
    publication_id: "pub-1",
    image_url: `/row-${index}.jpg`,
    position: index,
    alt: null,
  })),
);
assert.equal(overCap.length, 30, "row mapping caps at 30");

const grouped = groupPublicationGalleryRowsByPublicationId([
  { id: "p1s1", publication_id: "pub-1", image_url: "/1.jpg", position: 0, alt: null },
  { id: "p2s1", publication_id: "pub-2", image_url: "/2.jpg", position: 0, alt: "Two" },
  { id: "p1s2", publication_id: "pub-1", image_url: "/1b.jpg", position: 1, alt: null },
]);
assert.equal(grouped.get("pub-1")?.length, 2);
assert.equal(grouped.get("pub-2")?.[0].alt, "Two");

const postCard = adaptLegacyCatalogSourceToCard(
  source({
    productKind: "audio_post",
    isFree: true,
    price: 0,
    gallery: mapPublicationGalleryRowsToCatalogSlides([
      { id: "ps", publication_id: "pub-1", image_url: "/post.jpg", position: 0, alt: "" },
    ]),
  }),
);
assert.equal(postCard?.class, "post");
assert.equal(postCard?.default_offer, null, "slides do not invent an offer");
assert.equal(postCard?.gallery.length, 1);
assert.deepEqual(postCard?.summary, {});

const paidUnchanged = adaptLegacyCatalogSourceToCard(
  source({
    gallery: one,
  }),
);
assert.equal(paidUnchanged?.class, "practice");
assert.equal(paidUnchanged?.default_offer?.access, "paid");
assert.equal(paidUnchanged?.default_offer?.price?.amount_minor, 49000);

console.log("publication-gallery-unit: ok");
