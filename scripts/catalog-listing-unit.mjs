#!/usr/bin/env node
/**
 * Catalog listing filters, sort, and cursor pagination (no DB).
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
  parseCatalogKindFilter,
  parseCatalogListingLimit,
  parseCatalogListingQuery,
  parseCatalogSort,
  resolveCatalogListingKind,
  sortCatalogListingItems,
} from "../src/lib/catalog/listing.ts";
import { isComputedProgramProduct } from "../src/lib/products/catalog.ts";
import { buildCatalogHref } from "../src/lib/catalog/topic-filter.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

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
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return mapCatalogProductToListingItem(product(overrides));
}

assert(parseCatalogAccessFilter("free") === "free", "access free");
assert(parseCatalogAccessFilter("PAID") === "paid", "access paid case");
assert(parseCatalogAccessFilter("popular") === "all", "unknown access -> all");
assert(parseCatalogKindFilter("program") === "program", "kind program");
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
  kind: "practice",
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
assert(parsed.kind === "practice", "kind parsed");
assert(parsed.sort === "price_desc", "sort parsed");
assert(parsed.limit === CATALOG_LISTING_PAGE_SIZE, "page size 20");

assert(
  !isComputedProgramProduct(1, "Аудиопрактика", "practice"),
  "single practice is not program",
);
assert(
  isComputedProgramProduct(2, "Аудиопрактика", "practice"),
  "multi-track practice is program",
);
assert(
  isComputedProgramProduct(1, "Аудиокурс", "practice"),
  "course format is program",
);
assert(
  !isComputedProgramProduct(4, "Музыкальный альбом", "music"),
  "music is never program",
);

assert(
  resolveCatalogListingKind(product({ productKind: "music", audioCount: 3 })) ===
    "music",
  "music kind",
);
assert(
  resolveCatalogListingKind(
    product({ productKind: "audio_post", format: "Аудиопост" }),
  ) === "audio_post",
  "audio_post kind",
);
assert(
  resolveCatalogListingKind(
    product({ audioCount: 3, productTypeLabel: "Программа аудиопрактик" }),
  ) === "program",
  "computed program kind",
);
assert(resolveCatalogListingKind(product()) === "practice", "practice kind");

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
];

const freeOnly = filterCatalogListingItems(mixed, { access: "free", kind: "all" });
assert(freeOnly.map((item) => item.id).join() === "gift", "access=free keeps gifts");

const paidOnly = filterCatalogListingItems(mixed, { access: "paid", kind: "all" });
assert(
  paidOnly.every((item) => item.accessState === "paid"),
  "access=paid excludes gifts",
);
assert(paidOnly.length === 3, "access=paid keeps paid products");

const programs = filterCatalogListingItems(mixed, {
  access: "all",
  kind: "program",
});
assert(programs.map((item) => item.id).join() === "paid-program", "kind=program");

const practices = filterCatalogListingItems(mixed, {
  access: "all",
  kind: "practice",
});
assert(
  practices.every((item) => item.kind === "practice"),
  "kind=practice excludes program/music",
);
assert(practices.map((item) => item.id).join() === "gift,paid-practice", "practices list");

const newest = sortCatalogListingItems(mixed, "new");
assert(
  newest.map((item) => item.id).join() === "music,gift,paid-practice,paid-program",
  "sort=new uses published_at",
);

const cheapFirst = sortCatalogListingItems(mixed, "price_asc");
assert(
  cheapFirst.map((item) => item.id).join() ===
    "gift,music,paid-practice,paid-program",
  "sort=price_asc",
);

const expensiveFirst = sortCatalogListingItems(mixed, "price_desc");
assert(
  expensiveFirst.map((item) => item.id).join() ===
    "paid-program,paid-practice,music,gift",
  "sort=price_desc",
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
assert(firstPage.items[0].id === "id-00", "first page starts at newest");
assert(firstPage.items[19].id === "id-19", "first page ends at 20th");

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
assert(secondPage.items[0].id === "id-20", "second page continues after cursor");

const encoded = encodeCatalogCursor(123, "abc");
assert(decodeCatalogCursor(encoded)?.id === "abc", "cursor roundtrip id");
assert(decodeCatalogCursor("%%%") === null, "invalid cursor ignored");
assert(
  applyCatalogListingCursor(pageItems, "%%%", "new").length === 25,
  "bad cursor keeps full list",
);

const mapped = mapCatalogProductToListingItem(
  product({
    isFree: true,
    priceLabel: "Подарок",
    authorName: "Мария",
  }),
);
assert(mapped.author === "Мария", "card author");
assert(mapped.accessState === "free", "card accessState");
assert(mapped.isSaved === false, "mapped default isSaved is false");
assert(!("playbackMode" in mapped), "no playbackMode");
assert(!("preview" in mapped), "no preview");

const savedPage = applyCatalogListingSavedState(
  [
    { ...mapped, id: "saved-practice", accessState: "paid" },
    { ...mapped, id: "other-practice", accessState: "free" },
  ],
  new Set(["saved-practice"]),
);
assert(savedPage[0].isSaved === true, "authorized user isSaved=true");
assert(savedPage[1].isSaved === false, "unsaved card stays false");
assert(savedPage[0].accessState === "paid", "isSaved does not change accessState");

const guestPage = applyCatalogListingSavedState(
  [{ ...mapped, id: "saved-practice" }],
  null,
);
assert(guestPage[0].isSaved === false, "guest always receives isSaved=false");
assert(guestPage[0].accessState === mapped.accessState, "guest accessState unchanged");

assert(buildCatalogListingApiUrl({ access: "free" }) === "/api/catalog?access=free");
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
  buildCatalogHref({ q: "сон", access: "paid", kind: "music" }) ===
    "/catalog?q=%D1%81%D0%BE%D0%BD&access=paid&kind=music",
  "filters compose with search",
);

console.log("catalog-listing-unit: ok");
