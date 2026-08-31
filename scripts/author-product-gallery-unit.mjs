#!/usr/bin/env node
/**
 * Phase 1B author Product Gallery: cabinet, APIs, eligibility, no #74 leftovers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getAuthorGalleryErrorMessage } from "../src/lib/author-products/gallery-shared.ts";
import { CATALOG_GALLERY_MAX_SLIDES } from "../src/lib/catalog/gallery.ts";
import {
  isProductGalleryEligible,
  resolveCreateClassification,
  resolvePublicationClass,
} from "../src/lib/author-products/publication-class.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

assert.equal(CATALOG_GALLERY_MAX_SLIDES, 30);
assert.equal(
  getAuthorGalleryErrorMessage("gallery_limit_exceeded"),
  "Можно добавить не больше 30 слайдов.",
);
assert.match(
  getAuthorGalleryErrorMessage("invalid_file_type"),
  /JPG, PNG или WebP/,
);
assert.match(
  getAuthorGalleryErrorMessage("invalid_aspect_ratio"),
  /квадратное изображение 1:1/,
);
assert.match(getAuthorGalleryErrorMessage("invalid_file_size"), /3 МБ/);
assert.match(
  getAuthorGalleryErrorMessage("gallery_not_supported"),
  /практики, курса, аудиокниги и музыки/,
);

assert.equal(isProductGalleryEligible("practice", "practice"), true);
assert.equal(isProductGalleryEligible("course", "practice"), true);
assert.equal(isProductGalleryEligible("audiobook", "practice"), true);
assert.equal(isProductGalleryEligible("release", "music"), true);
assert.equal(isProductGalleryEligible("post", "audio_post"), false);

const courseCreate = resolveCreateClassification({
  publicationClass: "course",
});
assert.equal(courseCreate.ok, true);
assert.equal(courseCreate.value.publicationClass, "course");
assert.equal(courseCreate.value.productKind, "practice");
assert.equal(resolvePublicationClass("course", "practice"), "course");

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AuthorProductGallery/, "product form hosts gallery section");
assert.match(form, /isProductGalleryEligible/, "cabinet uses shared eligibility");
assert.match(form, /initialProduct\?\.gallery_slides/);
assert.doesNotMatch(form, /Gallery editor/);
assert.doesNotMatch(form, /useEffect\([\s\S]{0,200}\/gallery/);

const cabinet = read("src/components/author-dashboard/AuthorProductGallery.tsx");
assert.match(cabinet, /Галерея продукта/);
assert.match(cabinet, /data-author-product-gallery/);
assert.match(cabinet, /Добавить слайд/);
assert.match(cabinet, /Заменить/);
assert.match(cabinet, /Удалить/);
assert.match(cabinet, /draggable/);
assert.match(
  cabinet,
  /<ResponsiveCoverImage[\s\S]*?draggable=\{false\}/,
  "SquarePreview must disable native drag on ResponsiveCoverImage",
);
assert.match(
  cabinet,
  /<img[\s\S]*?draggable=\{false\}/,
  "SquarePreview fallback img must set draggable={false}",
);
assert.match(cabinet, /onDragStart/);
assert.match(cabinet, /onDrop/);
assert.match(cabinet, /draggingIdRef/);
assert.match(
  cabinet,
  /draggingIdRef\.current = slide\.id/,
  "dragstart stores slide id in a ref for synchronous drop",
);
assert.match(
  cabinet,
  /const fromId = draggingIdRef\.current \?\? draggingId/,
  "drop must read draggingIdRef / draggingId, not only getData",
);
assert.doesNotMatch(
  cabinet,
  /const fromId = event\.dataTransfer\.getData/,
  "drop must not rely on dataTransfer.getData as the slide id source",
);
assert.match(cabinet, /\/gallery\/reorder/);
assert.match(cabinet, /slides: nextSlides.map/);
assert.match(cabinet, /validateGallerySlideFile/);
assert.match(cabinet, /method: "POST"/);
assert.match(cabinet, /method: "PATCH"/);
assert.match(cabinet, /method: "DELETE"/);
assert.match(cabinet, /initialSlides/);
assert.doesNotMatch(cabinet, /useEffect/);
assert.doesNotMatch(cabinet, /dnd-kit|react-beautiful-dnd|@hello-pangea\/dnd/);
assert.doesNotMatch(
  cabinet,
  /label="Обложка"|coverUrl|coverImage|coverVersion/,
  "gallery is extra slides only, not a second cover editor",
);

const validation = read("src/lib/author-products/gallery-validation-client.ts");
assert.match(validation, /1:1/);
assert.match(validation, /MAX_COVER_BYTES/);
assert.match(validation, /image\/jpeg/);
assert.match(validation, /image\/png/);
assert.match(validation, /image\/webp/);

const helpers = read("src/lib/author-products/publication-class.ts");
assert.match(helpers, /export function isProductGalleryClass/);
assert.match(helpers, /export function isProductGalleryEligible/);
assert.match(helpers, /resolvePublicationClass/);

const galleryApi = read("src/app/api/author/products/[id]/gallery/route.ts");
assert.match(galleryApi, /export async function GET/);
assert.match(galleryApi, /export async function POST/);
assert.match(galleryApi, /requirePracticeMutationAccess/);
assert.match(galleryApi, /requirePracticeAccess/);
assert.match(galleryApi, /assertAuthorProductGalleryEligible/);
assert.match(galleryApi, /uploadOptimizedImageSet/);
assert.match(galleryApi, /profile: "product-gallery"/);
assert.match(galleryApi, /PRACTICE_COVERS_BUCKET/);
assert.match(galleryApi, /CATALOG_GALLERY_MAX_SLIDES/);
assert.match(galleryApi, /gallery_not_supported/);
assert.doesNotMatch(
  galleryApi,
  /export async function PATCH/,
  "collection route must not keep PATCH { order }",
);
assert.doesNotMatch(galleryApi, /body\.order/);

const reorderApi = read(
  "src/app/api/author/products/[id]/gallery/reorder/route.ts",
);
assert.match(reorderApi, /export async function PATCH/);
assert.match(reorderApi, /slides/);
assert.match(reorderApi, /position/);
assert.match(reorderApi, /requirePracticeMutationAccess/);
assert.match(reorderApi, /assertAuthorProductGalleryEligible/);
assert.match(reorderApi, /gallery_not_supported/);
assert.doesNotMatch(reorderApi, /order:\s*string/);

const slideApi = read(
  "src/app/api/author/products/[id]/gallery/[slideId]/route.ts",
);
assert.match(slideApi, /export async function PATCH/);
assert.match(slideApi, /export async function DELETE/);
assert.match(slideApi, /replaceAuthorGallerySlideImage/);
assert.match(slideApi, /deleteAuthorGallerySlide/);
assert.match(slideApi, /requirePracticeMutationAccess/);
assert.match(slideApi, /assertAuthorProductGalleryEligible/);
assert.match(slideApi, /context: \{ practiceId: id, slideId \}/);

const store = read("src/lib/author-products/gallery.ts");
assert.match(store, /PUBLICATION_GALLERY_TABLE/);
assert.match(store, /buildGallerySlideReplacePatch/);
assert.match(store, /validateGalleryReorderBatch/);
assert.match(store, /isProductGalleryEligible/);
assert.doesNotMatch(store, /PracticeGallery|CourseGallery/);

const catalog = read("src/lib/products/catalog.ts");
assert.match(catalog, /loadPublicationGalleriesByIds/);
assert.match(catalog, /isProductGalleryEligible/);
assert.match(catalog, /gallery: isProductGalleryEligible/);

const adapter = read("src/lib/catalog/legacy-adapter.ts");
assert.match(adapter, /isProductGalleryClass/);
assert.match(adapter, /normalizeCatalogGallery\(source\.gallery\)/);

assert.doesNotMatch(
  read("src/lib/catalog/dto.ts"),
  /PracticeGallery|CourseGallery|NewProduct/,
);

const listing = read("src/lib/catalog/listing.ts");
assert.match(listing, /gallery: product\.gallery \?\? \[\]/);
assert.match(listing, /resolvePublicationClass/);

assert.match(
  helpers,
  /publicationClass === "release"/,
  "release is explicitly gallery-eligible",
);
assert.match(
  helpers,
  /Post \(AudioPost\) is never eligible/,
  "post remains excluded from gallery",
);
assert.doesNotMatch(
  helpers,
  /Release \(Music\) and post/,
  "music is no longer grouped with post as ineligible",
);

const galleryStore = read("src/lib/author-products/gallery.ts");
assert.doesNotMatch(
  galleryStore,
  /audio_items|track cover|cover_url.*track|use_shared_cover/,
  "author gallery store does not mix track covers into product gallery",
);
assert.doesNotMatch(
  galleryStore,
  /music_usage_permission|PLATFORM_REUSE|PRODUCT_KIND\.MUSIC/,
  "author gallery store does not change music licensing",
);

const publicationGallery = read("src/lib/catalog/publication-gallery.ts");
assert.doesNotMatch(
  publicationGallery,
  /audio_items|use_shared_cover|track cover/,
  "catalog gallery attach does not generate slides from track covers",
);

const pdp = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");
assert.match(pdp, /catalogGalleryForPublication/);
assert.match(
  pdp,
  /catalogGalleryForPublication\(\s*practice\.publication_class,\s*practice\.product_kind,/,
  "public PDP uses shared gallery eligibility for every class including music",
);
assert.match(pdp, /PracticeProductHero|gallerySlides/);

const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(
  formSource,
  /isProductGalleryEligible\(form\.publicationClass, form\.productKind\)/,
  "cabinet gallery gate is the shared helper, so music sees the section",
);
assert.match(
  formSource,
  /shouldShowSharedTrackCoverToggle/,
  "music track cover toggle stays a separate section",
);

const productKind = read("src/lib/author-products/product-kind.ts");
assert.match(productKind, /MUSIC: "music"/);
assert.match(productKind, /music_usage_permission|MUSIC_USAGE_PERMISSION/);

console.log("author-product-gallery-unit: ok");
