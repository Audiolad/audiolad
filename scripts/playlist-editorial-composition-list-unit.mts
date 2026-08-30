/**
 * Editorial playlist editor: one full composition list, no pagination.
 * Run: npx tsx scripts/playlist-editorial-composition-list-unit.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  movePlaylistItems,
  playlistItemReorderRequest,
} from "../src/lib/playlists/playlist-item-reorder";
import { PLAYLIST_MAX_ITEMS } from "../src/lib/playlists/types";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function makeItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    practiceId: `11111111-1111-4111-8111-11111111${String(index + 1).padStart(4, "0")}`,
    audioItemId: index === 3 ? "22222222-2222-4222-8222-222222222222" : null,
    position: index + 1,
    title: `Item ${index + 1}`,
  }));
}

function arrowControls(index: number, count: number) {
  return {
    canMoveUp: index !== 0,
    canMoveDown: count > 0 && index !== count - 1,
  };
}

assert.equal(PLAYLIST_MAX_ITEMS, 100, "composition cap stays 100");

const items = makeItems(30);
assert.equal(items.length, 30);

let next = movePlaylistItems(items, 21, 2);
assert.equal(next[2]?.title, "Item 22", "22→3 lands at index 2");
assert.equal(next[0]?.title, "Item 1", "22→3 keeps first item");
assert.equal(next[3]?.title, "Item 3", "22→3 shifts former 3 down");
assert.equal(next[21]?.title, "Item 21", "22→3 closes the gap");
assert.equal(
  playlistItemReorderRequest(items, 21, 2)?.targetPosition,
  3,
  "22→3 request uses absolute target position 3",
);
assert.equal(playlistItemReorderRequest(items, 21, 2)?.direction, "up");

next = movePlaylistItems(items, 0, 24);
assert.equal(next[24]?.title, "Item 1", "1→25 lands at index 24");
assert.equal(next[0]?.title, "Item 2", "1→25 promotes former 2");
assert.equal(
  playlistItemReorderRequest(items, 0, 24)?.targetPosition,
  25,
  "1→25 request uses absolute target position 25",
);
assert.equal(playlistItemReorderRequest(items, 0, 24)?.direction, "down");

next = movePlaylistItems(items, 24, 4);
assert.equal(next[4]?.title, "Item 25", "25→5 lands at index 4");
assert.equal(next[5]?.title, "Item 5", "25→5 shifts former 5 down");
assert.equal(
  playlistItemReorderRequest(items, 24, 4)?.targetPosition,
  5,
  "25→5 request uses absolute target position 5",
);
assert.equal(playlistItemReorderRequest(items, 24, 4)?.direction, "up");

next = movePlaylistItems(items, 29, 0);
assert.equal(next[0]?.title, "Item 30", "last→first");
assert.equal(next[29]?.title, "Item 29", "last→first former 29 stays last");
assert.equal(
  playlistItemReorderRequest(items, 29, 0)?.targetPosition,
  1,
  "last→first request uses absolute target position 1",
);
assert.equal(playlistItemReorderRequest(items, 29, 0)?.direction, "up");

assert.deepEqual(arrowControls(0, 30), {
  canMoveUp: false,
  canMoveDown: true,
});
assert.deepEqual(arrowControls(29, 30), {
  canMoveUp: true,
  canMoveDown: false,
});
assert.deepEqual(arrowControls(14, 30), {
  canMoveUp: true,
  canMoveDown: true,
});
assert.deepEqual(arrowControls(0, 1), {
  canMoveUp: false,
  canMoveDown: false,
});

const editor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);

assert.doesNotMatch(editor, /PAGE_SIZE/, "editorial editor has no PAGE_SIZE");
assert.doesNotMatch(editor, /\bpageCount\b/, "editorial editor has no pageCount");
assert.doesNotMatch(editor, /\bpageItems\b/, "editorial editor has no pageItems");
assert.doesNotMatch(editor, /setPage/, "editorial editor has no page state");
assert.doesNotMatch(
  editor,
  /useState\(0\)/,
  "editorial editor has no page useState(0)",
);
assert.doesNotMatch(editor, /\babsoluteFrom\b|\babsoluteTo\b/, "no page offset");
assert.doesNotMatch(
  editor,
  /page\s*\*\s*PAGE_SIZE/,
  "reorder/numbering do not add a page offset",
);
assert.doesNotMatch(
  editor,
  />\s*Назад\s*</,
  "composition list has no Назад pagination control",
);
assert.doesNotMatch(
  editor,
  />\s*Дальше\s*</,
  "composition list has no Дальше pagination control",
);
assert.doesNotMatch(
  editor,
  /page\s*\+\s*1\s*\/\s*\{pageCount\}/,
  "composition list has no N / M page indicator",
);

assert.match(editor, /items=\{items\}/, "sortable receives the full items list");
assert.match(
  editor,
  /playlistItemReorderRequest\(items, fromIndex, toIndex\)/,
  "reorder indexes are absolute",
);
assert.match(
  editor,
  /movePlaylistItems\(items, fromIndex, toIndex\)/,
  "optimistic move uses absolute indexes",
);
assert.match(
  editor,
  /const absoluteIndex = index;/,
  "row numbering uses the full-list index",
);
assert.match(
  editor,
  /disabled=\{absoluteIndex === 0 \|\| movingPracticeId !== null\}/,
  "first item cannot move up",
);
assert.match(
  editor,
  /absoluteIndex === items\.length - 1/,
  "last item cannot move down",
);
assert.match(editor, /PLAYLIST_MAX_ITEMS/, "editor still shows the 100-item cap");

const user = read("src/components/playlists/PlaylistDetailClient.tsx");
assert.doesNotMatch(
  user,
  /PAGE_SIZE/,
  "user playlist editor does not share editorial pagination",
);
assert.match(user, /items=\{items\}/, "user editor already uses the full list");

assert.match(editor, /confirmCompositionSaved/, "#222 composition toast remains");
assert.match(editor, /saveButton\.label/, "#222 save labels remain");
assert.match(
  editor,
  /editorial-playlist-save-feedback/,
  "#222 save-feedback module remains imported",
);

console.log("playlist-editorial-composition-list-unit: ok");
