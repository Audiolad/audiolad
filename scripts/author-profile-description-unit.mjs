#!/usr/bin/env node
/**
 * Author profile description block regression — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
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

testProfileClientUi();
testValidationLimits();
testProfileApi();
testPositioningUnchanged();

console.log("author-profile-description-unit: ok");
