#!/usr/bin/env node
import { resolveProductCoverUrl } from "../src/lib/images/resolve-display.ts";
import { resolveAuthorAvatarUrl } from "../src/lib/images/resolve-display.ts";
import { parseImageManifest } from "../src/lib/images/image-manifest.ts";
import { buildPracticeFixtureCoverImage } from "./lib/fixture-marker.mjs";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const markerCover = buildPracticeFixtureCoverImage("image-safety", "run123");
const markerAvatar = buildPracticeFixtureCoverImage("image-safety", "run123");

assert(parseImageManifest(markerCover) === null, "marker-only cover_image must not parse as image manifest");

const coverUrl = resolveProductCoverUrl({
  cover_url: null,
  cover_image: markerCover,
  updated_at: "2026-07-20T00:00:00.000Z",
});

assert(coverUrl === null, "marker-only cover must not produce display URL");

const badObjectUrl = resolveProductCoverUrl({
  cover_url: "[object Object]",
  cover_image: markerCover,
  updated_at: null,
});

assert(badObjectUrl === null, "fixture marker must ignore corrupt cover_url fallback");

const avatarUrl = resolveAuthorAvatarUrl({
  avatar_url: null,
  avatar_image: markerAvatar,
  updated_at: "2026-07-20T00:00:00.000Z",
});

assert(avatarUrl === null, "marker-only avatar_image must not produce avatar URL");

if (failures.length) {
  console.error("fixture-marker-image-safety-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("fixture-marker-image-safety-unit: all checks passed");
