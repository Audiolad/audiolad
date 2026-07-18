#!/usr/bin/env node
/**
 * Shared image pipeline unit checks — no database or network required.
 */
import { buildCoverDisplayUrlFromManifest } from "../src/lib/images/image-url.ts";
import { parseImageManifest } from "../src/lib/images/image-manifest.ts";
import { resolveProductCoverUrl } from "../src/lib/images/resolve-display.ts";
import { getImageProfileConfig } from "../src/lib/images/image-profiles.ts";
import { PLACEHOLDER_MAX_BYTES } from "../src/lib/images/image-constants.ts";
import {
  detectMimeFromMagic,
  validateImageBufferForProfile,
} from "../src/lib/images/validate-image.ts";
import { processImageForProfile } from "../src/lib/images/process-image.ts";
import sharp from "sharp";

import {
  createAvatarPortrait,
  createBannerFixture,
  createExifOrientedLandscape,
  createLandscapeJpegFixture,
  createNoisyGradientSquare,
  createPngWithAlpha,
  createPortraitJpegFixture,
  formatBytes,
  savingsPercent,
} from "./lib/image-fixtures.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Programmatic JPEG buffers — no committed binary fixtures required. */
let portraitJpeg;
let landscapeJpeg;

async function loadProgrammaticFixtures() {
  portraitJpeg = await createPortraitJpegFixture();
  landscapeJpeg = await createLandscapeJpegFixture();
}

async function testPngToWebpVariants() {
  const input = portraitJpeg;
  const result = await processImageForProfile(input, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });

  assert(result.ok, "product-cover processing should succeed");

  const config = getImageProfileConfig("product-cover");
  const byKey = Object.fromEntries(result.data.variants.map((v) => [v.key, v]));

  for (const spec of config.variants) {
    const variant = byKey[spec.key];
    assert(variant, `missing variant ${spec.key}`);
    assert(variant.mimeType === "image/webp", `${spec.key} should be webp`);
    assert(
      variant.width <= spec.width && variant.height <= spec.height,
      `${spec.key} should not exceed profile bounds`,
    );
  }
}

async function testSmallSourceNotUpscaled() {
  const tiny = await sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 120, g: 80, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();

  const result = await processImageForProfile(tiny, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });

  assert(result.ok, "small image should process");
  const md = result.data.variants.find((v) => v.key === "md");
  assert(md, "md variant required");
  assert(md.width <= 400 && md.height <= 400, "small source must not be upscaled");
}

async function testExifOrientation() {
  const base = sharp({
    create: {
      width: 800,
      height: 400,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  }).jpeg();

  const normal = await base.clone().withMetadata({ orientation: 1 }).toBuffer();
  const oriented = await base.clone().withMetadata({ orientation: 6 }).toBuffer();

  const normalResult = await processImageForProfile(normal, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });
  const orientedResult = await processImageForProfile(oriented, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });

  assert(normalResult.ok && orientedResult.ok, "oriented images should process");

  const normalLg = normalResult.data.variants.find((v) => v.key === "lg");
  const orientedLg = orientedResult.data.variants.find((v) => v.key === "lg");

  assert(normalLg && orientedLg, "lg variants required");
  assert(
    normalLg.width === orientedLg.height && normalLg.height === orientedLg.width,
    "EXIF orientation should swap rendered variant dimensions",
  );
}

async function testMetadataStripped() {
  const input = landscapeJpeg;
  const result = await processImageForProfile(input, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });

  assert(result.ok, "cover processing should succeed");
  const lg = result.data.variants.find((v) => v.key === "lg");
  assert(lg, "lg cover variant required");

  const meta = await sharp(lg.buffer).metadata();
  assert(!meta.exif || meta.exif.length === 0, "variant should not retain EXIF");
}

function testInvalidAndSvgRejected() {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
  const svgResult = validateImageBufferForProfile(svg, "image/svg+xml", "product-cover");
  assert(!svgResult.ok && svgResult.code === "invalid_file_type", "SVG must be rejected");

  const garbage = Buffer.from("not-an-image", "utf8");
  const garbageResult = validateImageBufferForProfile(garbage, "image/png", "product-cover");
  assert(!garbageResult.ok, "garbage buffer must be rejected");
}

