#!/usr/bin/env node
/**
 * Author banner upload validation unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

import {
  AUTHOR_BANNER_ERROR_MESSAGES,
  AUTHOR_BANNER_IMAGE_CONFIG,
  AUTHOR_BANNER_UPLOAD_HINT,
  validateAuthorBannerDimensions,
  validateAuthorBannerFileMeta,
} from "../src/lib/authors/banner-validation-client.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validFile(overrides = {}) {
  return {
    name: "banner.jpg",
    type: "image/jpeg",
    size: 1024,
    ...overrides,
  };
}

function testDimensionRules() {
  assert(
    validateAuthorBannerDimensions(1774, 887) === null,
    "1774x887 banner should be accepted",
  );
  assert(
    validateAuthorBannerDimensions(1200, 400) === null,
    "1200x400 banner should be accepted",
  );
  assert(
    validateAuthorBannerDimensions(1199, 400) ===
      AUTHOR_BANNER_ERROR_MESSAGES.tooSmall,
    "1199x400 banner should be rejected",
  );
  assert(
    validateAuthorBannerDimensions(1200, 399) ===
      AUTHOR_BANNER_ERROR_MESSAGES.tooSmall,
    "1200x399 banner should be rejected",
  );
  assert(
    validateAuthorBannerDimensions(1000, 1000) ===
      AUTHOR_BANNER_ERROR_MESSAGES.tooSmall,
    "1000x1000 square should not pass as banner",
  );
  assert(
    validateAuthorBannerDimensions(2400, 800) === null,
    "2:1 banner should be accepted without aspect enforcement",
  );
  assert(
    validateAuthorBannerDimensions(3000, 1200) === null,
    "2.5:1 banner should be accepted without aspect enforcement",
  );
}

function testFileMetaRules() {
  assert(
    validateAuthorBannerFileMeta(validFile()) === null,
    "valid banner file meta should pass",
  );

  const tooLarge = validFile({
    size: AUTHOR_BANNER_IMAGE_CONFIG.maxFileSize + 1,
  });

  assert(
    validateAuthorBannerFileMeta(tooLarge) ===
      AUTHOR_BANNER_ERROR_MESSAGES.fileTooLarge,
    "banner over 3 MB should be rejected",
  );

  const badMime = validFile({
    name: "banner.gif",
    type: "image/gif",
  });

  assert(
    validateAuthorBannerFileMeta(badMime) ===
      AUTHOR_BANNER_ERROR_MESSAGES.unsupportedFormat,
    "unsupported banner mime should be rejected",
  );
}

function testBannerConfigContract() {
  assert(
    AUTHOR_BANNER_IMAGE_CONFIG.type === "author-banner",
    "banner config type",
  );
  assert(
    AUTHOR_BANNER_IMAGE_CONFIG.minWidth === 1200,
    "banner min width",
  );
  assert(
    AUTHOR_BANNER_IMAGE_CONFIG.minHeight === 400,
    "banner min height",
  );
  assert(
    AUTHOR_BANNER_IMAGE_CONFIG.maxFileSize === 3 * 1024 * 1024,
    "banner max file size",
  );
  assert(
    AUTHOR_BANNER_IMAGE_CONFIG.recommendedAspectRatio === 3,
    "banner recommended aspect ratio is 3:1",
  );
}

function testBannerHintAndMessages() {
  assert(
    AUTHOR_BANNER_UPLOAD_HINT.includes("рекомендуемое соотношение около 3:1"),
    "banner upload hint mentions recommended aspect ratio",
  );
  assert(
    AUTHOR_BANNER_UPLOAD_HINT.includes("1200 × 400"),
    "banner upload hint mentions minimum size",
  );
  assert(
    AUTHOR_BANNER_ERROR_MESSAGES.tooSmall.includes("баннера"),
    "banner size error mentions banner",
  );
  assert(
    !AUTHOR_BANNER_ERROR_MESSAGES.tooSmall.includes("облож"),
    "banner size error must not mention cover",
  );
}

function testBannerUploadUsesDedicatedValidation() {
  const hookSource = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/useAuthorBannerUpload.ts",
    "utf8",
  );

  assert(
    hookSource.includes("validateAuthorBannerFile"),
    "author banner upload hook uses banner validation",
  );

  const bannerHandlerMatch = hookSource.match(
    /const handleFileChange = useCallback\([\s\S]*?\n  \);/,
  );

  assert(bannerHandlerMatch, "banner file change handler exists");
  assert(
    bannerHandlerMatch[0].includes("validateAuthorBannerFile"),
    "banner handler uses banner validation",
  );
  assert(
    !bannerHandlerMatch[0].includes("validateCoverFile"),
    "banner handler does not use product cover validation",
  );
}

function testProductCoverValidationRelaxed() {
  const coverValidation = readFileSync(
    "/var/www/audiolad/src/lib/author-products/cover-validation-client.ts",
    "utf8",
  );

  assert(
    coverValidation.includes("MIN_COVER_DIMENSION = 400"),
    "product cover validation uses 400px minimum",
  );
  assert(
    !coverValidation.includes("width !== height"),
    "product cover validation no longer enforces strict 1:1 on client",
  );
  assert(
    !coverValidation.includes("1000 × 1000"),
    "product cover validation no longer requires 1000x1000 minimum",
  );
}

function testAuthorProfileBannerPreview() {
  const authorBanner = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorBannerUploadBlock.tsx",
    "utf8",
  );

  assert(
    authorBanner.includes("object-cover"),
    "banner preview uses object-cover",
  );
  assert(
    authorBanner.includes("objectPosition"),
    "banner preview uses saved object-position",
  );
  assert(
    authorBanner.includes("uploadHint"),
    "banner block uses shared upload hint",
  );
}

function testApiRouteUsesSharedImagePipeline() {
  const route = readFileSync(
    "/var/www/audiolad/src/app/api/author/profile/[kind]/route.ts",
    "utf8",
  );

  assert(
    route.includes("uploadOptimizedImageSet"),
    "author asset API uses shared image upload service",
  );
  assert(
    route.includes('"author-banner"') || route.includes("'author-banner'"),
    "author asset API includes author-banner profile",
  );
}

function run() {
  testDimensionRules();
  testFileMetaRules();
  testBannerConfigContract();
  testBannerHintAndMessages();
  testBannerUploadUsesDedicatedValidation();
  testProductCoverValidationRelaxed();
  testAuthorProfileBannerPreview();
  testApiRouteUsesSharedImagePipeline();
  console.log("author-banner-validation-unit: ok");
}

run();
