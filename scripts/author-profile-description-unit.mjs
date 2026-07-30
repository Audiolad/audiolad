#!/usr/bin/env node
/**
 * Author profile description block regression — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  MAX_AUTHOR_PROFILE_TOPICS,
  MAX_FULL_BIO_LENGTH,
  MAX_SHORT_POSITIONING_LENGTH,
} from "../src/lib/authors/constants.ts";
import {
  getFullBioLengthError,
  normalizeFullBio,
} from "../src/lib/authors/validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

function testProfileClientUi() {
  const source = read("src/components/author-dashboard/AuthorProfileClient.tsx");

  assert(!source.includes("Коротко об авторе"), "duplicate short bio field removed");
  assert(source.includes("Короткое позиционирование"), "top positioning field kept");
  assert(source.includes("Об авторе"), "full bio field kept");
  assert(
    source.includes(`maxLength={MAX_FULL_BIO_LENGTH}`),
    "full bio client maxLength wired",
  );
  assert(source.includes("{fullBioLength}/{MAX_FULL_BIO_LENGTH}"), "full bio counter /700");
  assert(
    source.includes(
      "Расскажите о себе или проекте. Абзацы разделяйте пустой строкой.",
    ),
    "full bio hint preserved",
  );
  assert(!source.includes("short_bio:"), "form no longer sends short_bio");
  assert(!source.includes("getShortBioLengthError"), "short bio client validation removed");
  assert(source.includes("getFullBioLengthError"), "full bio client validation added");
}

function testValidationLimits() {
  assert(MAX_FULL_BIO_LENGTH === 700, "full bio limit is 700");

  const exact = "a".repeat(MAX_FULL_BIO_LENGTH);
  assert(normalizeFullBio(exact) === exact, "700 chars accepted");
  assert(getFullBioLengthError(MAX_FULL_BIO_LENGTH) === null, "700 chars no client error");

  const tooLong = "a".repeat(MAX_FULL_BIO_LENGTH + 1);
  assert(normalizeFullBio(tooLong) === null, "701 chars rejected server-side");
  assert(
    getFullBioLengthError(MAX_FULL_BIO_LENGTH + 1)?.includes("700"),
    "701 chars client error mentions limit",
  );

  assert(
    normalizeFullBio(`  ${exact}  `) === exact,
    "trimmed full bio stored without outer spaces",
  );
}

function testProfileApi() {
  const route = read("src/app/api/author/profile/route.ts");

  assert(route.includes("normalizeFullBio"), "profile API validates full bio");
  assert(route.includes('error: "invalid_full_bio"'), "profile API rejects invalid full bio");
  assert(route.includes("normalizeShortBio"), "short_bio API path kept for compatibility");
}

function testPositioningUnchanged() {
  const source = read("src/components/author-dashboard/AuthorProfileClient.tsx");

  assert(
    source.includes(`maxLength={MAX_SHORT_POSITIONING_LENGTH}`),
    "positioning maxLength unchanged",
  );
  assert(
    source.includes("{shortPositioningLength}/{MAX_SHORT_POSITIONING_LENGTH}"),
    "positioning counter unchanged",
  );
  assert(MAX_SHORT_POSITIONING_LENGTH === 100, "positioning limit still 100");
}

function testProfileTopicLimit() {
  assert(MAX_AUTHOR_PROFILE_TOPICS === 3, "author profile topic limit is 3");

  const source = read("src/components/author-dashboard/AuthorProfileClient.tsx");
  const route = read("src/app/api/author/profile/route.ts");
  const selector = read("src/components/author-products/TopicSelector.tsx");

  assert(
    source.includes("MAX_AUTHOR_PROFILE_TOPICS"),
    "profile client uses shared topic limit constant",
  );
  assert(
    source.includes("лучше всего описывают ваш проект"),
    "profile topic hint uses project wording",
  );
  assert(
    !source.includes("эту практику"),
    "profile form does not reuse product practice hint",
  );
  assert(!source.includes("limit={6}"), "profile no longer hardcodes limit 6");
  assert(
    route.includes("MAX_AUTHOR_PROFILE_TOPICS"),
    "profile API enforces the same topic limit",
  );
  assert(
    selector.includes("hint ??"),
    "TopicSelector hint override keeps product default intact",
  );
  assert(
    selector.includes("эту практику"),
    "product default hint remains practice-oriented",
  );
}

testProfileClientUi();
testValidationLimits();
testProfileApi();
testPositioningUnchanged();
testProfileTopicLimit();

console.log("author-profile-description-unit: ok");
