#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

async function testMobileMimeInference() {
  const {
    resolveAvatarSourceMime,
    validateAvatarSourceFileMeta,
    isHeicLikeFile,
  } = await import("../src/lib/images/avatar-source-validation.ts");
  const { AVATAR_ERROR_MESSAGES } = await import("../src/lib/images/avatar-constants.ts");
  assert(
    resolveAvatarSourceMime({
      name: "фото.jpg",
      type: "",
    }) === "image/jpeg",
    "empty MIME with Cyrillic .jpg filename should infer jpeg",
  );
  assert(
    validateAvatarSourceFileMeta({
      name: "IMG_0001.JPG",
      type: "",
      size: 1024,
    }) === null,
    "iOS camera file with empty MIME should pass meta validation",
  );
  assert(
    validateAvatarSourceFileMeta({
      name: "photo",
      type: "image/jpeg",
      size: 1024,
    }) === null,
    "jpeg mime without extension should pass meta validation",
  );
}

async function testHeicHandling() {
  const { isHeicLikeFile, validateAvatarSourceFileMeta } = await import(
    "../src/lib/images/avatar-source-validation.ts"
  );
  const { AVATAR_ERROR_MESSAGES } = await import("../src/lib/images/avatar-constants.ts");
  assert(
    isHeicLikeFile({ name: "IMG_0001.HEIC", type: "" }),
    "HEIC extension should be detected",
  );
  assert(
    validateAvatarSourceFileMeta({
      name: "IMG_0001.HEIC",
      type: "image/heic",
      size: 1024,
    }) === null,
    "HEIC should defer to decode validation instead of hard unsupported error",
  );
  assert(
    AVATAR_ERROR_MESSAGES.heicUnsupported.includes("HEIC"),
    "HEIC unsupported message should mention HEIC explicitly",
  );
}

function testCropOutputFallbacks() {
  const cropCanvas = read("src/lib/images/avatar-crop-canvas.ts");
  assert(
    cropCanvas.includes("canvasToAvatarBlob"),
    "avatar crop should centralize blob encoding with fallbacks",
  );
  assert(
    cropCanvas.includes('"image/jpeg"'),
    "avatar crop should attempt jpeg encoding for mobile Safari compatibility",
  );
}

function testProfileAvatarEditorContract() {
  const editor = read("src/components/profile/ProfileAvatarEditor.tsx");
  assert(
    editor.includes("AVATAR_ERROR_MESSAGES.saveIncomplete"),
    "profile avatar editor should treat missing avatarUrl as failure",
  );
  assert(
    editor.includes("throw error;"),
    "profile avatar editor should propagate upload failures to crop hook",
  );
}

function testAvatarApiRevalidation() {
  const route = read("src/app/api/profile/avatar/route.ts");
  assert(route.includes('"/profile/edit"'), "avatar API should revalidate profile edit");
  assert(route.includes('"/settings"'), "avatar API should revalidate settings");
}

async function run() {
  await testMobileMimeInference();
  await testHeicHandling();
  testCropOutputFallbacks();
  testProfileAvatarEditorContract();
  testAvatarApiRevalidation();
  console.log("profile-avatar-save-regression-unit: ok");
}

await run();
