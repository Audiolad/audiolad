#!/usr/bin/env node
/**
 * Authors list page + default avatar unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import {
  formatAuthorProductCount,
  formatAuthorPublishedCount,
  sortPublicAuthors,
} from "../src/lib/authors/public-list.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testAuthorsPageUsesLiveData() {
  const page = read("src/app/authors/page.tsx");

  assert(!page.includes("12,4 тыс. слушателей"), "fake listeners removed");
  assert(!page.includes("Подписаться"), "subscribe button removed");
  assert(!page.includes("По популярности"), "fake popularity sort removed");
  assert(!page.includes("const authors = ["), "hardcoded authors array removed");
  assert(page.includes("loadPublicAuthorsList"), "authors page uses live loader");
  assert(page.includes("AuthorListCard"), "authors page renders live cards");
  assert(page.includes("Авторы скоро появятся"), "empty state present");
}

function testPublicListLoader() {
  const source = read("src/lib/authors/public-list-data.ts");

  assert(source.includes('.eq("status", "published")'), "only published products");
  assert(source.includes('.eq("is_catalog_listed", true)'), "catalog-listed products only");
  assert(source.includes("resolveAuthorAvatarUrl"), "avatar URL resolver used");
  assert(source.includes("resolveAuthorPositioningText"), "positioning fallback used");
  assert(source.includes("resolveAuthorShortBio"), "short bio resolver used");
  assert(source.includes("sortPublicAuthors"), "server-side sort applied");
  assert(!source.includes("for (const author"), "no per-author network loop");
  assert(source.includes("authorMap.get"), "aggregates counts in memory");
}

function testAuthorListCard() {
  const card = read("src/components/authors/AuthorListCard.tsx");

  assert(card.includes("AuthorAvatarImage"), "card uses shared avatar fallback");
  assert(card.includes("formatAuthorProductCount"), "card uses product count formatter");
  assert(card.includes("line-clamp-3"), "positioning/bio clamped");
  assert(card.includes("Открыть"), "open button present");
  assert(!card.includes("слушат"), "no listener metrics in card");
}

function testSharedAvatarFallback() {
  const avatar = read("src/components/authors/AuthorAvatarImage.tsx");
  const header = read("src/components/authors/AuthorPublicHeaderMedia.tsx");

  assert(avatar.includes("AUTHOR_DEFAULT_AVATAR_PATH"), "default avatar asset wired");
  assert(avatar.includes("object-cover"), "default avatar uses object-cover");
  assert(header.includes("AuthorAvatarImage"), "header reuses shared avatar component");
}

function testDefaultAvatarAsset() {
  const fileOutput = execSync("file public/brand/author-default-avatar.png", {
    encoding: "utf8",
  });

  assert(fileOutput.includes("PNG image data"), "default avatar is PNG");
  assert(fileOutput.includes("512 x 512"), "default avatar stays square");
}

function testProductCountFormatting() {
  assert(formatAuthorProductCount(1) === "1 продукт", "singular product count");
  assert(formatAuthorProductCount(2) === "2 продукта", "dual product count");
  assert(formatAuthorProductCount(5) === "5 продуктов", "plural product count");
  assert(
    formatAuthorPublishedCount(3) === "3 опубликованных продукта",
    "published count wording",
  );
}

function testPositioningFallbackUsage() {
  const card = read("src/components/authors/AuthorListCard.tsx");
  const brand = read("src/lib/authors/brand-assets.ts");

  assert(
    brand.includes("DEFAULT_AUTHOR_SHORT_POSITIONING"),
    "positioning fallback constant exists",
  );
  assert(card.includes("author.shortPositioning"), "card renders resolved positioning");
  assert(card.includes("author.shortBio ?"), "empty short bio block omitted");
}

function testSorting() {
  const authors = sortPublicAuthors(
    [
      { name: "Борис", publishedCount: 2, createdAt: "2026-01-01T00:00:00.000Z" },
      { name: "Анна", publishedCount: 5, createdAt: "2026-02-01T00:00:00.000Z" },
      { name: "Вера", publishedCount: 5, createdAt: "2026-03-01T00:00:00.000Z" },
    ],
    "products",
  );

  assert(authors[0].name === "Анна", "sort by product count desc");
  assert(authors[1].name === "Вера", "stable tie-break by name");
}

const tests = [
  ["authors page live data", testAuthorsPageUsesLiveData],
  ["public list loader", testPublicListLoader],
  ["author list card", testAuthorListCard],
  ["shared avatar fallback", testSharedAvatarFallback],
  ["default avatar asset", testDefaultAvatarAsset],
  ["product count formatting", testProductCountFormatting],
  ["positioning fallback usage", testPositioningFallbackUsage],
  ["sorting", testSorting],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok - ${name}`);
}

console.log(`\n${tests.length} authors page checks passed.`);
