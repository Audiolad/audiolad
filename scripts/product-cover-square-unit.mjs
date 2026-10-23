#!/usr/bin/env node
/**
 * Product and track covers must be stored as square files.
 * Non-square uploads are rejected unless the author crops them to 1:1 first.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  COVER_NOT_SQUARE_MESSAGE,
  decideCoverUploadAction,
} from "../src/lib/author-products/cover-validation-client.ts";
import { imageProcessErrorMessage } from "../src/lib/images/process-image.ts";
import { processImageForProfile } from "../src/lib/images/process-image.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

async function jpeg(width, height, orientation) {
  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 90, g: 40, b: 160 },
    },
  }).jpeg();

  if (orientation) {
    pipeline = pipeline.withMetadata({ orientation });
  }

  return pipeline.toBuffer();
}

function assertSquareVariants(result, label) {
  assert(result.ok, `${label} should process`);

  for (const variant of result.data.variants) {
    assert(
      variant.width === variant.height,
      `${label} ${variant.key} must be square, got ${variant.width}x${variant.height}`,
    );
    assert(variant.width > 0, `${label} ${variant.key} must have pixels`);
  }
}

async function testSquareSourceStaysSquare() {
  const result = await processImageForProfile(
    await jpeg(1000, 1000),
    "image/jpeg",
    "product-cover",
    { skipOriginalStore: true },
  );

  assertSquareVariants(result, "1000 product cover");
  assert(result.ok && result.data.sourceWidth === result.data.sourceHeight, "manifest source is square");
}

async function testNearSquareIsStoredSquare() {
  const result = await processImageForProfile(
    await jpeg(1000, 998),
    "image/jpeg",
    "track-cover",
    { skipOriginalStore: true },
  );

  assertSquareVariants(result, "998 track cover");
}

async function testRectangleRejected() {
  for (const profile of ["product-cover", "track-cover"]) {
    const landscape = await processImageForProfile(
      await jpeg(1600, 900),
      "image/jpeg",
      profile,
      { skipOriginalStore: true },
    );
    const portrait = await processImageForProfile(
      await jpeg(900, 1600),
      "image/jpeg",
      profile,
      { skipOriginalStore: true },
    );
    const almost = await processImageForProfile(
      await jpeg(1000, 997),
      "image/jpeg",
      profile,
      { skipOriginalStore: true },
    );

    for (const result of [landscape, portrait, almost]) {
      assert(!result.ok && result.code === "not_square", `${profile} rectangle rejected`);
      assert(
        imageProcessErrorMessage(result.code, profile) === COVER_NOT_SQUARE_MESSAGE,
        `${profile} fallback message`,
      );
    }
  }
}

async function testExifSquareStillAccepted() {
  const result = await processImageForProfile(
    await jpeg(1200, 1200, 6),
    "image/jpeg",
    "product-cover",
    { skipOriginalStore: true },
  );

  assertSquareVariants(result, "exif square product cover");
}

async function testPlaylistCoverStillAllowsLandscape() {
  const result = await processImageForProfile(
    await jpeg(1200, 800),
    "image/jpeg",
    "playlist-cover",
    { skipOriginalStore: true },
  );

  assert(result.ok, "playlist covers keep their own aspect rules");
}

function testUploadDecision() {
  assert(decideCoverUploadAction(800, 800, false).action === "upload", "square skips crop");
  assert(decideCoverUploadAction(1400, 800, true).action === "crop", "landscape crops");
  const blocked = decideCoverUploadAction(1400, 800, false);
  assert(
    blocked.action === "reject" && blocked.message === COVER_NOT_SQUARE_MESSAGE,
    "unavailable cropper blocks non-square covers",
  );
}

function testCropUiContract() {
  const hook = readSource("src/components/author-dashboard/useCoverUpload.ts");
  const block = readSource("src/components/author-dashboard/CoverUploadBlock.tsx");
  const modal = readSource("src/components/author-dashboard/CoverCropperModal.tsx");
  const cropper = readSource("src/components/images/AvatarCropperModal.tsx");
  const video = readSource(
    "src/components/author-dashboard/AuthorProductVideoExport.tsx",
  );
  const card = readSource("src/components/products/ProductCoverThumbnail.tsx");
  const practice = readSource(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );

  assert(hook.includes("decideCoverUploadAction"), "upload hook chooses crop or direct upload");
  assert(hook.includes("isCoverSquare"), "saved file is checked for 1:1 before upload");
  assert(block.includes("CoverCropperModal"), "cover block renders the cropper");
  assert(modal.includes("Кадрирование обложки"), "crop title");
  assert(modal.includes("Предпросмотр"), "crop preview label");
  assert(modal.includes("Использовать обложку"), "confirm label");
  assert(modal.includes('cropKind="cover"'), "cover crop kind");
  assert(!modal.includes("—"), "cover crop copy uses no em dash");
  assert(cropper.includes("Отмена"), "author can cancel the selection");
  assert(cropper.includes('type="range"'), "zoom slider for desktop and mobile");
  assert(cropper.includes("touch-none"), "touch drag stays on the crop surface");
  assert(cropper.includes("react-easy-crop"), "interactive cropper");
  assert(!video.includes("CoverCropperModal"), "video covers stay on their own path");
  assert(!video.includes("decideCoverUploadAction"), "video covers are not square-gated here");
  assert(card.includes("object-cover"), "product card shows the stored cover");
  assert(practice.includes("aspect-square"), "product page frame is square");
}

function testCropCancelAndFocusGuards() {
  const modal = readSource("src/components/images/AvatarCropperModal.tsx");
  const hook = readSource("src/components/author-dashboard/useCoverUpload.ts");

  assert(
    modal.includes("const isBusy = isSaving || isPreparing;"),
    "crop preparation must count as busy",
  );
  assert(
    /disabled=\{isBusy\}\s*onClick=\{onCancel\}/.test(modal),
    "Cancel must be disabled while the crop is prepared or saved",
  );
  assert(
    modal.includes("if (!mountedRef.current) {") &&
      modal.includes("await onConfirm(file);"),
    "closed dialog must not upload a pending crop",
  );
  assert(
    modal.includes("preparingRef.current = true;"),
    "repeated confirm clicks must not start parallel crops",
  );
  assert(
    modal.includes("dialogRef.current?.focus();") &&
      modal.includes('event.key !== "Tab"'),
    "dialog must take focus and keep Tab inside",
  );
  assert(
    /if \(!saved\) \{[\s\S]*?clearLocalPreview\(\);/.test(hook),
    "failed upload must drop the unsaved local preview",
  );
}

async function main() {
  await testSquareSourceStaysSquare();
  await testNearSquareIsStoredSquare();
  await testRectangleRejected();
  await testExifSquareStillAccepted();
  await testPlaylistCoverStillAllowsLandscape();
  testUploadDecision();
  testCropUiContract();
  testCropCancelAndFocusGuards();
  console.log("product-cover-square-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
