#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mapPublicRelatedProduct,
  parsePracticeSeoContent,
  withPreservedRelatedListenSlugs,
} from "../src/lib/products/practice-seo-content.ts";
import {
  RELATED_PRODUCT_SEARCH_DEBOUNCE_MS,
  RELATED_PRODUCT_SEARCH_LIMIT,
  RELATED_PRODUCT_SEARCH_MIN_CHARS,
  canAddRelatedProductId,
  parseRelatedProductIdsParam,
  shouldSearchRelatedProducts,
  toRelatedProductOrFilter,
} from "../src/lib/seo/related-product-search.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

assert.equal(RELATED_PRODUCT_SEARCH_MIN_CHARS, 2);
assert.equal(RELATED_PRODUCT_SEARCH_LIMIT, 20);
assert.ok(RELATED_PRODUCT_SEARCH_DEBOUNCE_MS >= 250);
assert.ok(RELATED_PRODUCT_SEARCH_DEBOUNCE_MS <= 400);
assert.equal(shouldSearchRelatedProducts(""), false);
assert.equal(shouldSearchRelatedProducts("а"), false);
assert.equal(shouldSearchRelatedProducts("сон"), true);
assert.match(toRelatedProductOrFilter("сон,практика"), /title\.ilike\.%сон практика%/);
assert.deepEqual(
  parseRelatedProductIdsParam("33333333-3333-4333-8333-333333333333,not-a-uuid"),
  ["33333333-3333-4333-8333-333333333333"],
);

const added = canAddRelatedProductId(
  "33333333-3333-4333-8333-333333333333",
  [],
);
assert.deepEqual(added, {
  ok: true,
  next: ["33333333-3333-4333-8333-333333333333"],
});
assert.equal(
  canAddRelatedProductId("33333333-3333-4333-8333-333333333333", [
    "33333333-3333-4333-8333-333333333333",
  ]).ok,
  false,
);

const omittedListens = parsePracticeSeoContent({
  usage_items: [],
  faq_items: [],
  related_practice_ids: ["33333333-3333-4333-8333-333333333333"],
});
assert.deepEqual(omittedListens?.relatedListenSlugs, []);
assert.deepEqual(
  withPreservedRelatedListenSlugs(omittedListens, {
    usageItems: [],
    faqItems: [],
    relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
    relatedListenSlugs: ["meditatsiya-na-dengi-slushat-onlayn-besplatno"],
  }).relatedListenSlugs,
  ["meditatsiya-na-dengi-slushat-onlayn-besplatno"],
);

const published = mapPublicRelatedProduct({
  id: "33333333-3333-4333-8333-333333333333",
  title: "Лавандовый сон",
  slug: "lavandovyy-son",
  format: "Медитация",
  duration_minutes: 12,
  cover_url: "https://cdn.example/cover.jpg",
  cover_image: { v: 1 },
  updated_at: "2026-08-29T00:00:00.000Z",
  authors: { slug: "sergey", name: "Сергей" },
});
assert.deepEqual(published, {
  practiceId: "33333333-3333-4333-8333-333333333333",
  title: "Лавандовый сон",
  href: "/practice/sergey/lavandovyy-son",
  authorName: "Сергей",
  formatLabel: "Медитация",
  durationLabel: "12 мин",
  coverUrl: "https://cdn.example/cover.jpg",
  coverImage: { v: 1 },
  updatedAt: "2026-08-29T00:00:00.000Z",
});
assert.equal(
  mapPublicRelatedProduct({
    id: "33333333-3333-4333-8333-333333333333",
    title: "Скрытый продукт",
    slug: "hidden",
    authors: null,
  }),
  null,
);

const seoSection = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(seoSection, /Найти продукт/);
assert.match(seoSection, /Введите название или слово из названия/);
assert.match(seoSection, /Связанные продукты/);
assert.doesNotMatch(seoSection, /Связанные страницы «Слушать»/);
assert.doesNotMatch(seoSection, /listen-options/);
assert.doesNotMatch(seoSection, /relatedListenSlugs/);
assert.match(seoSection, /RELATED_PRODUCT_SEARCH_DEBOUNCE_MS/);
assert.match(seoSection, /shouldSearchRelatedProducts\(relatedProductQuery\)/);

const publicSections = read("src/components/products/PracticeSeoContentSections.tsx");
assert.match(publicSections, /RelatedProductLinkCard/);
assert.match(publicSections, /Связанные продукты/);
assert.doesNotMatch(publicSections, /relatedListens/);
assert.doesNotMatch(publicSections, /Связанные страницы/);

const card = read("src/components/products/RelatedProductLinkCard.tsx");
assert.match(card, /<Link/);
assert.match(card, /ProductCoverThumbnail/);
assert.match(card, /formatLabel/);
assert.match(card, /product\.title/);
assert.match(card, /authorName/);
assert.doesNotMatch(card, /Слушать|PlayIcon|aria-label=\{`Слушать/);

const loader = read("src/lib/products/practice-seo-content.ts");
assert.match(loader, /loadAuthorPracticeSeoContent[\s\S]*practice_related_listens/);
assert.match(loader, /relatedListens: \[\]/);
assert.match(loader, /catalog_visibility", "listed"/);
assert.match(loader, /is_catalog_listed", true/);
assert.match(loader, /status", "published"/);
assert.match(loader, /cover_url, cover_image/);
assert.match(loader, /duration_minutes/);
assert.match(loader, /authors!practices_author_id_fkey\(slug, name\)/);

const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /withPreservedRelatedListenSlugs/);

const searchRoute = read("src/app/api/author/seo/related-product-options/route.ts");
assert.match(searchRoute, /shouldSearchRelatedProducts/);
assert.match(searchRoute, /RELATED_PRODUCT_SEARCH_LIMIT/);
assert.match(searchRoute, /toRelatedProductOrFilter/);
assert.doesNotMatch(searchRoute, /author_id.*searchParams/);

assert.equal(
  existsSync(path.join(root, "src/app/api/author/seo/listen-options/route.ts")),
  false,
);

const prompt = read("src/lib/seo/product-autofill/prompt.ts");
assert.match(prompt, /Не генерируй связанные продукты и URL/);
assert.doesNotMatch(prompt, /relatedListen|related_listen|слушайте статьи|URL статьи/i);

console.log("related-product-seo-unit: ok");
