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
  /практики, курса и аудиокниги/,
);

assert.equal(isProductGalleryEligible("practice", "practice"), true);
assert.equal(isProductGalleryEligible("course", "practice"), true);
assert.equal(isProductGalleryEligible("audiobook", "practice"), true);
assert.equal(isProductGalleryEligible("release", "music"), false);
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
assert.match(cabinet, /onDragStart/);
assert.match(cabinet, /onDrop/);
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

console.log("author-product-gallery-unit: ok");
