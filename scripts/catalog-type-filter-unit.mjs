#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  catalogTypeQueryFilter,
  matchesCatalogProductType,
} from "../src/lib/catalog/type-filter.ts";

const rows = [
  { id: "gift", product_kind: "practice", format: "Аудиопрактика", is_free: true },
  { id: "energy", product_kind: "practice", publication_class: "practice", catalog_section: "meditations", format: "Энергетическая практика", is_free: true },
  { id: "meditation", product_kind: "practice", format: "Медитация", is_free: false },
  { id: "story", product_kind: "practice", publication_class: "practice", catalog_section: "stories", format: "Аудиоистория", is_free: true },
  { id: "legacy-story", product_kind: "practice", format: "Аудиоистория", is_free: true },
  { id: "custom-story", product_kind: "practice", catalog_section: "stories", format: "Сказка", is_free: true },
  { id: "post", product_kind: "audio_post", format: "Аудиопост", is_free: true },
  { id: "legacy-post", product_kind: "practice", publication_class: "practice", format: "Аудиопост", is_free: true },
  { id: "explicit-post", product_kind: "practice", publication_class: "post", format: "Разбор", is_free: true },
  { id: "music", product_kind: "music", is_free: true },
  { id: "course", product_kind: "practice", publication_class: "course", is_free: true },
  { id: "book", product_kind: "practice", publication_class: "audiobook", is_free: true },
  { id: "legacy-book", product_kind: "practice", format: "Аудиокнига", is_free: true },
  { id: "education", product_kind: "practice", catalog_section: "education", format: "Лекция", is_free: true },
  { id: "education-podcast", product_kind: "practice", publication_class: "practice", catalog_section: "education", format: "Прогноз", is_free: true },
  // Practice-class rows in the music section / with music or sound formats → «Музыка».
  { id: "sound", product_kind: "practice", publication_class: "practice", catalog_section: "music", format: "Звук", is_free: true },
  { id: "music-section-practice", product_kind: "practice", publication_class: "practice", catalog_section: "music", format: "Аудиопрактика", is_free: true },
  { id: "music-section-paid", product_kind: "practice", publication_class: "practice", catalog_section: "music", format: "Медитация", is_free: false },
  { id: "practice-music-format", product_kind: "practice", publication_class: "practice", catalog_section: "music", format: "Музыка", is_free: true },
  { id: "legacy-sound", product_kind: "practice", format: "Звук", is_free: true },
  { id: "music-section-post", product_kind: "practice", publication_class: "practice", catalog_section: "music", format: "Аудиопост", is_free: true },
  { id: "music-section-course", product_kind: "practice", publication_class: "course", catalog_section: "music", is_free: true },
];

const ids = (type, free = false) => rows
  .filter((row) => matchesCatalogProductType(row, type) && (!free || row.is_free))
  .map((row) => row.id);
assert.deepEqual(ids("practice"), ["gift", "energy", "meditation"]);
assert.deepEqual(ids("practice", true), ["gift", "energy"]);
assert.deepEqual(ids("stories"), ["story", "legacy-story", "custom-story"]);
assert.deepEqual(ids("post"), ["post", "legacy-post", "explicit-post", "music-section-post"]);
assert.deepEqual(ids("release"), ["music", "sound", "music-section-practice", "music-section-paid", "practice-music-format", "legacy-sound"]);
assert.deepEqual(ids("release", true), ["music", "sound", "music-section-practice", "practice-music-format", "legacy-sound"]);
assert.deepEqual(ids("course"), ["course", "music-section-course"]);
// Education-section practice rows have no type chip and stay only under «Все».
for (const type of ["practice", "stories", "post", "release", "course", "audiobook"]) {
  assert.equal(ids(type).includes("education-podcast"), false, `education-podcast not in ${type}`);
}
// Each row is in at most one type chip.
for (const row of rows) {
  const types = ["practice", "stories", "post", "release", "course", "audiobook"]
    .filter((type) => matchesCatalogProductType(row, type));
  assert.ok(types.length <= 1, `${row.id} in ${types.join(",")}`);
}
assert.deepEqual(ids("audiobook"), ["book"]);
assert.equal(catalogTypeQueryFilter("all"), null);

// Independently interpret the emitted PostgREST grammar, including SQL NULL
// semantics. This checks the actual query expression as well as the JS fallback.
function splitArgs(value) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"' && value[i - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (value[i] === "(") depth++;
    if (value[i] === ")") depth--;
    if (value[i] === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}
function queryMatches(row, expression) {
  const group = /^(and|or)\((.*)\)$/s.exec(expression);
  if (group) {
    const values = splitArgs(group[2]).map((part) => queryMatches(row, part));
    return group[1] === "and" ? values.every(Boolean) : values.some(Boolean);
  }
  const [, field, operator, raw] = /^(\w+)\.(eq|neq|is)\.(.*)$/s.exec(expression);
  const actual = row[field] ?? null;
  if (operator === "is") return actual === null && raw === "null";
  if (actual === null) return false;
  const expected = JSON.parse(raw);
  return operator === "eq" ? actual === expected : actual !== expected;
}
for (const type of ["practice", "stories", "post", "release", "course", "audiobook"]) {
  const expression = catalogTypeQueryFilter(type);
  for (const row of rows) {
    assert.equal(queryMatches(row, expression), matchesCatalogProductType(row, type), `${type}: ${row.id}`);
  }
}

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const listing = read("../src/lib/catalog/listing.ts");
const search = read("../src/lib/catalog/search.ts");
const products = read("../src/lib/products/catalog.ts");
assert.equal((listing.match(/catalogType: query.class/g) ?? []).length, 2, "listing and search receive the type");
assert.equal((search.match(/query = query.or\(typeFilter\)/g) ?? []).length, 2, "field and author search filter before limit");
assert.match(products, /query = query.or\(typeFilter\)/, "ordinary catalog filters in query");
assert.match(listing, /const candidates = filterCatalogListingItems\([\s\S]*const sorted = sortCatalogListingItems\([\s\S]*const page = paginateCatalogListingItems\(/, "filter before pagination");
assert.match(read("../src/lib/catalog/catalog-filter-ui.ts"), /value: "stories", label: "Истории"/);
console.log("catalog-type-filter-unit: ok");
