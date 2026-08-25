#!/usr/bin/env node
/**
 * Catalog listing filters, sort, and cursor pagination (no DB).
 * Phase 0: class/access + CatalogCard, no program/format/audio-count rules.
 */
import {
  applyCatalogListingCursor,
  applyCatalogListingSavedState,
  buildCatalogListingApiUrl,
  CATALOG_LISTING_PAGE_SIZE,
  decodeCatalogCursor,
  encodeCatalogCursor,
  filterCatalogListingItems,
  mapCatalogProductToListingItem,
  paginateCatalogListingItems,
  parseCatalogAccessFilter,
  parseCatalogClassFilter,
  parseCatalogKindFilter,
  parseCatalogListingLimit,
  parseCatalogListingQuery,
  parseCatalogSort,
  resolveCatalogListingClass,
  sortCatalogListingItems,
} from "../src/lib/catalog/listing.ts";
import { mapLegacyProductKindToClass } from "../src/lib/catalog/legacy-adapter.ts";
import { catalogMoneyFromRubles } from "../src/lib/catalog/offer.ts";
import { buildCatalogHref } from "../src/lib/catalog/topic-filter.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const FORBIDDEN_DISPLAY_LABELS = ["Релиз", "Практика", "Пост", "Курс"];

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

function candidate(overrides = {}) {
  return mapCatalogProductToListingItem(product(overrides));
}

assert(parseCatalogAccessFilter("free") === "free", "access free");
assert(parseCatalogAccessFilter("PAID") === "paid", "access paid case");
assert(parseCatalogAccessFilter("popular") === "all", "unknown access -> all");
assert(parseCatalogClassFilter("release") === "release", "class release");
assert(parseCatalogClassFilter("music") === "release", "legacy kind music -> release");
assert(parseCatalogKindFilter("audio_post") === "post", "legacy kind audio_post -> post");
assert(parseCatalogKindFilter("program") === "practice", "legacy program -> practice");
assert(parseCatalogKindFilter("trending") === "all", "unknown kind -> all");
assert(parseCatalogSort("price_asc") === "price_asc", "sort price_asc");
assert(parseCatalogSort("popular") === "new", "unknown sort -> new");
assert(parseCatalogListingLimit("20") === 20, "default page size");
assert(parseCatalogListingLimit("99") === 50, "limit clamped");
assert(parseCatalogListingLimit("0") === 1, "limit min 1");

const parsed = parseCatalogListingQuery({
  q: "  деньги  ",
  topic: "Money",
  access: "free",
  class: "practice",
  sort: "price_desc",
  cursor: "abc",
  limit: "20",
});
assert(parsed.q === "деньги", "q normalized");
assert(parsed.topic === "money", "topic normalized");
assert(
  parseCatalogListingQuery({ topic: "money,sleep,calm" }).topic === "money,sleep,calm",
  "listing keeps a comma topic list",
);
assert(
  parseCatalogListingQuery({ topic: "money,,sleep,money,energy" }).topic ===
    "money,sleep,energy",
  "listing drops empties/duplicates and caps at 3",
);
assert(
  parseCatalogListingQuery({ topic: "Money" }).topic === "money",
  "legacy single topic URL still works",
);
assert(parsed.access === "free", "access parsed");
assert(parsed.class === "practice", "class parsed");
assert(parsed.sort === "price_desc", "sort parsed");
assert(parsed.limit === CATALOG_LISTING_PAGE_SIZE, "page size 20");
assert(
  parseCatalogListingQuery({ kind: "music" }).class === "release",
  "legacy kind query maps to class",
);

