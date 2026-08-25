import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asAsyncPlaylistSavesStore,
  createMemoryPlaylistSavesStore,
  createPlaylistSave,
  createSupabasePlaylistSavesStore,
  deletePlaylistSave,
  fromPlaylistSaveRow,
  hasPlaylistSave,
  listSavedPlaylistIds,
  PLAYLIST_SAVES_TABLE,
  toPlaylistSaveRow,
} from "../src/lib/playlists/playlist-saves";
import { LIBRARY_SAVES_TABLE } from "../src/lib/library/saves";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const saves = readFileSync(
  join(repoRoot, "src/lib/playlists/playlist-saves.ts"),
  "utf8",
);
const librarySaves = readFileSync(
  join(repoRoot, "src/lib/library/saves.ts"),
  "utf8",
);

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PLAYLIST = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function testCreateSave() {
  const store = createMemoryPlaylistSavesStore();
  const result = createPlaylistSave(store, {
    userId: USER,
    playlistId: PLAYLIST,
    createdAt: "2026-08-25T00:00:00.000Z",
  });

  assert.equal(result.created, true);
  assert.equal(result.save.userId, USER);
  assert.equal(result.save.playlistId, PLAYLIST);
  assert.equal(hasPlaylistSave(store, { userId: USER, playlistId: PLAYLIST }), true);
  assert.equal(store.listForUser(USER).length, 1);
}

function testDuplicateSaveDoesNotCreateSecondRow() {
  const store = createMemoryPlaylistSavesStore();
  const first = createPlaylistSave(store, {
    userId: USER,
    playlistId: PLAYLIST,
    createdAt: "2026-08-25T00:00:00.000Z",
  });
  const second = createPlaylistSave(store, {
    userId: USER,
    playlistId: PLAYLIST,
    createdAt: "2026-08-25T01:00:00.000Z",
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.save.createdAt, first.save.createdAt);
  assert.equal(store.listForUser(USER).length, 1);
}

function testDeleteSave() {
  const store = createMemoryPlaylistSavesStore();
  createPlaylistSave(store, { userId: USER, playlistId: PLAYLIST });

  const deleted = deletePlaylistSave(store, {
    userId: USER,
    playlistId: PLAYLIST,
  });
  const missing = deletePlaylistSave(store, {
    userId: USER,
    playlistId: PLAYLIST,
  });

  assert.equal(deleted.deleted, true);
  assert.equal(missing.deleted, false);
  assert.equal(hasPlaylistSave(store, { userId: USER, playlistId: PLAYLIST }), false);
}

function testIsolationByUser() {
  const store = createMemoryPlaylistSavesStore();
  createPlaylistSave(store, { userId: USER, playlistId: PLAYLIST });

  assert.equal(
    hasPlaylistSave(store, { userId: OTHER, playlistId: PLAYLIST }),
    false,
  );
  assert.equal(store.listForUser(OTHER).length, 0);
}

function testRowMapping() {
  const save = {
    userId: USER,
    playlistId: PLAYLIST,
    createdAt: "2026-08-25T00:00:00.000Z",
  };

  assert.deepEqual(toPlaylistSaveRow(save), {
    user_id: USER,
    playlist_id: PLAYLIST,
    created_at: "2026-08-25T00:00:00.000Z",
  });
  assert.deepEqual(fromPlaylistSaveRow(toPlaylistSaveRow(save)), save);
}

function testSeparateFromLibrarySaves() {
  assert.equal(PLAYLIST_SAVES_TABLE, "playlist_saves");
  assert.equal(LIBRARY_SAVES_TABLE, "library_saves");
  assert.notEqual(PLAYLIST_SAVES_TABLE, LIBRARY_SAVES_TABLE);
  assert.doesNotMatch(saves, /from\(["']library_saves["']\)/);
  assert.doesNotMatch(saves, /LIBRARY_SAVES_TABLE/);
  assert.doesNotMatch(saves, /practice_id/);
  assert.doesNotMatch(saves, /access_source/);
  assert.doesNotMatch(saves, /user_practices/);
  assert.doesNotMatch(librarySaves, /from\(["']playlist_saves["']\)/);
  assert.doesNotMatch(librarySaves, /PLAYLIST_SAVES_TABLE/);
  assert.match(saves, /createSupabasePlaylistSavesStore/);
}

async function testAsyncMemoryAdapterListsSavedIds() {
  const store = asAsyncPlaylistSavesStore(createMemoryPlaylistSavesStore());
  await store.insert({
    userId: USER,
    playlistId: PLAYLIST,
    createdAt: "2026-08-25T00:00:00.000Z",
  });

  const savedIds = await listSavedPlaylistIds(store, {
    userId: USER,
    playlistIds: [PLAYLIST, OTHER],
  });

  assert.deepEqual(savedIds, [PLAYLIST]);
}

async function testSupabaseAdapterUsesPlaylistSavesTable() {
  const calls: string[] = [];
  const supabase = {
    from(table: string) {
      calls.push(table);
      throw new Error("adapter_probe");
    },
  };

  const store = createSupabasePlaylistSavesStore(supabase as never);

  await assert.rejects(() => store.has(USER, PLAYLIST), /adapter_probe/);
  assert.deepEqual(calls, [PLAYLIST_SAVES_TABLE]);
}

testCreateSave();
testDuplicateSaveDoesNotCreateSecondRow();
testDeleteSave();
testIsolationByUser();
testRowMapping();
testSeparateFromLibrarySaves();
await testAsyncMemoryAdapterListsSavedIds();
await testSupabaseAdapterUsesPlaylistSavesTable();

console.log("playlist-saves-unit: ok");
