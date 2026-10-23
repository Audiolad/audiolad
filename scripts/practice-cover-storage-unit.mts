/**
 * Product and track cover objects are written to Storage only through the
 * server cover routes (service_role after the access and 1:1 checks).
 * See docs/security/practice-covers-storage-write-policies.md.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupCoverManifestWithinPrefix,
  filterCoverPathsToPrefix,
  PRACTICE_COVERS_BUCKET,
  productCoverVariantPrefix,
  trackCoverVariantPrefix,
} from "../src/lib/author-products/cover-storage";
import type { ImageManifest } from "../src/lib/images/image-types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

const P = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";

// Prefixes
assert(productCoverVariantPrefix(P) === `practices/${P}/variants/`, "product prefix");
assert(
  trackCoverVariantPrefix(P, A) === `practices/${P}/track-covers/${A}/variants/`,
  "track prefix",
);
assert(PRACTICE_COVERS_BUCKET === "practice-covers", "bucket name");

// Prefix filter
const productPrefix = productCoverVariantPrefix(P);
const kept = filterCoverPathsToPrefix(
  [
    `practices/${P}/variants/v1/md.webp`,
    `practices/${P}/variants/v1/original.png`,
    `practices/${P}/variants/v1/md.webp`,
    `practices/${OTHER}/variants/v1/md.webp`,
    `practices/${P}/gallery/s1/variants/v1/md.webp`,
    `practices/${P}/track-covers/${A}/variants/v1/md.webp`,
    `practices/${P}/variants/../../${OTHER}/variants/v1/md.webp`,
    `practices/${P}/variants//x.webp`,
    `/practices/${P}/variants/v1/md.webp`,
    `practices/${P}/variants/`,
    "",
  ],
  productPrefix,
);
assert(
  JSON.stringify(kept) ===
    JSON.stringify([
      `practices/${P}/variants/v1/md.webp`,
      `practices/${P}/variants/v1/original.png`,
    ]),
  `product filter keeps only own variant paths: ${JSON.stringify(kept)}`,
);

const trackKept = filterCoverPathsToPrefix(
  [
    `practices/${P}/track-covers/${A}/variants/v2/lg.webp`,
    `practices/${P}/track-covers/other/variants/v2/lg.webp`,
    `practices/${P}/variants/v2/lg.webp`,
  ],
  trackCoverVariantPrefix(P, A),
);
assert(
  JSON.stringify(trackKept) ===
    JSON.stringify([`practices/${P}/track-covers/${A}/variants/v2/lg.webp`]),
  "track filter keeps only own track cover paths",
);
assert(filterCoverPathsToPrefix([`practices/${P}/x`], "") .length === 0, "empty prefix rejected");
assert(filterCoverPathsToPrefix([`practices/${P}/x`], `practices/${P}`).length === 0, "prefix must end with /");
assert(filterCoverPathsToPrefix(["a/../b/x"], "a/../b/").length === 0, "unsafe prefix rejected");

// Cleanup uses the scoped list only
const removed: Array<{ bucket: string; paths: string[] }> = [];
const fakeClient = {
  storage: {
    from(bucket: string) {
      return {
        async remove(paths: string[]) {
          removed.push({ bucket, paths });
          return { data: [], error: null };
        },
      };
    },
  },
} as unknown as Parameters<typeof cleanupCoverManifestWithinPrefix>[0];

const manifest: ImageManifest = {
  version: 1,
  versionId: "v1",
  profile: "product-cover",
  sourceWidth: 1000,
  sourceHeight: 1000,
  originalPath: `practices/${OTHER}/variants/v9/original.png`,
  variants: {
    md: {
      path: `practices/${P}/variants/v1/md.webp`,
      width: 640,
      height: 640,
      byteSize: 1,
      mimeType: "image/webp",
    },
    lg: {
      path: `practices/${OTHER}/gallery/s1/variants/v1/lg.webp`,
      width: 1280,
      height: 1280,
      byteSize: 1,
      mimeType: "image/webp",
    },
  },
};

const originalWarn = console.warn;
console.warn = () => undefined;
try {
  await cleanupCoverManifestWithinPrefix(fakeClient, manifest, productPrefix);
  await cleanupCoverManifestWithinPrefix(fakeClient, null, productPrefix);
  await cleanupCoverManifestWithinPrefix(
    fakeClient,
    { ...manifest, originalPath: undefined, variants: { lg: manifest.variants.lg } },
    productPrefix,
  );
} finally {
  console.warn = originalWarn;
}
assert(removed.length === 1, `exactly one remove call expected, got ${removed.length}`);
assert(removed[0].bucket === "practice-covers", "cleanup bucket");
assert(
  JSON.stringify(removed[0].paths) === JSON.stringify([`practices/${P}/variants/v1/md.webp`]),
  `cleanup removes only scoped paths: ${JSON.stringify(removed[0].paths)}`,
);

// Route wiring: every practice-covers write for covers goes through the
// service storage client, never through the user-scoped client.
const coverRoutes = [
  {
    path: "src/app/api/author/products/[id]/cover/route.ts",
    prefixFn: "productCoverVariantPrefix(id)",
    legacyRemove: "removePracticeCoverFiles(coverStorage, id)",
  },
  {
    path: "src/app/api/author/products/[id]/audio/[audioId]/cover/route.ts",
    prefixFn: "trackCoverVariantPrefix(id, audioId)",
    legacyRemove: "removeTrackCoverFiles(coverStorage, id, audioId)",
  },
];

for (const route of coverRoutes) {
  const text = source(route.path);
  assert(text.includes("createPracticeCoverStorageClient()"), `${route.path}: uses service cover storage`);
  assert(text.includes("storage: coverStorage.storage"), `${route.path}: uploads with cover storage`);
  assert(!text.includes("supabase.storage"), `${route.path}: no user-scoped storage access`);
  assert(!text.includes("cleanupImageManifest("), `${route.path}: no unscoped manifest cleanup`);
  assert(text.includes(route.prefixFn), `${route.path}: cleanup scoped to ${route.prefixFn}`);
  assert(text.includes(route.legacyRemove), `${route.path}: legacy cleanup via cover storage`);
  const access = text.indexOf("requirePracticeMutationAccess(");
  const firstStorage = text.indexOf("createPracticeCoverStorageClient()");
  assert(access >= 0 && firstStorage > access, `${route.path}: access check before storage client`);
  const decide = text.indexOf("uploadOptimizedImageSet(");
  assert(decide > firstStorage, `${route.path}: upload goes through the image pipeline`);
}

for (const path of [
  "src/app/api/author/products/[id]/audio/[audioId]/route.ts",
  "src/lib/author-products/course-builder.ts",
]) {
  const text = source(path);
  assert(!/removeTrackCoverFiles\(\s*supabase/.test(text), `${path}: no user-scoped track cover removal`);
  assert(
    /removeTrackCoverFiles\(\s*createPracticeCoverStorageClient\(\)/.test(text),
    `${path}: track cover removal via cover storage`,
  );
}

// utils.ts is imported by client components; it must stay free of the service client.
assert(
  !source("src/lib/author-products/utils.ts").includes("service-role"),
  "utils.ts must not import the service role client",
);
assert(
  !source("src/lib/author-products/cover-storage.ts").includes('"use client"'),
  "cover-storage.ts is server-only",
);

console.log("practice-cover-storage-unit: ok");