assert(
  mapLegacyProductKindToClass("practice") === "practice",
  "legacy practice stays practice",
);
assert(mapLegacyProductKindToClass("music") === "release", "legacy music -> release");
assert(
  mapLegacyProductKindToClass("audio_post") === "post",
  "legacy audio_post -> post",
);
assert(
  resolveCatalogListingClass(product({ productKind: "music", audioCount: 3 })) ===
    "release",
  "music class",
);
assert(
  resolveCatalogListingClass(
    product({ productKind: "audio_post", format: "Аудиопост" }),
  ) === "post",
  "audio_post class",
);
assert(
  resolveCatalogListingClass(
    product({ audioCount: 7, format: "Программа аудиопрактик" }),
  ) === "practice",
  "seven sessions stay practice, not course",
);
assert(resolveCatalogListingClass(product()) === "practice", "practice class");
assert(
  resolveCatalogListingClass(
    product({
      publicationClass: null,
      format: "Аудиокурс",
      productTypeLabel: "Аудиокурс",
    }),
  ) === "practice",
  "NULL class + format Аудиокурс stays practice",
);
assert(
  resolveCatalogListingClass(
    product({
      publicationClass: "course",
      productKind: "practice",
      format: "Аудиопрактика",
    }),
  ) === "course",
  "publication_class wins over product_kind and format",
);
assert(
  resolveCatalogListingClass(
    product({ publicationClass: "audiobook", productKind: "practice" }),
  ) === "audiobook",
  "explicit audiobook class is readable",
);

const courseCard = candidate({
  id: "course-1",
  publicationClass: "course",
  productKind: "practice",
  format: "Аудиопрактика",
});
assert(courseCard.class === "course", "listing maps explicit course");
assert(
  filterCatalogListingItems([courseCard], {
    access: "all",
    class: "course",
  }).map((item) => item.publication_id).join() === "course-1",
  "class=course listing is not empty when publication_class is set",
);

const mixed = [
  candidate({
    id: "gift",
    isFree: true,
    price: 0,
    priceLabel: "Подарок",
    sortTimestamp: 30,
  }),
  candidate({
    id: "paid-practice",
    price: 500,
    priceLabel: "500 ₽",
    sortTimestamp: 20,
  }),
  candidate({
    id: "paid-program",
    audioCount: 4,
    format: "Цикл практик",
    productTypeLabel: "Программа аудиопрактик",
    price: 1900,
    priceLabel: "1 900 ₽",
    sortTimestamp: 10,
  }),
  candidate({
    id: "music",
    productKind: "music",
    format: "Музыка",
    productTypeLabel: "Музыка",
    price: 300,
    priceLabel: "300 ₽",
    sortTimestamp: 40,
  }),
  candidate({
    id: "post",
    productKind: "audio_post",
    format: "Аудиопост",
    isFree: true,
    price: 0,
    sortTimestamp: 5,
  }),
];

assert(
  mixed.every((item) => !FORBIDDEN_DISPLAY_LABELS.includes(item.display_label)),
  "mixed listing items never use class names as display_label",
);

const freeOnly = filterCatalogListingItems(mixed, { access: "free", class: "all" });
assert(freeOnly.map((item) => item.publication_id).join() === "gift", "access=free keeps gifts");
assert(
  freeOnly.every((item) => item.default_offer?.access === "free"),
  "gifts use offer access=free, not product_kind",
);
assert(
  freeOnly.every((item) => item.default_offer?.claim === "free_claim"),
  "gifts are free_claim only",
);

const paidOnly = filterCatalogListingItems(mixed, { access: "paid", class: "all" });
assert(
  paidOnly.every((item) => item.default_offer?.access === "paid"),
  "access=paid uses default_offer",
);
assert(paidOnly.length === 3, "access=paid keeps paid products and excludes posts");
assert(
  !paidOnly.some((item) => item.class === "post"),
  "posts have no offer and stay out of products",
);

const practices = filterCatalogListingItems(mixed, {
  access: "all",
  class: "practice",
});
assert(
  practices.every((item) => item.class === "practice"),
  "class=practice keeps multi-track practices",
);
assert(
  practices.map((item) => item.publication_id).join() === "gift,paid-practice,paid-program",
  "practices list includes former programs",
);

const releases = filterCatalogListingItems(mixed, {
  access: "all",
  class: "release",
});
assert(releases.map((item) => item.publication_id).join() === "music", "class=release");

