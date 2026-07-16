/**
 * Regression: /playlists list must filter by owner user_id (not rely on RLS alone).
 * Run: npx --yes tsx scripts/playlists-owned-list-validation-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { listOwnedPlaylists } from "../src/lib/playlists/queries.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PL_A_PRIVATE = "11111111-1111-4111-8111-111111111111";
const PL_A_PUBLIC = "22222222-2222-4222-8222-222222222222";
const PL_B_PUBLIC = "33333333-3333-4333-8333-333333333333";

const ALL_PLAYLIST_ROWS = [
  {
    id: PL_A_PRIVATE,
    user_id: USER_A,
    title: "A private",
    visibility: "private",
    slug: null,
    published_at: null,
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    cover_path: null,
    cover_updated_at: null,
    playlist_items: [{ count: 1 }],
  },
  {
    id: PL_A_PUBLIC,
    user_id: USER_A,
    title: "A public",
    visibility: "public",
    slug: "a-public-playlist",
    published_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    cover_path: null,
    cover_updated_at: null,
    playlist_items: [{ count: 2 }],
  },
  {
    id: PL_B_PUBLIC,
    user_id: USER_B,
    title: "B public",
    visibility: "public",
    slug: "b-public-playlist",
    published_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    cover_path: `${USER_B}/${PL_B_PUBLIC}/44444444-4444-4444-8444-444444444444.webp`,
    cover_updated_at: "2026-07-16T00:00:00.000Z",
    playlist_items: [{ count: 3 }],
  },
];

function createMockSupabase(expectedUserId) {
  let eqColumn = null;
  let eqValue = null;

  const queryBuilder = {
    eq(column, value) {
      eqColumn = column;
      eqValue = value;
      return queryBuilder;
    },
    order() {
      return queryBuilder;
    },
    then(onFulfilled, onRejected) {
      const data = ALL_PLAYLIST_ROWS.filter((row) => row.user_id === eqValue);
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };

  return {
    from(table) {
      assert(table === "playlists", "expected playlists table");
      return {
        select() {
          return queryBuilder;
        },
      };
    },
    rpc(name) {
      assert(name === "get_owned_playlist_mosaic_covers", "mosaic rpc");
      return Promise.resolve({ data: [], error: null });
    },
    getEqFilter() {
      return { column: eqColumn, value: eqValue, expectedUserId };
    },
  };
}

const queriesSrc = readFileSync(
  join(process.cwd(), "src/lib/playlists/queries.ts"),
  "utf8",
);
assert(
  queriesSrc.includes('.eq("user_id", userId)'),
  "listOwnedPlaylists must filter by user_id",
);
assert(
  queriesSrc.includes("playlist_list_user_required"),
  "listOwnedPlaylists must reject missing userId",
);

const publicDetailSrc = readFileSync(
  join(process.cwd(), "src/lib/playlists/public-detail.ts"),
  "utf8",
);
assert(
  publicDetailSrc.includes("loadPublicPlaylistBySlug"),
  "public loader must remain available",
);
assert(
  !publicDetailSrc.includes("listOwnedPlaylists"),
  "public loader must not depend on owned list query",
);

const coversSrc = readFileSync(
  join(process.cwd(), "src/lib/playlists/covers.ts"),
  "utf8",
);
assert(
  coversSrc.includes("playlist_cover_invalid_path_batch"),
  "batch invalid-path warning must remain",
);
assert(
  coversSrc.includes("isValidPlaylistCoverPath"),
  "cover path validation must remain strict",
);

const missingUser = await listOwnedPlaylists(createMockSupabase(USER_A), {
  userId: "   ",
});
assert(missingUser.error === "playlist_list_user_required", "blank userId rejected");
assert(missingUser.playlists.length === 0, "blank userId returns no playlists");

const supabase = createMockSupabase(USER_A);
const { playlists, error } = await listOwnedPlaylists(supabase, {
  userId: USER_A,
});

assert(error === null, `unexpected error: ${error ?? ""}`);
assert(playlists.length === 2, `expected 2 owned playlists, got ${playlists.length}`);

const ids = new Set(playlists.map((row) => row.id));
assert(ids.has(PL_A_PRIVATE), "private playlist of user A missing");
assert(ids.has(PL_A_PUBLIC), "public playlist of user A missing");
assert(!ids.has(PL_B_PUBLIC), "foreign public playlist must not appear in owned list");

const eqFilter = supabase.getEqFilter();
assert(eqFilter.column === "user_id", "must filter user_id column");
assert(eqFilter.value === USER_A, "must filter current session user");

const coverPaths = playlists
  .map((row) => row.cover_path)
  .filter((path) => typeof path === "string" && path.length > 0);
assert(
  coverPaths.every((path) => path.startsWith(`${USER_A}/`)),
  "batch signing must only receive cover paths owned by current user",
);

console.log("playlists-owned-list-validation-smoke: PASS");
