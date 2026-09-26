import assert from "node:assert/strict";

import { mapCuratedMaxRecommendations } from "../src/lib/max/product-recommendations.ts";
import { readMaxProductDetail } from "../src/lib/max/product-view.ts";
import { MAX_AUTHOR_RECOMMENDATIONS } from "../src/lib/seo/related-product-search.ts";

const current = "current";
const catalog = new Map([
  ["current", catalogItem("current", "current-slug")],
  ["one", catalogItem("one", "one-slug")],
  ["two", catalogItem("two", "two-slug")],
  ["three", catalogItem("three", "three-slug")],
  ["four", catalogItem("four", "four-slug")],
  ["five", catalogItem("five", "five-slug")],
  ["six", catalogItem("six", "six-slug")],
  ["hidden", catalogItem("hidden", "hidden-slug")],
]);
catalog.delete("hidden");

const related = ["one", "current", "two", "three", "four", "five", "six", "hidden"].map(
  (id, index) => ({
    practiceId: id,
    title: `Продукт ${index + 1}`,
    authorName: "Автор",
    formatLabel: "Медитация",
    durationLabel: `${index + 1} мин`,
    coverUrl: `https://cdn.example/${id}.jpg`,
  }),
);

const rows = mapCuratedMaxRecommendations({
  currentPracticeId: current,
  related,
  catalogById: catalog,
});
assert.equal(rows.length, MAX_AUTHOR_RECOMMENDATIONS);
assert.equal(rows.length, 5);
assert.deepEqual(rows.map((row) => row.slug), [
  "one-slug",
  "two-slug",
  "three-slug",
  "four-slug",
  "five-slug",
]);
assert.equal(rows.some((row) => row.slug === "current-slug"), false);
assert.equal(rows[0].durationLabel, "1 мин");
assert.equal(rows[0].formatLabel, "Медитация");
assert.equal("href" in rows[0], false);

const single = mapCuratedMaxRecommendations({
  currentPracticeId: current,
  related: [related[0]],
  catalogById: catalog,
});
assert.equal(single.length, 1);

const detail = readMaxProductDetail({
  title: "Тишина",
  subtitle: "Короткий подзаголовок",
  formatLabel: "Медитация",
  coverUrl: "https://cdn.example/cover.jpg",
  metaLine: "Автор · 12 мин",
  priceLabel: "Бесплатно",
  isFree: true,
  gallery: [{ id: "s1", image_url: "https://cdn.example/slide.jpg", alt: "Слайд" }],
  topics: [{ key: "sleep", title: "Сон" }],
  contents: [{ title: "Трек", position: 1, durationSeconds: 40 }],
  recommendationsTitle: "Рекомендации автора",
  recommendations: rows.slice(0, 1).map((row) => ({ ...row, subtitle: null })),
  rating: { enabled: true, aggregate: { totalStars: 8, ratingCount: 2 } },
  appreciation: { authorName: "Автор" },
});
assert.equal(detail?.metaLine, "Автор · 12 мин");
assert.equal(detail?.recommendationsTitle, "Рекомендации автора");
assert.equal(detail?.topics[0].title, "Сон");
assert.equal(detail?.rating.aggregate.ratingCount, 2);

assert.equal(
  readMaxProductDetail({
    ...detail,
    description: "Длинное SEO описание продукта на сотни символов.",
  }),
  null,
);
assert.equal(
  readMaxProductDetail({
    title: "Тишина",
    subtitle: null,
    formatLabel: "Медитация",
    coverUrl: null,
    metaLine: null,
    priceLabel: "0",
    isFree: true,
    gallery: [],
    topics: [],
    contents: [],
    recommendationsTitle: "Рекомендации автора",
    recommendations: [{ ...rows[0], href: "/practice/author/one-slug", subtitle: null }],
    rating: { enabled: false, aggregate: { totalStars: 0, ratingCount: 0 } },
    appreciation: null,
  }),
  null,
);

function catalogItem(id, slug) {
  return {
    id,
    authorSlug: "author",
    slug,
    subtitle: null,
    authorName: "Автор",
    productTypeLabel: "Медитация",
    coverUrl: `https://cdn.example/${id}.jpg`,
    priceLabel: "Бесплатно",
    isFree: true,
  };
}

console.log("max-product-pdp-unit: ok");