const posts = filterCatalogListingItems(mixed, {
  access: "all",
  class: "post",
});
assert(posts.map((item) => item.publication_id).join() === "post", "class=post");
assert(posts[0].default_offer === null, "post has no offer");
assert(posts[0].viewer.can_listen === true, "public post can listen without grant");
assert(
  candidate({
    productKind: "music",
    publicationClass: "release",
    format: "Музыка",
    gallery: [{ id: "x", image_url: "/x.jpg", position: 0, alt: "" }],
  }).gallery.length === 0,
  "release listing gallery is always empty",
);
assert(
  candidate({
    productKind: "audio_post",
    publicationClass: "post",
    format: "Аудиопост",
    isFree: true,
    price: 0,
    gallery: [{ id: "x", image_url: "/x.jpg", position: 0, alt: "" }],
  }).gallery.length === 0,
  "post listing gallery is always empty",
);
assert(
  candidate({
    publicationClass: "course",
    productKind: "practice",
    gallery: [
      { id: "b", image_url: "/b.jpg", position: 1, alt: "" },
      { id: "a", image_url: "/a.jpg", position: 0, alt: "" },
    ],
  })
    .gallery.map((slide) => slide.id)
    .join() === "a,b",
  "product listing gallery stays ordered by position",
);
assert(posts[0].viewer.has_grant === false, "public post has no grant");

const newest = sortCatalogListingItems(mixed, "new");
assert(
  newest.map((item) => item.publication_id).join() ===
    "music,gift,paid-practice,paid-program,post",
  "sort=new uses published_at",
);

const cheapFirst = sortCatalogListingItems(mixed, "price_asc");
assert(
  cheapFirst.map((item) => item.publication_id).join() ===
    "gift,post,music,paid-practice,paid-program",
  "sort=price_asc uses amount_minor",
);

const expensiveFirst = sortCatalogListingItems(mixed, "price_desc");
assert(
  expensiveFirst.map((item) => item.publication_id).join() ===
    "paid-program,paid-practice,music,gift,post",
  "sort=price_desc uses amount_minor",
);

const pageItems = Array.from({ length: 25 }, (_, index) =>
  candidate({
    id: `id-${String(index).padStart(2, "0")}`,
    sortTimestamp: 2_000 - index,
    price: 100 + index,
    title: `Item ${index}`,
  }),
);
const firstPage = paginateCatalogListingItems(pageItems, {
  cursor: null,
  limit: 20,
  sort: "new",
});
assert(firstPage.items.length === 20, "first page size 20");
assert(typeof firstPage.nextCursor === "string", "first page has cursor");
assert(firstPage.items[0].publication_id === "id-00", "first page starts at newest");
assert(firstPage.items[19].publication_id === "id-19", "first page ends at 20th");

const decoded = decodeCatalogCursor(firstPage.nextCursor);
assert(decoded?.id === "id-19", "cursor stores last id");
assert(decoded?.sortTimestamp === 2_000 - 19, "cursor stores published_at");

const secondPage = paginateCatalogListingItems(pageItems, {
  cursor: firstPage.nextCursor,
  limit: 20,
  sort: "new",
});
assert(secondPage.items.length === 5, "second page remaining items");
assert(secondPage.nextCursor === null, "last page has no cursor");
assert(secondPage.items[0].publication_id === "id-20", "second page continues after cursor");

const encoded = encodeCatalogCursor(123, "abc");
assert(decodeCatalogCursor(encoded)?.id === "abc", "cursor roundtrip id");
assert(decodeCatalogCursor("%%%") === null, "invalid cursor ignored");
assert(
  applyCatalogListingCursor(pageItems, "%%%", "new").length === 25,
  "bad cursor keeps full list",
);

function assertStorefrontDisplayLabel(card, expected, message) {
  assert(card.display_label === expected, message);
  assert(
    !FORBIDDEN_DISPLAY_LABELS.includes(card.display_label),
    `display_label must not be a class name: ${card.display_label}`,
  );
}

