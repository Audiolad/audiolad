#!/usr/bin/env node
/**
 * Music Product Gallery: release/music reuses the existing gallery,
 * post stays excluded, track covers and licensing stay untouched.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";
import { mapCatalogProductToListingItem } from "../src/lib/catalog/listing.ts";
import { CATALOG_GALLERY_MAX_SLIDES, normalizeCatalogGallery } from "../src/lib/catalog/gallery.ts";
import { catalogGalleryForPublication } from "../src/lib/catalog/publication-gallery.ts";
import { buildCoverFirstHeroSlides } from "../src/lib/catalog/product-hero-gallery.ts";
import {
  isProductGalleryClass,
  isProductGalleryEligible,
} from "../src/lib/author-products/publication-class.ts";
import { PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const slides = [
  { id: "g2", image_url: "/g2.jpg", position: 1, alt: "two" },
  { id: "g1", image_url: "/g1.jpg", position: 0, alt: "one" },
];

assert.equal(CATALOG_GALLERY_MAX_SLIDES, 30, "gallery limit stays 30");
assert.equal(
  normalizeCatalogGallery(
    Array.from({ length: 35 }, (_, index) => ({
      id: `s-${index}`,
      image_url: `/s-${index}.jpg`,
      position: index,
      alt: "",
    })),
  ).length,
  30,
  "normalize still caps at 30",
);

assert.equal(isProductGalleryClass("practice"), true);
assert.equal(isProductGalleryClass("course"), true);
assert.equal(isProductGalleryClass("audiobook"), true);
assert.equal(isProductGalleryClass("release"), true);
assert.equal(isProductGalleryClass("post"), false);

assert.equal(isProductGalleryEligible("practice", "practice"), true);
assert.equal(isProductGalleryEligible("course", "practice"), true);
assert.equal(isProductGalleryEligible("audiobook", "practice"), true);
assert.equal(isProductGalleryEligible("release", PRODUCT_KIND.MUSIC), true);
assert.equal(isProductGalleryEligible("post", PRODUCT_KIND.AUDIO_POST), false);
assert.equal(isProductGalleryEligible(null, PRODUCT_KIND.MUSIC), true);
assert.equal(isProductGalleryEligible(null, PRODUCT_KIND.AUDIO_POST), false);

const musicSlides = catalogGalleryForPublication("release", "music", slides);
assert.deepEqual(
  musicSlides.map((slide) => slide.id),
  ["g1", "g2"],
  "music gallery reaches catalog DTO",
);

assert.deepEqual(
  catalogGalleryForPublication("post", "audio_post", slides),
  [],
  "audio post stays ineligible",
);

assert.deepEqual(
  catalogGalleryForPublication("practice", "practice", slides).map((slide) => slide.id),
  ["g1", "g2"],
  "existing practice galleries still attach",
);
assert.deepEqual(
  catalogGalleryForPublication("course", "practice", slides).map((slide) => slide.id),
  ["g1", "g2"],
  "existing course galleries still attach",
);
assert.deepEqual(
  catalogGalleryForPublication("audiobook", "practice", slides).map((slide) => slide.id),
  ["g1", "g2"],
  "existing audiobook galleries still attach",
);

function musicSource(overrides = {}) {
  return {
    id: "music-1",
    slug: "album",
    title: "Альбом",
    subtitle: null,
    productKind: "music",
    publicationClass: "release",
    price: 990,
    isFree: false,
    coverUrl: "/album.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/album",
    publishedAt: "2026-08-01T00:00:00.000Z",
    durationSeconds: 1800,
    gallery: slides,
    ...overrides,
  };
}

const musicCard = adaptLegacyCatalogSourceToCard(musicSource());
assert.equal(musicCard?.class, "release");
assert.equal(musicCard?.default_offer?.access, "paid");
assert.deepEqual(
  musicCard?.gallery.map((slide) => slide.id),
  ["g1", "g2"],
  "paid music catalog card receives gallery slides",
);

const freeMusicCard = adaptLegacyCatalogSourceToCard(
  musicSource({
    id: "music-free",
    slug: "free-track",
    title: "Трек",
    href: "/practice/anna/free-track",
    price: 0,
    isFree: true,
    coverUrl: "/track.jpg",
  }),
);
assert.equal(freeMusicCard?.class, "release");
assert.equal(freeMusicCard?.default_offer?.access, "free");
assert.deepEqual(
  freeMusicCard?.gallery.map((slide) => slide.id),
  ["g1", "g2"],
  "free music catalog card receives gallery slides",
);

const listing = mapCatalogProductToListingItem({
  id: "music-1",
  authorId: "a1",
  title: "Альбом",
  slug: "album",
  subtitle: null,
  description: null,
  format: "Музыка",
  productKind: "music",
  publicationClass: "release",
  price: 990,
  isFree: false,
  coverUrl: "/album.jpg",
  authorName: "Анна",
  authorSlug: "anna",
  href: "/practice/anna/album",
  meta: null,
  statsLabel: "30 мин",
  productTypeLabel: "Музыка",
  priceLabel: "990 ₽",
  sortTimestamp: 1_700_000_000_000,
  audioCount: 3,
  durationSeconds: 1800,
  publishedAt: "2026-08-01T00:00:00.000Z",
  gallery: slides,
});
assert.equal(listing.class, "release");
assert.deepEqual(
  listing.gallery.map((slide) => slide.id),
  ["g1", "g2"],
);

const hero = buildCoverFirstHeroSlides(
  { displayUrl: "/album.jpg", alt: "Альбом" },
  musicSlides,
);
assert.deepEqual(
  hero.map((slide) => slide.id),
  ["cover", "g1", "g2"],
  "public music PDP is cover + gallery, not track covers",
);
assert.equal(hero[0]?.src, "/album.jpg");
assert.equal(hero[1]?.src, "/g1.jpg");
assert.equal(hero[2]?.src, "/g2.jpg");

const helpers = read("src/lib/author-products/publication-class.ts");
assert.match(helpers, /isProductPublicationClass\(publicationClass\)/);
assert.match(helpers, /publicationClass === "release"/);
assert.match(helpers, /Post \(AudioPost\) is never eligible/);

const galleryApi = read("src/app/api/author/products/[id]/gallery/route.ts");
const reorderApi = read("src/app/api/author/products/[id]/gallery/reorder/route.ts");
const slideApi = read("src/app/api/author/products/[id]/gallery/[slideId]/route.ts");
for (const [name, source] of [
  ["GET/POST collection", galleryApi],
  ["PATCH reorder", reorderApi],
  ["PATCH/DELETE slide", slideApi],
]) {
  assert.match(
    source,
    /assertAuthorProductGalleryEligible/,
    `${name} still uses shared author eligibility`,
  );
  assert.match(source, /gallery_not_supported/);
}

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /isProductGalleryEligible\(form\.publicationClass, form\.productKind\)/);
assert.match(form, /AuthorProductGallery/);
assert.match(form, /shouldShowSharedTrackCoverToggle/);

const authorGallery = read("src/components/author-dashboard/AuthorProductGallery.tsx");
assert.match(authorGallery, /Галерея продукта/);
assert.doesNotMatch(
  authorGallery,
  /audio_items|use_shared_cover|track cover/,
  "cabinet gallery UI does not read track covers",
);

const catalogGallery = read("src/lib/catalog/publication-gallery.ts");
assert.match(catalogGallery, /isProductGalleryEligible/);
assert.doesNotMatch(
  catalogGallery,
  /audio_items|use_shared_cover|track cover/,
  "catalog gallery is not generated from track covers",
);

const pdp = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");
assert.match(
  pdp,
  /catalogGalleryForPublication\(\s*practice\.publication_class,\s*practice\.product_kind,/,
  "music PDP uses the shared catalog gallery helper",
);
assert.match(pdp, /gallerySlides/);

const releaseCard = read("src/components/catalog/cards/ReleaseCatalogCard.tsx");
assert.match(
  releaseCard,
  /CatalogCardShell/,
  "music catalog card reuses the existing shell/gallery",
);
assert.doesNotMatch(releaseCard, /MusicGallery|ReleaseGallery/);

const productKind = read("src/lib/author-products/product-kind.ts");
assert.match(productKind, /MUSIC: "music"/);
assert.match(productKind, /MUSIC_USAGE_PERMISSION/);
assert.match(productKind, /PLATFORM_REUSE_ALLOWED/);
assert.equal(PRODUCT_KIND.MUSIC, "music");

const galleryStore = read("src/lib/author-products/gallery.ts");
assert.doesNotMatch(galleryStore, /music_usage_permission|PLATFORM_REUSE/);
assert.doesNotMatch(galleryStore, /PracticeGallery|CourseGallery|MusicGallery/);

console.log("music-product-gallery-unit: ok");
