/**
 * Mini-app galleries: safe catalog/VK DTOs, swipe vs tap, and detail reuse.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildCatalogCardGalleryPages,
  CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX,
  galleryPointerOpensProduct,
  shouldRenderCatalogCardGallery,
} from "../src/lib/gallery/catalog-card-gallery.ts";
import { listMaxPublishedCatalog } from "../src/lib/max/catalog.ts";
import { readMaxCatalogProduct } from "../src/lib/max/catalog-product.ts";
import { readVkProductView, toVkProductView } from "../src/lib/vk/product-view.ts";

const SECRET = "practices/secret-id/gallery/object.jpg";

function catalogProduct(extras = {}) {
  return {
    authorSlug: "author",
    slug: "sleep",
    title: "Сон",
    subtitle: null,
    coverUrl: "https://cdn.example.test/cover.webp",
    authorName: "Автор",
    formatLabel: "Практика",
    priceLabel: "Бесплатно",
    isFree: true,
    ...extras,
  };
}

const parsed = readMaxCatalogProduct(catalogProduct({
  practiceId: "practice-secret",
  storage_path: SECRET,
  gallery: [{
    id: "slide-1",
    image_url: "https://cdn.example.test/slide.webp",
    alt: "Кадр",
    position: 2,
    practice_id: "practice-secret",
    storage_path: SECRET,
    image_manifest: { secret: true },
    publication_id: "publication-secret",
  }],
}));
assert.ok(parsed);
assert.equal("practiceId" in parsed, false);
assert.equal("storage_path" in parsed, false);
assert.deepEqual(parsed.gallery, [{
  id: "slide-1",
  image_url: "https://cdn.example.test/slide.webp",
  alt: "Кадр",
  position: 2,
}]);
assert.deepEqual(Object.keys(parsed.gallery[0]).sort(), ["alt", "id", "image_url", "position"]);
assert.equal(JSON.stringify(parsed).includes(SECRET), false);
assert.equal(JSON.stringify(parsed).includes("practice-secret"), false);
assert.equal(JSON.stringify(parsed).includes("image_manifest"), false);

assert.deepEqual(readMaxCatalogProduct(catalogProduct()).gallery, []);
assert.equal(readMaxCatalogProduct(catalogProduct({ gallery: { storage_path: SECRET } })), null);

const coverOnly = buildCatalogCardGalleryPages({
  coverUrl: "https://cdn.example.test/cover.webp",
  gallery: [],
});
assert.equal(coverOnly.length, 1);
assert.equal(coverOnly[0].id, "cover");
assert.equal(shouldRenderCatalogCardGallery(coverOnly.length), false);

const withSlides = buildCatalogCardGalleryPages({
  coverUrl: "https://cdn.example.test/cover.webp",
  gallery: [
    {
      id: "later",
      image_url: "https://cdn.example.test/b.webp",
      alt: "Второй",
      position: 2,
    },
    {
      id: "sooner",
      image_url: "https://cdn.example.test/a.webp",
      alt: "Первый",
      position: 1,
    },
  ],
});
assert.deepEqual(withSlides.map((page) => page.id), ["cover", "sooner", "later"]);
assert.equal(shouldRenderCatalogCardGallery(withSlides.length), true);
assert.equal(shouldRenderCatalogCardGallery(1), false);
assert.equal(shouldRenderCatalogCardGallery(0), false);
assert.equal(galleryPointerOpensProduct(0, 0), true);
assert.equal(galleryPointerOpensProduct(CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX - 1, 0), true);
assert.equal(galleryPointerOpensProduct(CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX, 0), false);
assert.equal(galleryPointerOpensProduct(0, CATALOG_CARD_GALLERY_DRAG_THRESHOLD_PX), false);

const card = readFileSync(join(process.cwd(), "src/components/max/MaxCatalogProductCard.tsx"), "utf8");
const snap = readFileSync(join(process.cwd(), "src/components/gallery/HorizontalSnapGallery.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const noGalleryBranch = card.slice(card.indexOf("if (!showGallery)"), card.indexOf("return (\n    <div className={CARD_CLASS}>"));
assert.match(noGalleryBranch, /<button/);
assert.match(noGalleryBranch, /onSelectProduct\(product\)/);
assert.match(noGalleryBranch, /h-full w-full object-cover/);
assert.doesNotMatch(noGalleryBranch, /HorizontalSnapGallery|data-mini-app-snap-gallery/);
assert.match(card, /shouldRenderCatalogCardGallery\(pages\.length\)/);
assert.match(snap, /galleryPointerOpensProduct/);
assert.match(snap, /data-mini-app-snap-gallery-prev/);
assert.match(snap, /data-mini-app-snap-gallery-next/);
assert.match(snap, /data-mini-app-snap-gallery-dots/);
assert.match(snap, /data-mini-app-snap-gallery-counter/);
assert.match(snap, /event\.pointerType === "touch"/);
assert.match(
  css,
  /\.mini-app-snap-gallery\s*\{[^}]*overscroll-behavior-x:\s*contain;[^}]*touch-action:\s*pan-x pan-y;/,
);

const listed = await listMaxPublishedCatalog({
  getServiceClient: () => ({}),
  getCatalogProducts: async () => [{
    id: "product-secret",
    authorId: "author-secret",
    authorSlug: "author",
    slug: "sleep",
    title: "Сон",
    subtitle: null,
    coverUrl: "https://cdn.example.test/cover.webp",
    authorName: "Автор",
    productTypeLabel: "Практика",
    priceLabel: "Бесплатно",
    isFree: true,
    description: "secret description",
    audio_path: SECRET,
    gallery: [{
      id: "slide-1",
      image_url: "https://cdn.example.test/slide.webp",
      alt: "Кадр",
      position: 1,
      practice_id: "practice-secret",
      storage_path: SECRET,
      image_manifest: { secret: true },
      publication_id: "publication-secret",
    }],
  }],
});
assert.equal(listed.ok, true);
assert.deepEqual(listed.items[0].gallery, [{
  id: "slide-1",
  image_url: "https://cdn.example.test/slide.webp",
  alt: "Кадр",
  position: 1,
}]);
assert.equal(JSON.stringify(listed.items[0]).includes(SECRET), false);
assert.equal(JSON.stringify(listed.items[0]).includes("practice-secret"), false);
assert.equal(JSON.stringify(listed.items[0]).includes("image_manifest"), false);
assert.equal("description" in listed.items[0], false);

const vkBase = {
  authorSlug: "author",
  productSlug: "sleep",
  title: "Сон",
  subtitle: null,
  formatLabel: "Практика",
  coverUrl: "https://cdn.example.test/cover.webp",
  metaLine: "Автор",
  priceLabel: "490 ₽",
  isFree: false,
  appreciation: { authorName: "Автор" },
  contents: [],
};

const vkView = toVkProductView({
  ...vkBase,
  practiceId: "practice-secret",
  gallery: [{
    id: "slide-1",
    image_url: "https://cdn.example.test/slide.webp",
    alt: "Кадр",
    position: 4,
    storage_path: SECRET,
    practice_id: "practice-secret",
    image_manifest: { secret: true },
  }],
});
assert.deepEqual(vkView.gallery, [{
  id: "slide-1",
  image_url: "https://cdn.example.test/slide.webp",
  alt: "Кадр",
}]);
assert.equal(JSON.stringify(vkView).includes(SECRET), false);
assert.equal(JSON.stringify(vkView).includes("practiceId"), false);
assert.deepEqual(readVkProductView(vkView)?.gallery, vkView.gallery);
assert.equal(readVkProductView({
  ...vkView,
  gallery: [{
    id: "slide-1",
    image_url: "https://cdn.example.test/slide.webp",
    alt: "Кадр",
    storage_path: SECRET,
  }],
}), null);
assert.deepEqual(toVkProductView(vkBase).gallery, []);

const screen = readFileSync(join(process.cwd(), "src/components/vk/VkMiniAppScreen.tsx"), "utf8");
const maxDetail = readFileSync(join(process.cwd(), "src/components/max/MaxProductDetailView.tsx"), "utf8");
assert.match(screen, /PracticeHeroGallery/);
assert.match(screen, /vkHeroSlides\(product\.gallery\)/);
assert.match(screen, /data-vk-product-gallery/);
assert.doesNotMatch(screen, /ProductCoverThumbnail/);
assert.match(maxDetail, /PracticeHeroGallery/);
assert.match(maxDetail, /product\.gallery/);
const galleryAt = screen.indexOf("data-vk-product-gallery");
const buyAt = screen.indexOf("data-vk-buy");
const appreciationAt = screen.indexOf("<VkAuthorAppreciation");
const footerAt = screen.indexOf('VkPublicFooter variant="product"');
assert.ok(galleryAt >= 0 && buyAt > galleryAt, "VK gallery stays above the buy CTA");
assert.ok(appreciationAt > buyAt, "VK appreciation stays after purchase");
assert.ok(footerAt > appreciationAt, "VK product footer stays after appreciation");
assert.match(screen, /\/api\/vk\/playback\/session/);
assert.match(screen, /\/api\/vk\/playback\/audio/);
assert.match(screen, /openDeeplink|productToken/);

console.log("mini-app-gallery-unit: ok");
