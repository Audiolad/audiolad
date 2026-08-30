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
  AUTHOR_RECOMMENDATIONS_LIMIT_COPY,
  MAX_AUTHOR_RECOMMENDATIONS,
  RELATED_PRODUCT_DEFAULT_AUTHOR_LIST_LIMIT,
  RELATED_PRODUCT_SEARCH_DEBOUNCE_MS,
  RELATED_PRODUCT_SEARCH_LIMIT,
  RELATED_PRODUCT_SEARCH_MIN_CHARS,
  RELATED_PRODUCT_SELECTED_IDS_LOOKUP_LIMIT,
  RELATED_PRODUCT_SELECTED_LIMIT,
  RELATED_PRODUCT_STORED_PARSE_LIMIT,
  canAddRelatedProductId,
  getRelatedProductPickerMode,
  limitPublicRelatedProducts,
  parseRelatedProductIdsParam,
  shouldListDefaultAuthorProducts,
  shouldRejectChangedAuthorRecommendations,
  shouldSearchRelatedProducts,
  sameRelatedPracticeIdList,
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
assert.equal(MAX_AUTHOR_RECOMMENDATIONS, 5, "MAX_AUTHOR_RECOMMENDATIONS=5");
assert.equal(
  RELATED_PRODUCT_SELECTED_LIMIT,
  MAX_AUTHOR_RECOMMENDATIONS,
  "single shared cap, no conflicting 8-item selected limit",
);
assert.ok(RELATED_PRODUCT_DEFAULT_AUTHOR_LIST_LIMIT >= 20);
assert.ok(RELATED_PRODUCT_DEFAULT_AUTHOR_LIST_LIMIT <= 30);
assert.ok(RELATED_PRODUCT_SELECTED_IDS_LOOKUP_LIMIT > MAX_AUTHOR_RECOMMENDATIONS);
assert.equal(RELATED_PRODUCT_STORED_PARSE_LIMIT, 8);
assert.equal(AUTHOR_RECOMMENDATIONS_LIMIT_COPY, "Можно добавить до 5 рекомендаций");
assert.equal(shouldSearchRelatedProducts(""), false);
assert.equal(shouldSearchRelatedProducts("а"), false);
assert.equal(shouldSearchRelatedProducts("сон"), true);
assert.equal(shouldListDefaultAuthorProducts(""), true, "EMPTY_QUERY_SHOWS_AUTHOR_PRODUCTS");
assert.equal(shouldListDefaultAuthorProducts("   "), true);
assert.equal(shouldListDefaultAuthorProducts("а"), false);
assert.equal(shouldListDefaultAuthorProducts("сон"), false);
assert.equal(getRelatedProductPickerMode(""), "default");
assert.equal(getRelatedProductPickerMode("а"), "hint");
assert.equal(getRelatedProductPickerMode("сон"), "search");
assert.match(toRelatedProductOrFilter("сон,практика"), /title\.ilike\.%сон практика%/);
assert.deepEqual(
  parseRelatedProductIdsParam("33333333-3333-4333-8333-333333333333,not-a-uuid"),
  ["33333333-3333-4333-8333-333333333333"],
);

function recId(n) {
  return `aaaaaaaa-1111-4111-8111-${String(n).padStart(12, "0")}`;
}

const fiveIds = [1, 2, 3, 4, 5].map(recId);
const sixIds = [1, 2, 3, 4, 5, 6].map(recId);

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
  "ALREADY_SELECTED_DISABLED",
);
assert.equal(canAddRelatedProductId(recId(2), [recId(1)]).ok, true, "1 rec can add");
assert.equal(canAddRelatedProductId(recId(6), fiveIds).ok, false, "UI cannot add 6th");
assert.equal(canAddRelatedProductId(recId(6), fiveIds).reason, "full");
assert.equal(canAddRelatedProductId(recId(7), sixIds).reason, "full");

assert.equal(sameRelatedPracticeIdList(sixIds, sixIds), true);
assert.equal(sameRelatedPracticeIdList(sixIds, [...sixIds].reverse()), false);
assert.equal(
  shouldRejectChangedAuthorRecommendations(sixIds, sixIds),
  false,
  "legacy >5 does not block unrelated product save",
);
assert.equal(
  shouldRejectChangedAuthorRecommendations(sixIds, [recId(1), recId(2), recId(3), recId(4), recId(6), recId(5)]),
  true,
  "API rejects changed list of 6",
);
assert.equal(
  shouldRejectChangedAuthorRecommendations([], sixIds),
  true,
  "API rejects new list of 6",
);
assert.equal(shouldRejectChangedAuthorRecommendations(sixIds, fiveIds), false);
assert.equal(shouldRejectChangedAuthorRecommendations([], fiveIds), false);
assert.equal(shouldRejectChangedAuthorRecommendations([recId(1)], [recId(2)]), false);
assert.deepEqual(limitPublicRelatedProducts([]), []);
assert.deepEqual(limitPublicRelatedProducts(fiveIds), fiveIds);
assert.deepEqual(
  limitPublicRelatedProducts(sixIds),
  fiveIds,
  "public renders first 5 from legacy 6+",
);

