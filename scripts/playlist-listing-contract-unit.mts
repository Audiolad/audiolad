import assert from "node:assert/strict";

import { LISTING_ENTITY_CLASS } from "../src/lib/listing/entity-class";
import { EDITORIAL_PLAYLIST_LABEL } from "../src/lib/playlists/editorial-content";
import {
  decodePlaylistListingCursor,
  encodePlaylistListingCursor,
  isPlaylistListingClass,
  isProductListingClass,
  parsePlaylistListingLimit,
  parsePlaylistListingQuery,
  PLAYLIST_LISTING_FORBIDDEN_FIELDS,
  PLAYLIST_LISTING_PAGE_SIZE,
  playlistListingItemHasForbiddenField,
  resolvePlaylistListingCreatorName,
  toPlaylistListingItem,
} from "../src/lib/playlists/listing-contract";
import { USER_PLAYLIST_OWNER_LABEL } from "../src/lib/playlists/listing-labels";
import { CATALOG_KIND_FILTERS } from "../src/lib/catalog/listing-contract";

assert.equal(LISTING_ENTITY_CLASS.PLAYLIST, "playlist");
assert.equal(LISTING_ENTITY_CLASS.PRODUCT, "product");
assert.equal(isPlaylistListingClass("playlist"), true);
assert.equal(isProductListingClass("product"), true);
assert.equal(isPlaylistListingClass("product"), false);
assert.equal(
  (CATALOG_KIND_FILTERS as readonly string[]).includes("playlist"),
  false,
);

assert.equal(parsePlaylistListingLimit("20"), 20);
assert.equal(parsePlaylistListingLimit("99"), 50);
assert.equal(parsePlaylistListingLimit("0"), 1);
assert.equal(parsePlaylistListingQuery({ cursor: "  abc  " }).cursor, "abc");
assert.equal(
  parsePlaylistListingQuery({ limit: "20" }).limit,
  PLAYLIST_LISTING_PAGE_SIZE,
);

const cursor = encodePlaylistListingCursor(1_700_000_000_000, "pl-1");
assert.deepEqual(decodePlaylistListingCursor(cursor), {
  listedAtMs: 1_700_000_000_000,
  id: "pl-1",
});
assert.equal(decodePlaylistListingCursor("nope"), null);

assert.equal(
  resolvePlaylistListingCreatorName(true),
  EDITORIAL_PLAYLIST_LABEL,
);
assert.equal(
  resolvePlaylistListingCreatorName(false),
  USER_PLAYLIST_OWNER_LABEL,
);

const internalRow = {
  id: "pl-1",
  slug: "morning",
  title: "Утро",
  coverUrl: "/cover.jpg",
  items_count: 3,
  duration_seconds: 540,
  saves_count: 12,
  user_id: "should-not-leak",
  owner_type: "platform",
  created_by: "should-not-leak",
  cover_path: "owners/pl-1/cover.webp",
  direction_id: "dir-1",
  playlist_items: [{ practice_id: "p1" }],
};

const item = toPlaylistListingItem({
  source: {
    id: internalRow.id,
    slug: internalRow.slug,
    title: internalRow.title,
    coverUrl: internalRow.coverUrl,
    items_count: internalRow.items_count,
    duration_seconds: internalRow.duration_seconds,
    saves_count: internalRow.saves_count,
  },
  creator: resolvePlaylistListingCreatorName(true),
  topics: ["sleep"],
  access: "free",
  viewer: { saved: true },
});

assert.deepEqual(item, {
  class: "playlist",
  id: "pl-1",
  slug: "morning",
  href: "/p/morning",
  title: "Утро",
  coverUrl: "/cover.jpg",
  creator: EDITORIAL_PLAYLIST_LABEL,
  trackCount: 3,
  durationSeconds: 540,
  savesCount: 12,
  topics: ["sleep"],
  access: "free",
  viewer: { saved: true, playing: false },
});

assert.equal(playlistListingItemHasForbiddenField(item), false);

for (const field of PLAYLIST_LISTING_FORBIDDEN_FIELDS) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(item, field),
    false,
    `listing item must not expose ${field}`,
  );
}

assert.equal(
  Object.prototype.hasOwnProperty.call(item, "kind"),
  false,
  "playlist listing must not use product kind",
);

console.log("playlist-listing-contract-unit: ok");
