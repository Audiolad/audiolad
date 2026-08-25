#!/usr/bin/env node
/**
 * Phase 1A author gallery: cabinet section, APIs, validation, no new class.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getAuthorGalleryErrorMessage } from "../src/lib/author-products/gallery-shared.ts";
import { CATALOG_GALLERY_MAX_SLIDES } from "../src/lib/catalog/gallery.ts";

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

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AuthorProductGallery/, "product form hosts gallery section");

const cabinet = read("src/components/author-dashboard/AuthorProductGallery.tsx");
assert.match(cabinet, /Галерея продукта/);
assert.match(cabinet, /data-author-product-gallery/);
assert.match(cabinet, /Добавить слайд/);
assert.match(cabinet, /Выше/);
assert.match(cabinet, /Ниже/);
assert.match(cabinet, /Удалить/);
assert.match(cabinet, /Обложка/);
assert.match(cabinet, /validateGallerySlideFile/);
assert.match(cabinet, /\/api\/author\/products\/\$\{id\}\/gallery/);
assert.match(cabinet, /method: "PATCH"/);
assert.match(cabinet, /method: "DELETE"/);
assert.doesNotMatch(cabinet, /dnd-kit|react-beautiful-dnd|@hello-pangea\/dnd/);

const validation = read("src/lib/author-products/gallery-validation-client.ts");
assert.match(validation, /1:1/);
assert.match(validation, /MAX_COVER_BYTES/);
assert.match(validation, /image\/jpeg/);
assert.match(validation, /image\/png/);
assert.match(validation, /image\/webp/);

const galleryApi = read("src/app/api/author/products/[id]/gallery/route.ts");
assert.match(galleryApi, /export async function GET/);
assert.match(galleryApi, /export async function POST/);
assert.match(galleryApi, /export async function PATCH/);
assert.match(galleryApi, /requirePracticeMutationAccess/);
assert.match(galleryApi, /requirePracticeAccess/);
assert.match(galleryApi, /uploadOptimizedImageSet/);
assert.match(galleryApi, /profile: "product-gallery"/);
assert.match(galleryApi, /PRACTICE_COVERS_BUCKET/);
assert.match(galleryApi, /CATALOG_GALLERY_MAX_SLIDES/);

const deleteApi = read(
  "src/app/api/author/products/[id]/gallery/[slideId]/route.ts",
);
assert.match(deleteApi, /export async function DELETE/);
assert.match(deleteApi, /deleteAuthorGallerySlide/);
assert.match(deleteApi, /requirePracticeMutationAccess/);

const store = read("src/lib/author-products/gallery.ts");
assert.match(store, /PUBLICATION_GALLERY_TABLE/);
assert.doesNotMatch(store, /PracticeGallery|CourseGallery/);

const publicationStore = read("src/lib/catalog/publication-gallery.ts");
assert.match(publicationStore, /publication_gallery_slides/);

const catalog = read("src/lib/products/catalog.ts");
assert.match(catalog, /loadPublicationGalleriesByIds/);
assert.match(catalog, /gallery: galleriesByPublication/);

const adapter = read("src/lib/catalog/legacy-adapter.ts");
assert.match(adapter, /normalizeCatalogGallery\(source\.gallery\)/);
assert.doesNotMatch(adapter, /gallery:\s*\[\]/);

assert.doesNotMatch(
  read("src/lib/catalog/dto.ts"),
  /PracticeGallery|CourseGallery|NewProduct/,
);

console.log("author-product-gallery-unit: ok");
