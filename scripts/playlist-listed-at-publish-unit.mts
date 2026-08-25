import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveListedAtOnPublish } from "../src/lib/playlists/listed-at";
import { parsePatchPlaylistBody } from "../src/lib/playlists/validation";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const publishedAt = "2026-08-25T12:00:00.000Z";
const existingListedAt = "2026-08-01T08:00:00.000Z";

assert.equal(
  resolveListedAtOnPublish({
    ownerType: "platform",
    isEditorial: true,
    currentListedAt: null,
    publishedAt,
  }),
  publishedAt,
  "editorial first publish stamps listed_at = published_at",
);

assert.equal(
  resolveListedAtOnPublish({
    ownerType: "platform",
    isEditorial: true,
    currentListedAt: existingListedAt,
    publishedAt,
  }),
  existingListedAt,
  "editorial republish keeps existing listed_at",
);

assert.equal(
  resolveListedAtOnPublish({
    ownerType: "platform",
    isEditorial: true,
    currentListedAt: "   ",
    publishedAt,
  }),
  publishedAt,
  "blank listed_at is treated as unset",
);

assert.equal(
  resolveListedAtOnPublish({
    ownerType: "user",
    isEditorial: false,
    currentListedAt: null,
    publishedAt,
  }),
  undefined,
  "user publish does not write listed_at",
);

assert.equal(
  resolveListedAtOnPublish({
    ownerType: "user",
    isEditorial: false,
    currentListedAt: existingListedAt,
    publishedAt,
  }),
  undefined,
  "user publish leaves existing listed_at untouched",
);

assert.equal(
  resolveListedAtOnPublish({
    ownerType: "user",
    isEditorial: true,
    currentListedAt: null,
    publishedAt,
  }),
  undefined,
  "non-platform editorial flag alone does not stamp listed_at",
);

assert.equal(
  resolveListedAtOnPublish({
    ownerType: "platform",
    isEditorial: false,
    currentListedAt: null,
    publishedAt,
  }),
  undefined,
  "platform non-editorial does not stamp listed_at",
);

assert.equal(
  parsePatchPlaylistBody({ listed_at: publishedAt }).ok,
  false,
  "listed_at is not a client-writable PATCH field",
);

const patchApi = read("src/app/api/playlists/[id]/route.ts");
assert.match(
  patchApi,
  /resolveListedAtOnPublish/,
  "PATCH publish uses listed_at helper",
);
assert.equal(
  [...patchApi.matchAll(/updates\.listed_at/g)].length,
  1,
  "PATCH writes listed_at in exactly one place",
);
assert.match(
  patchApi,
  /if \(listedAt !== undefined\) \{/,
  "PATCH writes listed_at only when helper returns a stamp",
);
assert.match(
  patchApi,
  /updates\.listed_at = listedAt/,
  "PATCH assigns helper result to listed_at",
);
assert.match(
  patchApi,
  /Keep allocated editorial slug after unpublish/,
  "unpublish path still keeps editorial slug",
);
assert.doesNotMatch(
  patchApi,
  /updates\.listed_at = null/,
  "unpublish does not write listed_at; clear trigger remains the writer",
);

const loader = read("src/lib/playlists/queries.ts");
assert.match(
  loader,
  /listed_at/,
  "owned playlist load reads listed_at for first-list stability",
);

const foundation = read(
  "supabase/migrations/20260825163000_playlist_catalog_foundation.sql",
);
assert.match(
  foundation,
  /clear_playlist_listed_at_when_unlisted/,
  "unpublish still relies on existing clear trigger",
);
assert.match(
  foundation,
  /NEW\.listed_at := NULL/,
  "clear trigger still nulls listed_at when unlisted",
);

const migrationName =
  "supabase/migrations/20260825166000_editorial_playlist_listed_at_backfill.sql";
assert.equal(existsSync(join(repoRoot, migrationName)), true, "backfill exists");
const backfill = read(migrationName);
assert.match(backfill, /SET listed_at = published_at/);
assert.match(backfill, /owner_type = 'platform'/);
assert.match(backfill, /is_editorial IS TRUE/);
assert.match(backfill, /visibility = 'public'/);
assert.match(backfill, /published_at IS NOT NULL/);
assert.match(backfill, /listed_at IS NULL/);
assert.match(backfill, /slug IS NOT NULL/);
assert.doesNotMatch(backfill, /owner_type = 'user'/);
assert.doesNotMatch(backfill, /DROP TABLE/i);
assert.doesNotMatch(backfill, /DROP TRIGGER/i);

console.log("playlist-listed-at-publish-unit: PASS");
