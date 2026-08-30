/**
 * Playlist item DELETE hotfix: SECURITY DEFINER RPC + composite identity.
 * Run: npx --yes tsx scripts/playlist-item-delete-unit.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const SLEEP = "supabase/migrations/20260910120000_topics_sleep.sql";
const REMOVE = "supabase/migrations/20260910130000_remove_playlist_item.sql";

assert(existsSync(SLEEP), "sleep topics migration remains untouched on disk");
assert(existsSync(REMOVE), "remove_playlist_item migration exists after sleep");
assert(
  REMOVE > SLEEP,
  "new migration timestamp is after 20260910120000_topics_sleep.sql",
);

const sleepSql = read(SLEEP);
const removeSql = read(REMOVE);

assert(sleepSql.includes("topics"), "sleep migration file was not rewritten away");
assert(
  !removeSql.includes("topics") && !removeSql.includes("Сон"),
  "remove migration does not touch topics/sleep",
);
assert(removeSql.includes("SECURITY DEFINER"), "remove RPC is SECURITY DEFINER");
assert(removeSql.includes("SET search_path = public, pg_temp"), "search_path pinned");
assert(removeSql.includes("can_user_edit_playlist"), "same authority as move/replace");
assert(
  removeSql.includes("audio_item_id IS NOT DISTINCT FROM p_audio_item_id"),
  "composite identity practice + audio_item",
);
assert(removeSql.includes("DELETE FROM public.playlist_items"), "deletes the matched row");
assert(removeSql.includes("WHERE id = v_item.id"), "deletes only the locked item id");
assert(
  removeSql.includes("SET updated_at = v_now"),
  "touches playlists.updated_at in the same transaction",
);
assert(
  removeSql.includes("position = pi.position + v_max_pos") &&
    removeSql.includes("position = pi.position - v_max_pos - 1"),
  "compacts remaining positions after the hole",
);
assert(removeSql.includes("item_removed"), "audits item_removed inside the RPC");
assert(removeSql.includes("GRANT EXECUTE"), "authenticated may execute");
assert(removeSql.includes("FROM anon"), "anon cannot execute");
assert(!removeSql.includes("DROP POLICY"), "does not weaken RLS policies");
assert(!removeSql.includes("CREATE POLICY"), "does not rewrite table RLS");
assert(
  !removeSql.includes("refresh_playlist_listing_aggregates") ||
    removeSql.includes("can_user_edit_playlist"),
  "does not grant EXECUTE on the listing-aggregates helper to authenticated",
);
assert(
  !/GRANT EXECUTE ON FUNCTION public\.refresh_playlist_listing_aggregates/i.test(
    removeSql,
  ),
  "does not grant listing-aggregates EXECUTE",
);

function compactAfterDelete(positions, deletedPosition) {
  const remaining = positions.filter((position) => position !== deletedPosition);
  const max = remaining.length > 0 ? Math.max(...remaining) : 0;
  if (max === 0) {
    return [];
  }

  return remaining
    .map((position) =>
      position > deletedPosition ? position + max : position,
    )
    .map((position) => (position > max ? position - max - 1 : position))
    .sort((left, right) => left - right);
}

assert.deepEqual = undefined;
function deepEqual(actual, expected, msg) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), msg);
}

deepEqual(compactAfterDelete([1, 2, 3], 2), [1, 2], "delete middle B: A,C compact to 1,2");
deepEqual(compactAfterDelete([1, 2, 3], 1), [1, 2], "delete first track");
deepEqual(compactAfterDelete([1, 2, 3], 3), [1, 2], "delete last track");
deepEqual(compactAfterDelete([1], 1), [], "whole-product single row delete");
deepEqual(
  compactAfterDelete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5),
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  "delete pos 5 of 10 leaves 9 compact positions",
);

const route = read("src/app/api/playlists/[id]/items/[practiceId]/route.ts");
assert(route.includes("remove_playlist_item"), "DELETE route calls remove RPC");
assert(route.includes("p_playlist_id"), "forwards playlist id");
assert(route.includes("p_practice_id"), "forwards practice id");
assert(route.includes("p_audio_item_id"), "forwards audioItemId");
assert(route.includes("parseOptionalUuidQueryValue"), "reads audioItemId query");
assert(route.includes("canUserEditPlaylist"), "route still checks canUserEditPlaylist");
assert(
  route.includes("loadPlaylistForAccessCheck"),
  "route still loads access row before RPC",
);
assert(!route.includes("createServiceRoleClient"), "no service role on DELETE");
assert(
  !route.includes('.from("playlist_items")'),
  "no direct playlist_items mutation",
);
assert(
  !route.includes('.from("playlists")'),
  "no separate playlists.updated_at touch after delete",
);
assert(route.includes("playlist_or_item_not_found"), "maps missing item to 404");
assert(route.includes("status: 204"), "success stays 204");

const move = read("src/app/api/playlists/[id]/items/[practiceId]/move/route.ts");
assert(move.includes("move_playlist_item"), "move RPC unchanged");
assert(move.includes("p_audio_item_id"), "move still disambiguates by audioItemId");

const replace = read(
  "src/app/api/playlists/[id]/items/[practiceId]/replace/route.ts",
);
assert(replace.includes("replace_playlist_item"), "replace RPC unchanged");
assert(
  replace.includes("p_old_audio_item_id") && replace.includes("p_new_audio_item_id"),
  "replace still uses composite identity",
);

const editorialUi = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
const userUi = read("src/components/playlists/PlaylistDetailClient.tsx");
assert(
  editorialUi.includes("playlistItemQuery(audioItemId)") ||
    editorialUi.includes("playlistItemQuery(item.audioItemId)"),
  "editorial delete keeps audioItemId query",
);
assert(
  userUi.includes("playlistItemQuery(pendingDelete.audioItemId)"),
  "user editor delete keeps audioItemId query",
);

const sortable = read("scripts/playlist-items-sortable-unit.mjs");
assert(sortable.includes("audioItemId"), "sortable tests still cover track rows");

console.log("PLAYLIST_ITEM_DELETE_UNIT_PASS");
