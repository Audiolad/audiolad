#!/usr/bin/env node
/**
 * Avatar crop math, output sizing, and source validation contract checks.
 */
import { readFileSync } from "node:fs";

import {
  clampCropAreaToImage,
  computeAvatarOutputSize,
  computeCoverMinZoom,
  isNearlySquare,
  restrictCropPosition,
} from "../src/lib/images/avatar-crop-math.ts";
import {
  AVATAR_MAX_BYTES,
  AVATAR_OUTPUT_SIZE,
  AVATAR_SQUARE_TOLERANCE_PX,
  AVATAR_UPLOAD_HINT,
} from "../src/lib/images/avatar-constants.ts";
import { validateAvatarSourceFileMeta } from "../src/lib/images/avatar-source-validation.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testCoverMinZoom() {
  assert(
    computeCoverMinZoom(2000, 1000, 360, 360) === 0.36,
    "landscape image should require zoom to cover square crop",
  );
  assert(
    computeCoverMinZoom(800, 1200, 300, 300) === 0.375,
    "portrait image should require zoom to cover square crop",
  );
  assert(
    computeCoverMinZoom(1000, 999, 400, 400) > 0.4,
    "almost-square image should still cover crop area",
  );
}

function testOutputSize() {
  assert(
    computeAvatarOutputSize(2000, 2000) === AVATAR_OUTPUT_SIZE,
    "large crop caps at avatar output size",
  );
  assert(
    computeAvatarOutputSize(480, 480) === 480,
    "small crop should not upscale beyond source",
  );
  assert(
    computeAvatarOutputSize(1001, 1001) === 1000,
    "1001px crop should cap at 1000",
  );
}

function testSquareTolerance() {
  assert(isNearlySquare(1000, 1000), "exact square passes");
  assert(isNearlySquare(1000, 999, AVATAR_SQUARE_TOLERANCE_PX), "1px off passes");
  assert(isNearlySquare(1000, 998, AVATAR_SQUARE_TOLERANCE_PX), "2px off passes");
  assert(
    !isNearlySquare(1000, 997, AVATAR_SQUARE_TOLERANCE_PX),
    "3px off fails strict server tolerance",
  );
}

function testClampCropArea() {
  const clamped = clampCropAreaToImage(
    { x: -10, y: 5, width: 500, height: 500 },
    480,
    640,
  );

  assert(clamped.x === 0, "crop x should clamp to image bounds");
  assert(clamped.width === 480, "crop width should clamp to image width");
  assert(clamped.height === 500, "crop height stays within image height");
}

function testRestrictCropPosition() {
  const restricted = restrictCropPosition(
    { x: 999, y: -999 },
    1000,
    800,
    360,
    360,
    1.2,
  );

  assert(Math.abs(restricted.x) <= 600, "crop position x stays within bounds");
  assert(Math.abs(restricted.y) <= 480, "crop position y stays within bounds");
}

function testAvatarSourceValidationAllowsNonSquare() {
  const jpegFile = {
    name: "portrait.jpg",
    type: "image/jpeg",
    size: 1024,
  };

  assert(
    validateAvatarSourceFileMeta(jpegFile) === null,
    "non-square source file meta should pass without aspect check",
  );

  const tooLarge = {
    name: "big.webp",
    type: "image/webp",
    size: AVATAR_MAX_BYTES + 1,
  };

  assert(
    validateAvatarSourceFileMeta(tooLarge)?.includes("3 МБ"),
    "oversized avatar source should be rejected",
  );

  const badType = {
    name: "photo.gif",
    type: "image/gif",
    size: 1024,
  };

  assert(
    validateAvatarSourceFileMeta(badType)?.includes("JPG"),
    "unsupported avatar mime should be rejected",
  );
}

function testCoverValidationStillRequiresSquareForProducts() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/author-products/cover-validation-client.ts",
    "utf8",
  );

  assert(
    source.includes('width !== height'),
    "product cover validation still enforces 1:1",
  );
  assert(
    source.includes("Обложка должна быть квадратной"),
    "product cover square error message preserved",
  );
}

function testAvatarUploadHintUpdated() {
  const authorProfile = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorProfileClient.tsx",
    "utf8",
  );

  assert(
    !authorProfile.includes("Квадратное изображение"),
    "author avatar hint no longer requires square source",
  );
  assert(
    authorProfile.includes("uploadHint"),
    "author avatar uses shared upload hint",
  );
  assert(
    AVATAR_UPLOAD_HINT.includes("вы сможете выбрать нужную область"),
    "shared avatar upload hint mentions cropping",
  );
}

function testSharedCropperComponentExists() {
  const cropper = readFileSync(
    "/var/www/audiolad/src/components/images/AvatarCropperModal.tsx",
    "utf8",
  );

  assert(cropper.includes("Настройте фотографию"), "cropper title");
  assert(cropper.includes("react-easy-crop"), "cropper uses react-easy-crop");
  assert(cropper.includes("restrictPosition"), "cropper prevents empty areas");
}

function testBannerHintUsesDedicatedValidation() {
  const authorProfile = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorProfileClient.tsx",
    "utf8",
  );

  assert(
    authorProfile.includes("uploadHint"),
    "banner block uses shared upload hint",
  );
  assert(
    !authorProfile.includes("validateCoverFile"),
    "author profile banner no longer uses product cover validation",
  );
}

function run() {
  testCoverMinZoom();
  testOutputSize();
  testSquareTolerance();
  testClampCropArea();
  testRestrictCropPosition();
  testAvatarSourceValidationAllowsNonSquare();
  testCoverValidationStillRequiresSquareForProducts();
  testAvatarUploadHintUpdated();
  testSharedCropperComponentExists();
  testBannerHintUsesDedicatedValidation();
  console.log("avatar-crop-unit: ok");
}

run();
