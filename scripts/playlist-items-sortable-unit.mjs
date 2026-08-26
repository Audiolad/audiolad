/**
 * Shared playlist editor DnD reorder — source + helper checks.
 * Run: npx --yes tsx scripts/playlist-items-sortable-unit.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseMovePlaylistItemBody } from "../src/lib/playlists/validation.ts";
import {
  movePlaylistItems,
  playlistItemReorderRequest,
  visiblePlaylistItems,
} from "../src/lib/playlists/playlist-item-reorder.ts";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function read(path) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const items = Array.from({ length: 15 }, (_, index) => ({
  practiceId: `11111111-1111-4111-8111-1111111111${String(index + 1).padStart(2, "0")}`,
  audioItemId: index === 3 ? "22222222-2222-4222-8222-222222222222" : null,
  position: index + 1,
  title: `Item ${index + 1}`,
}));

let next = movePlaylistItems(items, 14, 0);
assert(next[0]?.title === "Item 15" && next[14]?.title === "Item 14", "15->1");
assert(next !== items, "15->1 returns a new array");

next = movePlaylistItems(items, 0, 14);
assert(next[14]?.title === "Item 1" && next[0]?.title === "Item 2", "1->15");

next = movePlaylistItems(items, 7, 2);
assert(
  next[2]?.title === "Item 8" &&
    next[3]?.title === "Item 3" &&
    next[7]?.title === "Item 7",
  "8->3",
);

assert(movePlaylistItems(items, 4, 4) === items, "same index is a no-op");
assert(movePlaylistItems(items, -1, 2) === items, "invalid from is a no-op");

const lastToFirst = playlistItemReorderRequest(items, 14, 0);
assert(
  lastToFirst?.direction === "up" && lastToFirst.targetPosition === 1,
  "drop 15->1 sends up to position 1",
);

const firstToLast = playlistItemReorderRequest(items, 0, 14);
assert(
  firstToLast?.direction === "down" && firstToLast.targetPosition === 15,
  "drop 1->15 sends down to position 15",
);

const mid = playlistItemReorderRequest(items, 7, 2);
assert(
  mid?.direction === "up" &&
    mid.targetPosition === 3 &&
    mid.item.title === "Item 8",
  "drop 8->3 sends up to position 3",
);

assert(playlistItemReorderRequest(items, 2, 2) === null, "same index request is null");

const serverKey = items.map((item) => `${item.practiceId}:${item.position}`).join("|");
const optimistic = movePlaylistItems(items, 14, 0);
assert(
  visiblePlaylistItems(items, serverKey, { orderKey: serverKey, items: optimistic })[0]
    ?.title === "Item 15",
  "draft overlay wins while server key matches",
);
assert(
  visiblePlaylistItems(items, serverKey, {
    orderKey: "stale",
    items: optimistic,
  })[0]?.title === "Item 1",
  "stale draft falls back to server items",
);

let parsed = parseMovePlaylistItemBody({ direction: "up" });
assert(
  parsed.ok === true && parsed.targetPosition === null,
  "arrow body still works without targetPosition",
);

parsed = parseMovePlaylistItemBody({
  direction: "up",
  targetPosition: 1,
});
assert(
  parsed.ok === true && parsed.targetPosition === 1,
  "targetPosition accepted",
);

parsed = parseMovePlaylistItemBody({
  direction: "down",
  audioItemId: "22222222-2222-4222-8222-222222222222",
  targetPosition: 8,
});
assert(
  parsed.ok === true &&
    parsed.audioItemId === "22222222-2222-4222-8222-222222222222" &&
    parsed.targetPosition === 8,
  "audioItemId + targetPosition",
);

parsed = parseMovePlaylistItemBody({ direction: "up", targetPosition: 0 });
assert(parsed.ok === false, "targetPosition 0 rejected");

parsed = parseMovePlaylistItemBody({ direction: "up", targetPosition: 1.5 });
assert(parsed.ok === false, "fractional targetPosition rejected");

parsed = parseMovePlaylistItemBody({ direction: "up", position: 2 });
assert(parsed.ok === false, "legacy position key still rejected");

parsed = parseMovePlaylistItemBody({
  direction: "up",
  targetPosition: 1,
  extra: true,
});
assert(parsed.ok === false, "unknown keys rejected");

const pkg = JSON.parse(read("package.json"));
assert(pkg.dependencies["@dnd-kit/core"], "@dnd-kit/core installed");
assert(pkg.dependencies["@dnd-kit/sortable"], "@dnd-kit/sortable installed");
assert(pkg.dependencies["@dnd-kit/utilities"], "@dnd-kit/utilities installed");
assert(
  !pkg.dependencies["react-beautiful-dnd"] &&
    !pkg.dependencies["@hello-pangea/dnd"] &&
    !pkg.dependencies["sortablejs"],
  "no alternate dnd library",
);

const shared = read("src/components/playlists/PlaylistItemsSortableList.tsx");
assert(shared.includes("@dnd-kit/core"), "shared list uses dnd-kit core");
assert(shared.includes("@dnd-kit/sortable"), "shared list uses sortable");
assert(shared.includes("MouseSensor"), "mouse sensor");
assert(shared.includes("TouchSensor"), "touch sensor");
assert(shared.includes("activationConstraint"), "activation constraint");
assert(shared.includes("distance: 6"), "mouse distance constraint");
assert(shared.includes("delay: 200"), "touch delay constraint");
assert(shared.includes("onDragEnd"), "persist only on drop");
assert(!shared.includes("pointermove") && !shared.includes("onPointerMove"), "no pointer-math engine");
assert(shared.includes("PlaylistItemDragHandle"), "playlist-owned handle");
assert(!shared.includes("/api/author/products"), "not wired to author reorder API");
assert(!shared.includes("useAudioItemsReorder"), "does not reuse author reorder hook");

const handle = read("src/components/playlists/PlaylistItemDragHandle.tsx");
assert(handle.includes("data-playlist-drag-handle"), "handle marker");
assert(handle.includes("stopPropagation"), "handle does not start Play");
assert(handle.includes("touch-none"), "handle uses touch-none");
assert(!handle.includes("useAudioItemsReorder"), "handle is playlist-owned");

const row = read("src/components/playlists/PlaylistItemRow.tsx");
assert(row.includes("leadingControls"), "row accepts shared handle");

const editorial = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
const user = read("src/components/playlists/PlaylistDetailClient.tsx");
assert(editorial.includes("PlaylistItemsSortableList"), "editorial uses shared list");
assert(user.includes("PlaylistItemsSortableList"), "user editor uses shared list");
assert(editorial.includes("aria-label=\"Выше\"") && editorial.includes("↓"), "editorial arrows remain");
assert(user.includes("Переместить выше") && user.includes("Переместить ниже"), "user arrows remain");
assert(user.includes("items={items}"), "Play All uses current order");
assert(editorial.includes("targetPosition") && user.includes("targetPosition"), "drop sends targetPosition");
assert(editorial.includes("setDraft") && user.includes("setDraft"), "rollback on error");
assert(!editorial.includes("/api/author/products") && !user.includes("/api/author/products"), "no author API");
assert(
  !existsSync("src/components/playlists/editorial/EditorialPlaylistSortableList.tsx"),
  "no editorial-only sortable",
);
assert(
  !existsSync("src/components/playlists/UserPlaylistSortableList.tsx"),
  "no user-only sortable",
);

const route = read("src/app/api/playlists/[id]/items/[practiceId]/move/route.ts");
assert(route.includes("p_target_position"), "route forwards target position");
assert(route.includes("invalid_target_position"), "maps invalid target");
assert(!route.includes("createServiceRoleClient"), "no service role");

const migration = read(
  "supabase/migrations/20260826180000_move_playlist_item_target_position.sql",
);
assert(migration.includes("p_target_position integer"), "same RPC gains target position");
assert(migration.includes("move_playlist_item(uuid, uuid, text, uuid, integer)"), "5-arg function");
assert(migration.includes("NULL::integer"), "4-arg wraps 5-arg");
assert(!/CREATE TABLE/i.test(migration), "no new table");
assert(existsSync("supabase/tests/playlists_pr4_reorder_smoke.sql"), "sql smoke exists");
assert(
  read("supabase/tests/playlists_pr4_reorder_smoke.sql").includes(
    "move_playlist_item(uuid,uuid,text,uuid,integer)",
  ),
  "sql smoke covers 5-arg",
);

const publicPage = read("src/app/(platform)/p/[slug]/page.tsx");
assert(!publicPage.includes("PlaylistItemsSortableList"), "public page not edited for dnd");

assert(
  existsSync("src/components/author-dashboard/useAudioItemsReorder.ts"),
  "author dnd remains a separate domain",
);

console.log("PLAYLIST_ITEMS_SORTABLE_UNIT_PASS");
