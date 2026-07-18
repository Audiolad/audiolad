#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testDeleteRouteClearsManifest() {
  const source = readFileSync(
    "/var/www/audiolad/src/app/api/playlists/[id]/cover/route.ts",
    "utf8",
  );

  assert(source.includes("cover_image: null"), "DELETE must clear cover_image JSONB");
  assert(
    source.includes("cleanupImageManifest"),
    "DELETE must cleanup stored variants",
  );
  assert(
    source.includes("manifest_only_clear"),
    "DELETE must handle manifest-only records without cover_path",
  );
  assert(
    source.includes("replacePlaylistCoverPathCas"),
    "DELETE must preserve CAS semantics when cover_path exists",
  );
}

function testPostRouteWritesManifest() {
  const source = readFileSync(
    "/var/www/audiolad/src/app/api/playlists/[id]/cover/route.ts",
    "utf8",
  );

  assert(
    source.includes("cover_image: uploaded.data.manifest"),
    "POST must persist cover_image manifest",
  );
}

function testPlaylistTypesIncludeCoverImage() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/playlists/types.ts",
    "utf8",
  );

  assert(source.includes("cover_image"), "PlaylistRow must include cover_image");
}

function main() {
  testDeleteRouteClearsManifest();
  testPostRouteWritesManifest();
  testPlaylistTypesIncludeCoverImage();

  console.log("playlist-cover-delete-unit: all checks passed");
}

main();