assert.equal(
  parsePracticeSeoContent({
    usage_items: [],
    faq_items: [],
    related_practice_ids: sixIds,
  })?.relatedPracticeIds.length,
  6,
  "parse still accepts legacy 6 so unrelated seo_content saves are not invalid_seo_content",
);
assert.equal(
  parsePracticeSeoContent({
    usage_items: [],
    faq_items: [],
    related_practice_ids: [...sixIds, recId(7), recId(8), recId(9)],
  }),
  null,
);

const sixSelectedParam = sixIds.join(",");
assert.deepEqual(
  parseRelatedProductIdsParam(sixSelectedParam),
  sixIds,
  "editor label lookup still sees legacy extras",
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
assert.match(seoSection, /Рекомендации автора/);
assert.match(seoSection, /Заголовок блока/);
assert.doesNotMatch(seoSection, /Связанные продукты/);
assert.doesNotMatch(seoSection, /Связанные страницы «Слушать»/);
assert.doesNotMatch(seoSection, /listen-options/);
assert.doesNotMatch(seoSection, /relatedListenSlugs/);
assert.match(seoSection, /RELATED_PRODUCT_SEARCH_DEBOUNCE_MS/);
assert.match(seoSection, /shouldSearchRelatedProducts\(relatedProductQuery\)/);
assert.match(seoSection, /shouldListDefaultAuthorProducts\(relatedProductQuery\)/);
assert.match(seoSection, /getRelatedProductPickerMode/);
assert.match(seoSection, /MAX_AUTHOR_RECOMMENDATIONS/);
assert.match(seoSection, /AUTHOR_RECOMMENDATIONS_LIMIT_COPY/);
assert.match(seoSection, /Можно добавить до 5 рекомендаций/);
assert.match(seoSection, /Добавлено/);
assert.match(seoSection, /max-h-64/);
assert.match(seoSection, /overflow-y-auto/);
assert.match(seoSection, /defaultAuthorProducts/);
assert.match(seoSection, /ProductCoverThumbnail/);
assert.match(seoSection, /option\.formatLabel/);
assert.match(seoSection, /option\.authorName/);
assert.match(seoSection, /aria-busy/);
assert.match(seoSection, /Начните вводить название/);
assert.doesNotMatch(seoSection, /filter\(\(option\) => !selectedRelatedIds\.includes/);
assert.doesNotMatch(seoSection, /PRODUCT_CONTENT_LIMITS\.seoUsageItems,\s*\n\s*\)/);
assert.doesNotMatch(seoSection, /Найти статью/);

const publicSections = read("src/components/products/PracticeSeoContentSections.tsx");
assert.match(publicSections, /RelatedProductLinkCard/);
assert.match(publicSections, /authorRecommendationsTitle/);
assert.doesNotMatch(publicSections, /Связанные продукты/);
assert.doesNotMatch(publicSections, /relatedListens/);
assert.doesNotMatch(publicSections, /Связанные страницы/);

const card = read("src/components/products/RelatedProductLinkCard.tsx");
assert.match(card, /<Link/);
assert.match(card, /ProductCoverThumbnail/);
assert.match(card, /formatLabel/);
assert.match(card, /product\.title/);
assert.match(card, /authorName/);
assert.match(card, /aria-hidden="true"/);
assert.match(card, /coverAlt="Обложка"/);
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
assert.match(loader, /limitPublicRelatedProducts/);
assert.match(loader, /RELATED_PRODUCT_STORED_PARSE_LIMIT/);
assert.doesNotMatch(
  loader,
  /related_practice_ids\.length > PRODUCT_CONTENT_LIMITS\.seoUsageItems/,
);

const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /withPreservedRelatedListenSlugs/);
assert.match(patch, /shouldRejectChangedAuthorRecommendations/);
assert.match(patch, /related_products_limit/);
assert.match(patch, /previousSeoContent\.relatedPracticeIds/);

const searchRoute = read("src/app/api/author/seo/related-product-options/route.ts");
assert.match(searchRoute, /shouldSearchRelatedProducts/);
assert.match(searchRoute, /shouldListDefaultAuthorProducts/);
assert.match(searchRoute, /RELATED_PRODUCT_SEARCH_LIMIT/);
assert.match(searchRoute, /RELATED_PRODUCT_DEFAULT_AUTHOR_LIST_LIMIT/);
assert.match(searchRoute, /toRelatedProductOrFilter/);
assert.match(searchRoute, /title\.ilike|toRelatedProductOrFilter/);
assert.match(searchRoute, /subtitle/);
assert.match(searchRoute, /status", "published"/);
assert.match(searchRoute, /published_at/);
assert.match(searchRoute, /created_at/);
assert.match(searchRoute, /DEFAULT_AUTHOR_LIST_LIMIT/);
assert.match(searchRoute, /listingDefaults/);
assert.match(searchRoute, /\.eq\("author_id", practice\.author_id\)/);
assert.doesNotMatch(searchRoute, /author_id.*searchParams/);
assert.match(searchRoute, /neq\("id", practice\.id\)/);

assert.equal(
  existsSync(path.join(root, "src/app/api/author/seo/listen-options/route.ts")),
  false,
);

const prompt = read("src/lib/seo/product-autofill/prompt.ts");
assert.match(prompt, /Не генерируй связанные продукты и URL/);
assert.doesNotMatch(prompt, /relatedListen|related_listen|слушайте статьи|URL статьи/i);

console.log("related-product-seo-unit: ok");