assertStorefrontDisplayLabel(
  candidate(),
  "Аудиопрактика",
  "practice default format is Аудиопрактика",
);
assertStorefrontDisplayLabel(
  candidate({ format: "Медитация" }),
  "Медитация",
  "practice format preset is preserved",
);
assertStorefrontDisplayLabel(
  candidate({ format: "Голос для сна" }),
  "Голос для сна",
  "custom author format is preserved",
);
assertStorefrontDisplayLabel(
  candidate({ productKind: "music", format: "Музыка" }),
  "Музыка",
  "music uses stored MUSIC_KIND_LABEL",
);
assertStorefrontDisplayLabel(
  candidate({ productKind: "music", format: "  " }),
  "Музыка",
  "empty music format falls back to Музыка",
);
assertStorefrontDisplayLabel(
  candidate({ productKind: "audio_post", format: "Аудиопост" }),
  "Аудиопост",
  "audio_post uses stored format, not Пост",
);
assertStorefrontDisplayLabel(
  candidate({ productKind: "audio_post", format: "" }),
  "Аудиопост",
  "empty audio_post format falls back to Аудиопост",
);

const mapped = mapCatalogProductToListingItem(
  product({
    isFree: true,
    priceLabel: "Подарок",
    authorName: "Мария",
  }),
);
assertStorefrontDisplayLabel(
  mapped,
  "Аудиопрактика",
  "mapped gift keeps practice format label",
);
assert(mapped.author.name === "Мария", "card author");
assert(mapped.default_offer?.access === "free", "card offer access");
assert(mapped.viewer.is_saved === false, "mapped default is_saved is false");
assert(mapped.gallery.length === 0, "legacy gallery is empty");
assert(mapped.progress === null, "progress reserved");
assert(!("price" in mapped), "public card has no legacy price");
assert(!("isFree" in mapped), "public card has no is_free");
assert(!("productKind" in mapped), "public card has no product_kind");
assert(!("audioCount" in mapped), "public card has no audio_items count");
assert(
  catalogMoneyFromRubles(490)?.amount_minor === 49000,
  "490 RUB is 49000 kopecks",
);

const savedPage = applyCatalogListingSavedState(
  [
    {
      ...mapped,
      publication_id: "saved-practice",
      default_offer: { access: "paid", price: { amount_minor: 50000, currency: "RUB" } },
    },
    { ...mapped, publication_id: "other-practice" },
  ],
  new Set(["saved-practice"]),
);
assert(savedPage[0].viewer.is_saved === true, "authorized user is_saved=true");
assert(savedPage[1].viewer.is_saved === false, "unsaved card stays false");
assert(
  savedPage[0].default_offer?.access === "paid",
  "is_saved does not change offer access",
);

const guestPage = applyCatalogListingSavedState(
  [{ ...mapped, publication_id: "saved-practice" }],
  null,
);
assert(guestPage[0].viewer.is_saved === false, "guest always receives is_saved=false");
assert(
  guestPage[0].default_offer?.access === mapped.default_offer?.access,
  "guest offer access unchanged",
);

assert(buildCatalogListingApiUrl({ access: "free" }) === "/api/catalog?access=free");
assert(
  buildCatalogListingApiUrl({ class: "release" }) === "/api/catalog?class=release",
  "listing API uses class",
);
assert(
  decodeURIComponent(
    new URL(
      buildCatalogListingApiUrl({ topic: "money,sleep,calm" }),
      "https://audiolad.test",
    ).searchParams.get("topic"),
  ) === "money,sleep,calm",
  "listing API URL keeps comma topic without a new param",
);
assert(buildCatalogHref({ sort: "new" }) === "/catalog", "default sort omitted");
assert(
  buildCatalogHref({ access: "free" }) === "/catalog?access=free",
  "gifts href",
);
assert(
  buildCatalogHref({ q: "сон", access: "paid", class: "release" }) ===
    "/catalog?q=%D1%81%D0%BE%D0%BD&access=paid&class=release",
  "filters compose with search",
);
assert(
  buildCatalogHref({ kind: "music" }) === "/catalog?class=release",
  "legacy kind href maps to class=release",
);

console.log("catalog-listing-unit: ok");