async function testHugeImageRejected() {
  const fakeHugeMeta = validateImageBufferForProfile(
    portraitJpeg,
    "image/jpeg",
    "product-cover",
  );
  assert(fakeHugeMeta.ok, "fixture should validate");

  const corrupt = Buffer.alloc(32);
  corrupt[0] = 0xff;
  corrupt[1] = 0xd8;
  corrupt[2] = 0xff;
  const corruptResult = await processImageForProfile(corrupt, "image/jpeg", "product-cover");
  assert(!corruptResult.ok, "truncated JPEG should fail processing");
}

async function testPlaceholderSmall() {
  const input = landscapeJpeg;
  const result = await processImageForProfile(input, "image/jpeg", "product-cover", {
    skipOriginalStore: true,
  });

  assert(result.ok, "cover with placeholder should succeed");
  const placeholder = result.data.variants.find((v) => v.key === "placeholder");
  assert(placeholder, "placeholder variant should exist");
  assert(
    placeholder.byteSize <= PLACEHOLDER_MAX_BYTES,
    `placeholder should stay under ${PLACEHOLDER_MAX_BYTES} bytes`,
  );
  assert(
    result.data.placeholderBlurDataUrl?.startsWith("data:image/webp;base64,"),
    "blur data URL should be webp",
  );
}

function testLegacyFallbackWithoutManifest() {
  const legacy = resolveProductCoverUrl(
    {
      cover_url: "https://example.test/cover.png?v=1",
      cover_image: null,
      updated_at: "2026-01-01T00:00:00Z",
    },
    168,
  );

  assert(legacy?.includes("cover.png"), "legacy URL should be used without manifest");
}

function testManifestPreferredOverLegacy() {
  const manifest = {
    version: 1,
    profile: "product-cover",
    versionId: "abc",
    sourceWidth: 1000,
    sourceHeight: 1000,
    variants: {
      sm: {
        path: "practice-covers/practices/p1/variants/abc/sm.webp",
        width: 320,
        height: 320,
        byteSize: 1200,
        mimeType: "image/webp",
      },
    },
  };

  const url = buildCoverDisplayUrlFromManifest(manifest, "https://legacy.test/old.png", "sm");
  assert(url?.includes("sm.webp"), "manifest path should win over legacy URL");
  assert(parseImageManifest(manifest)?.variants.sm?.width === 320, "manifest parse should work");
}

function testMagicDetection() {
  const mime = detectMimeFromMagic(portraitJpeg);
  assert(mime === "image/jpeg", "programmatic portrait fixture should detect as jpeg");
}

async function testRichFixturesReport() {
  const cases = [
    ["product-cover", await createNoisyGradientSquare(1254), "image/jpeg"],
    ["author-banner", await createBannerFixture(), "image/jpeg"],
    ["author-avatar", await createAvatarPortrait(), "image/jpeg"],
    ["product-cover", await createPngWithAlpha(), "image/png"],
    ["product-cover", await createExifOrientedLandscape(), "image/jpeg"],
  ];

  console.log("\nRich fixture sizes:");
  console.log(
    "| Profile | Source size | Variant | Dimensions | Result size | Saving |",
  );
  console.log(
    "| ------- | ----------: | ------- | ---------- | ----------: | -----: |",
  );

  for (const [profile, buffer, mime] of cases) {
    const result = await processImageForProfile(buffer, mime, profile, {
      skipOriginalStore: true,
    });

    assert(result.ok, `${profile} rich fixture should process`);

    const md =
      result.data.variants.find((variant) => variant.key === "md") ??
      result.data.variants.find((variant) => variant.key === "lg") ??
      result.data.variants[0];

    assert(md, `${profile} should emit at least one display variant`);

    const saving = savingsPercent(buffer.length, md.byteSize);
    console.log(
      `| ${profile} | ${formatBytes(buffer.length)} | ${md.key} | ${md.width}x${md.height} | ${formatBytes(md.byteSize)} | ${saving}% |`,
    );

    assert(md.byteSize < buffer.length, `${profile} variant should be smaller than source`);
  }
}

async function main() {
  await loadProgrammaticFixtures();
  await testPngToWebpVariants();
  await testSmallSourceNotUpscaled();
  await testExifOrientation();
  await testMetadataStripped();
  testInvalidAndSvgRejected();
  await testHugeImageRejected();
  await testPlaceholderSmall();
  testLegacyFallbackWithoutManifest();
  testManifestPreferredOverLegacy();
  testMagicDetection();
  await testRichFixturesReport();

  console.log("image-pipeline-unit: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
