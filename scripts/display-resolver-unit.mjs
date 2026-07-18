#!/usr/bin/env node
import { readFileSync } from "node:fs";

import {
  buildImageSrcSetFromManifest,
  pickResponsiveVariantKey,
  resolveVariantPathFromManifest,
  buildCoverDisplayUrlFromManifest,
} from "../src/lib/images/image-url.ts";
import {
  parseImageManifest,
  sanitizePublicImageManifest,
  isOriginalStoragePath,
} from "../src/lib/images/image-manifest.ts";
import {
  resolveAuthorAvatarUrl,
  resolveProductCoverUrl,
} from "../src/lib/images/resolve-display.ts";
import { resolvePlaybackCoverUrl } from "../src/lib/products/cover-display.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sampleManifest = {
  version: 1,
  profile: "product-cover",
  versionId: "v1",
  sourceWidth: 1254,
  sourceHeight: 1254,
  variants: {
    xs: {
      path: "practice-covers/practices/p1/variants/v1/xs.webp",
      width: 120,
      height: 120,
      byteSize: 900,
      mimeType: "image/webp",
    },
    sm: {
      path: "practice-covers/practices/p1/variants/v1/sm.webp",
      width: 320,
      height: 320,
      byteSize: 2400,
      mimeType: "image/webp",
    },
    md: {
      path: "practice-covers/practices/p1/variants/v1/md.webp",
      width: 640,
      height: 640,
      byteSize: 5200,
      mimeType: "image/webp",
    },
    lg: {
      path: "practice-covers/practices/p1/variants/v1/lg.webp",
      width: 960,
      height: 960,
      byteSize: 8800,
      mimeType: "image/webp",
    },
  },
  originalPath: "practice-covers/practices/p1/originals/v1/original.jpg",
};

function testWidth168UsesSm() {
  const key = pickResponsiveVariantKey(168);
  assert(key === "sm" || key === "md", "168px cards should pick sm or md");

  const url = resolveProductCoverUrl(
    {
      cover_url: "https://legacy.test/old.png",
      cover_image: sampleManifest,
      updated_at: "2026-01-01T00:00:00Z",
    },
    168,
  );

  assert(url?.includes(`${key}.webp`), `168px should resolve to ${key} variant`);

  const srcSet = buildImageSrcSetFromManifest(
    sanitizePublicImageManifest(sampleManifest),
    (path) => path,
  );
  assert(srcSet?.includes(".webp"), "srcSet should include webp variants");
}

function testWidth350UsesMdOrLg() {
  const key = pickResponsiveVariantKey(350);
  assert(key === "md" || key === "lg", "350px should pick md or lg");

  const url = resolveProductCoverUrl(
    {
      cover_url: "https://legacy.test/old.png",
      cover_image: sampleManifest,
      updated_at: "2026-01-01T00:00:00Z",
    },
    350,
  );

  assert(url?.includes(".webp"), "350px should use manifest webp variant");
}

function testMiniPlayerMinimalVariant() {
  const key = pickResponsiveVariantKey(52);
  assert(key === "xs" || key === "sm", "mini player should pick minimal variant");
}

function testHeroUsesLg() {
  const url = resolveProductCoverUrl(
    {
      cover_url: "https://legacy.test/old.png",
      cover_image: sampleManifest,
      updated_at: null,
    },
    640,
    "lg",
  );

  assert(url?.includes("lg.webp"), "hero should use lg variant");
}

function testLegacyFallbackWithoutManifest() {
  const url = resolveProductCoverUrl(
    {
      cover_url: "https://legacy.test/cover.png",
      cover_image: null,
      updated_at: "2026-01-01T00:00:00Z",
    },
    168,
  );

  assert(url?.includes("cover.png"), "legacy URL should be used when manifest missing");
}

function testBrokenManifestFallsBackToLegacy() {
  const url = resolveProductCoverUrl(
    {
      cover_url: "https://legacy.test/cover.png",
      cover_image: { broken: true },
      updated_at: "2026-01-01T00:00:00Z",
    },
    168,
  );

  assert(url?.includes("cover.png"), "broken manifest should fall back to legacy URL");
}

function testTrackManifestMissingUsesProductManifest() {
  const key = pickResponsiveVariantKey(168);
  const url = resolvePlaybackCoverUrl(
    {
      cover_url: "https://legacy.test/product.png",
      cover_image: sampleManifest,
      updated_at: null,
      use_shared_cover: true,
    },
    {
      cover_url: "https://legacy.test/track.png",
      cover_image: null,
      updated_at: null,
    },
    168,
  );

  assert(url?.includes(`${key}.webp`), "product manifest should be used for track fallback");
}

function testBothManifestsMissingUsesLegacy() {
  const url = resolvePlaybackCoverUrl(
    {
      cover_url: "https://legacy.test/product.png",
      cover_image: null,
      updated_at: null,
      use_shared_cover: false,
    },
    {
      cover_url: "https://legacy.test/track.png",
      cover_image: null,
      updated_at: null,
    },
    168,
  );

  assert(url?.includes("track.png"), "legacy track cover should remain fallback");
}

function testPrivateSignedVariantSelection() {
  const avatarManifest = {
    ...sampleManifest,
    profile: "user-avatar",
    variants: {
      sm: sampleManifest.variants.sm,
    },
  };

  const url = resolveAuthorAvatarUrl(
    {
      avatar_url: "https://legacy.test/avatar.png",
      avatar_image: avatarManifest,
      updated_at: null,
    },
    104,
    "sm",
  );

  assert(url?.includes("sm.webp"), "avatar resolver should pick sm variant");
}

function testOriginalNeverSelectedForDisplay() {
  assert(
    isOriginalStoragePath(sampleManifest.originalPath),
    "fixture original path should be recognized",
  );

  const sanitized = sanitizePublicImageManifest(sampleManifest);
  assert(!sanitized?.originalPath, "public manifest must strip originalPath");

  for (const key of ["xs", "sm", "md", "lg"]) {
    const path = resolveVariantPathFromManifest(sampleManifest, key);
    assert(
      !path || !isOriginalStoragePath(path),
      `${key} display path must not be original storage`,
    );
  }

  const srcSet = buildImageSrcSetFromManifest(
    sanitized,
    (variantPath) => variantPath,
  );
  assert(!srcSet.includes("original"), "srcSet must not include original path");
}

function testPublicManifestSanitizationContract() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/images/image-manifest.ts",
    "utf8",
  );

  assert(source.includes("sanitizePublicImageManifest"), "sanitize helper exists");
  assert(source.includes("originalPath"), "originalPath handling exists");
}

function main() {
  testWidth168UsesSm();
  testWidth350UsesMdOrLg();
  testMiniPlayerMinimalVariant();
  testHeroUsesLg();
  testLegacyFallbackWithoutManifest();
  testBrokenManifestFallsBackToLegacy();
  testTrackManifestMissingUsesProductManifest();
  testBothManifestsMissingUsesLegacy();
  testPrivateSignedVariantSelection();
  testOriginalNeverSelectedForDisplay();
  testPublicManifestSanitizationContract();

  console.log("display-resolver-unit: all checks passed");
}

main();
