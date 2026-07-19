#!/usr/bin/env node
/**
 * Author recommendations merge/ranking regression — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  mergeAuthorRecommendations,
  SIMILAR_AUTHORS_LIMIT,
  sortFallbackAuthorCandidates,
  sortRelatedAuthorCandidates,
} from "../src/lib/authors/author-recommendations.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const currentAuthorId = "current";

function author(id, name, overlapScore = 0) {
  return { id, name, overlapScore };
}

function testSharedTopicsFirst() {
  const result = mergeAuthorRecommendations({
    currentAuthorId,
    relatedAuthors: [
      author("b", "Борис", 2),
      author("a", "Анна", 3),
    ],
    fallbackAuthors: [author("c", "Вера", 0)],
  });

  assert(result[0].id === "a", "highest overlap first");
  assert(result[1].id === "b", "second overlap next");
}

function testAuthorWithoutTopicsGetsFallback() {
  const result = mergeAuthorRecommendations({
    currentAuthorId,
    relatedAuthors: [],
    fallbackAuthors: [
      author("joint", "Сергей и Зоя", 0),
      author("sergey", "Сергей Петров", 0),
    ],
    limit: 2,
  });

  assert(result.length === 2, "fallback fills empty related set");
  assert(
    result.every((item) => item.overlapScore === 0),
    "fallback authors keep zero overlap score",
  );
}

function testUniqueTopicGetsFallbackWhenNoRelated() {
  const result = mergeAuthorRecommendations({
    currentAuthorId,
    relatedAuthors: [],
    fallbackAuthors: [author("x", "Эксперт", 0)],
  });

  assert(result.length === 1, "single fallback author returned");
}

function testOneRelatedPlusFallback() {
  const result = mergeAuthorRecommendations({
    currentAuthorId,
    limit: 2,
    relatedAuthors: [author("related", "Похожий", 4)],
    fallbackAuthors: [
      author("fb1", "Борис", 0),
      author("fb2", "Анна", 0),
    ],
  });

  assert(result.length === 2, "second slot filled by fallback");
  assert(result[0].id === "related", "related author stays first");
  assert(result[1].id === "fb2", "fallback sorted by name");
}

function testCurrentAuthorExcluded() {
  const result = mergeAuthorRecommendations({
    currentAuthorId: "self",
    relatedAuthors: [author("self", "Я", 5), author("other", "Другой", 1)],
    fallbackAuthors: [author("self", "Я", 0), author("fb", "Fallback", 0)],
  });

  assert(result.every((item) => item.id !== "self"), "current author excluded");
  assert(result.length === 2, "remaining authors still returned");
}

function testNoDuplicates() {
  const duplicate = author("dup", "Дубликат", 2);
  const result = mergeAuthorRecommendations({
    currentAuthorId,
    relatedAuthors: [duplicate],
    fallbackAuthors: [author("dup", "Дубликат", 0), author("other", "Другой", 0)],
    limit: 2,
  });

  assert(result.length === 2, "dedup keeps two unique authors");
  assert(result.filter((item) => item.id === "dup").length === 1, "duplicate removed");
}

function testNonPublicOverlapZeroStillEligibleForFallback() {
  const result = mergeAuthorRecommendations({
    currentAuthorId,
    relatedAuthors: [author("hidden", "Скрытый", 0)],
    fallbackAuthors: [author("hidden", "Скрытый", 0)],
  });

  assert(result.length === 1, "zero-overlap candidate can appear via fallback");
}

function testOnlyAuthorOnPlatformReturnsEmpty() {
  const result = mergeAuthorRecommendations({
    currentAuthorId: "solo",
    relatedAuthors: [],
    fallbackAuthors: [],
  });

  assert(result.length === 0, "empty when no other authors exist");
}

function testEmptyPositioningDoesNotAffectMerge() {
  const result = mergeAuthorRecommendations({
    currentAuthorId,
    relatedAuthors: [],
    fallbackAuthors: [author("plain", "Без подписи", 0)],
  });

  assert(result[0]?.name === "Без подписи", "author without positioning still included");
}

function testDeterministicFallbackSort() {
  const sorted = sortFallbackAuthorCandidates([
    author("c", "Вера", 0),
    author("a", "Анна", 0),
    author("b", "Борис", 0),
  ]);

  assert(sorted.map((item) => item.name).join(",") === "Анна,Борис,Вера", "ru locale sort");
}

function testDeterministicRelatedSort() {
  const sorted = sortRelatedAuthorCandidates([
    author("b", "Борис", 2),
    author("a", "Анна", 2),
    author("c", "Вера", 3),
  ]);

  assert(sorted[0].id === "c", "overlap desc");
  assert(sorted[1].name === "Анна", "name tie-break");
}

function testSimilarAuthorsLoaderUsesFallbackMerge() {
  const source = readFileSync("src/lib/authors/similar-authors.ts", "utf8");

  assert(source.includes("mergeAuthorRecommendations"), "loader uses merge helper");
  assert(source.includes("fallbackAuthors"), "loader builds fallback author pool");
  assert(
    !source.includes(".filter((candidate) => candidate.overlapScore > 0)\n    .slice(0, 4)"),
    "loader no longer returns only positive-overlap authors",
  );
  assert(
    source.includes("SIMILAR_AUTHORS_LIMIT"),
    "loader keeps explicit recommendation limit",
  );
  assert(SIMILAR_AUTHORS_LIMIT === 4, "current UI limit remains 4 cards");
}

const tests = [
  ["shared topics first", testSharedTopicsFirst],
  ["author without topics gets fallback", testAuthorWithoutTopicsGetsFallback],
  ["unique topic gets fallback", testUniqueTopicGetsFallbackWhenNoRelated],
  ["one related plus fallback", testOneRelatedPlusFallback],
  ["current author excluded", testCurrentAuthorExcluded],
  ["no duplicates", testNoDuplicates],
  ["zero overlap eligible for fallback", testNonPublicOverlapZeroStillEligibleForFallback],
  ["only author on platform empty", testOnlyAuthorOnPlatformReturnsEmpty],
  ["empty positioning allowed", testEmptyPositioningDoesNotAffectMerge],
  ["deterministic fallback sort", testDeterministicFallbackSort],
  ["deterministic related sort", testDeterministicRelatedSort],
  ["similar authors loader wiring", testSimilarAuthorsLoaderUsesFallbackMerge],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok - ${name}`);
}

console.log(`\n${tests.length} author recommendation checks passed.`);
